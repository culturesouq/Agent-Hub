import crypto from 'crypto';
import { db, pool } from '@workspace/db';
import { operatorMemoryTable, messagesTable, conversationsTable } from '@workspace/db';
import { eq, and, isNull, isNotNull, inArray, desc } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion } from './openrouter.js';

export const MEMORY_TOP_N = 8;
export const MEMORY_MIN_SIMILARITY = 0.55;
export const MEMORY_MIN_WEIGHT = 0.1;
export const MEMORY_DECAY_RATE_PER_DAY = 0.05;
export const MEMORY_ARCHIVE_THRESHOLD = 0.05;

const DISTILL_MODEL = 'meta-llama/llama-3.3-70b-instruct';
const DISTILL_MESSAGE_LIMIT = 40;

export const MEMORY_TYPES = ['fact', 'preference', 'interaction', 'pattern', 'context'] as const;
export const SOURCE_TRUST_LEVELS = ['user', 'owner', 'ai_distilled'] as const;

export type MemoryType = typeof MEMORY_TYPES[number];
export type SourceTrustLevel = typeof SOURCE_TRUST_LEVELS[number];

export interface MemoryHit {
  id: string;
  content: string;
  memoryType: string;
  sourceTrustLevel: string | null;
  weight: number;
  similarity: number;
  createdAt: Date | null;
}

export interface DistilledMemory {
  content: string;
  memoryType: MemoryType;
  confidence: number;
}

export async function searchMemory(
  operatorId: string,
  embedding: number[],
  topN: number = MEMORY_TOP_N,
  minSimilarity: number = MEMORY_MIN_SIMILARITY,
  minWeight: number = MEMORY_MIN_WEIGHT,
): Promise<MemoryHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  const result = await pool.query<{
    id: string;
    content: string;
    memory_type: string;
    source_trust_level: string | null;
    weight: number;
    created_at: Date | null;
    distance: number;
  }>(
    `SELECT id, content, memory_type, source_trust_level, weight, created_at,
            (embedding <=> $1::vector) AS distance
     FROM operator_memory
     WHERE operator_id = $2
       AND embedding IS NOT NULL
       AND archived_at IS NULL
       AND weight >= $3
       AND (1 - (embedding <=> $1::vector)) >= $4
     ORDER BY distance ASC
     LIMIT $5`,
    [vecStr, operatorId, minWeight, minSimilarity, topN],
  );

  return result.rows.map((r) => ({
    id: r.id,
    content: r.content,
    memoryType: r.memory_type,
    sourceTrustLevel: r.source_trust_level,
    weight: Number(r.weight),
    similarity: 1 - Number(r.distance),
    createdAt: r.created_at,
  }));
}

export function buildMemoryContext(hits: MemoryHit[]): string {
  if (hits.length === 0) return '';
  return hits
    .map((h) => `[${h.memoryType}] (weight: ${h.weight.toFixed(2)}, similarity: ${(h.similarity * 100).toFixed(1)}%)\n${h.content}`)
    .join('\n\n');
}

export async function storeMemory(
  operatorId: string,
  ownerId: string,
  content: string,
  memoryType: MemoryType,
  sourceTrustLevel: SourceTrustLevel = 'user',
  weight: number = 1.0,
  startDecay: boolean = false,
): Promise<typeof operatorMemoryTable.$inferSelect> {
  const embedding = await embed(content);

  const [memory] = await db.insert(operatorMemoryTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId,
    content,
    embedding: embedding as unknown as string,
    memoryType,
    sourceTrustLevel,
    weight,
    decayStartedAt: startDecay ? new Date() : undefined,
  }).returning();

  return memory;
}

export async function decayMemoriesForOperator(operatorId?: string): Promise<{
  decayed: number;
  archived: number;
}> {
  let query = db
    .select()
    .from(operatorMemoryTable)
    .where(
      and(
        isNotNull(operatorMemoryTable.decayStartedAt),
        isNull(operatorMemoryTable.archivedAt),
      ),
    );

  if (operatorId) {
    query = db
      .select()
      .from(operatorMemoryTable)
      .where(
        and(
          eq(operatorMemoryTable.operatorId, operatorId),
          isNotNull(operatorMemoryTable.decayStartedAt),
          isNull(operatorMemoryTable.archivedAt),
        ),
      );
  }

  const memories = await query;
  if (memories.length === 0) return { decayed: 0, archived: 0 };

  let decayed = 0;
  let archived = 0;

  for (const memory of memories) {
    const currentWeight = memory.weight ?? 1.0;
    const newWeight = Math.max(0, currentWeight - MEMORY_DECAY_RATE_PER_DAY);
    const shouldArchive = newWeight <= MEMORY_ARCHIVE_THRESHOLD;

    await db.update(operatorMemoryTable)
      .set({
        weight: newWeight,
        archivedAt: shouldArchive ? new Date() : undefined,
      })
      .where(eq(operatorMemoryTable.id, memory.id));

    decayed++;
    if (shouldArchive) archived++;
  }

  return { decayed, archived };
}

function buildDistillPrompt(
  operatorName: string,
  messages: { role: string; content: string }[],
): string {
  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 400)}`)
    .join('\n');

  return `You are analysing a conversation transcript to extract persistent memory entries for an AI agent named "${operatorName}".

Extract only factual, preference, interaction pattern, or context information that would be genuinely useful for this agent to remember across future conversations. Do NOT extract trivial greetings or one-time tasks.

Memory types:
- "fact" — objective facts stated by the user (name, location, occupation, etc.)
- "preference" — user preferences or working style (likes, dislikes, how they prefer information)
- "interaction" — patterns in how the user interacts (e.g., "always asks for numbered steps")
- "pattern" — recurring topics or themes in conversations
- "context" — situational context relevant to future sessions

## Transcript
${transcript}

## Phrasing instruction
Write each memory so it can be retrieved by the QUESTIONS a user will ask in future conversations — not just what they literally said. Include likely retrieval keywords. For example, instead of "User is planning to expand into vegetable farming, specifically tomatoes", write "User plans to expand their farm — next crop is tomatoes, vegetable farming expansion planned for next year".

Respond ONLY with valid JSON:
{
  "memories": [
    {
      "content": "<retrieval-optimized, third-person memory statement>",
      "memoryType": "fact" | "preference" | "interaction" | "pattern" | "context",
      "confidence": <0.0–1.0 how certain this extraction is>
    }
  ]
}

Return an empty memories array if nothing worth persisting was found. Never fabricate.`;
}

export async function distillMemoriesFromConversations(
  operatorId: string,
  ownerId: string,
  operatorName: string,
): Promise<{ stored: number; extracted: number; memories: DistilledMemory[] }> {
  const convs = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.operatorId, operatorId))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(5);

  if (convs.length === 0) {
    return { stored: 0, extracted: 0, memories: [] };
  }

  const convIds = convs.map((c) => c.id);
  const messages = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(inArray(messagesTable.conversationId, convIds))
    .orderBy(desc(messagesTable.createdAt))
    .limit(DISTILL_MESSAGE_LIMIT);

  if (messages.length === 0) {
    return { stored: 0, extracted: 0, memories: [] };
  }

  const prompt = buildDistillPrompt(operatorName, messages.reverse());
  const result = await chatCompletion([{ role: 'user', content: prompt }], DISTILL_MODEL);

  let distilled: DistilledMemory[] = [];
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in distillation response');
    const parsed = JSON.parse(jsonMatch[0]);
    distilled = (parsed.memories ?? []).filter(
      (m: DistilledMemory) =>
        m.content?.trim() &&
        MEMORY_TYPES.includes(m.memoryType) &&
        typeof m.confidence === 'number',
    );
  } catch (err) {
    throw new Error(`Memory distillation parse failed: ${(err as Error).message}`);
  }

  const highConfidence = distilled.filter((m) => m.confidence >= 0.7);

  let stored = 0;
  for (const m of highConfidence) {
    try {
      const embedding = await embed(m.content);
      const vecStr = `[${embedding.join(',')}]`;
      const dupCheck = await pool.query<{ distance: number }>(
        `SELECT (embedding <=> $1::vector) AS distance
         FROM operator_memory
         WHERE operator_id = $2
           AND embedding IS NOT NULL
           AND archived_at IS NULL
         ORDER BY distance ASC
         LIMIT 1`,
        [vecStr, operatorId],
      );
      if (dupCheck.rows.length > 0 && (1 - dupCheck.rows[0].distance) > 0.92) {
        console.log(`[memory] skipped duplicate — similarity: ${(1 - dupCheck.rows[0].distance).toFixed(3)}`);
        continue;
      }
      await storeMemory(operatorId, ownerId, m.content, m.memoryType, 'ai_distilled', m.confidence);
      stored++;
    } catch {
      // individual embedding failure should not abort the batch
    }
  }

  return { stored, extracted: distilled.length, memories: distilled };
}
