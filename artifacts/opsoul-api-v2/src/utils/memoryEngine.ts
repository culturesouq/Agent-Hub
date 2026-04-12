import crypto from 'crypto';
import { db, pool } from '@workspace/db-v2';
import {
  operatorMemoryTable,
  messagesTable,
  conversationsTable,
  operatorsTable,
} from '@workspace/db-v2';
import { eq, and, isNull, isNotNull, desc } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion } from './openrouter.js';

export const MEMORY_TOP_N = 8;
export const MEMORY_MIN_SIMILARITY = 0.55;
export const MEMORY_MIN_WEIGHT = 0.1;
export const MEMORY_DECAY_RATE_PER_DAY = 0.05;
export const MEMORY_ARCHIVE_THRESHOLD = 0.05;

const DISTILL_MODEL = 'anthropic/claude-haiku-4-5';
const DISTILL_MESSAGE_LIMIT = 20;

export const MEMORY_TYPES = ['fact', 'preference', 'interaction', 'pattern', 'context', 'instruction'] as const;
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
  scopeId?: string,
): Promise<MemoryHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  let scopeClause = '';
  const params: (string | number)[] = [vecStr, operatorId, minWeight, minSimilarity, topN];

  if (scopeId) {
    params.push(scopeId);
    scopeClause = `AND (scope_id = $${params.length} OR scope_id IS NULL)`;
  }

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
     FROM opsoul_v3.operator_memory
     WHERE operator_id = $2
       AND embedding IS NOT NULL
       AND archived_at IS NULL
       AND weight >= $3
       AND (1 - (embedding <=> $1::vector)) >= $4
       ${scopeClause}
     ORDER BY distance ASC
     LIMIT $5`,
    params,
  );

  return result.rows.map(r => ({
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
    .map(h => `[${h.memoryType}] (weight: ${h.weight.toFixed(2)}, similarity: ${(h.similarity * 100).toFixed(1)}%)\n${h.content}`)
    .join('\n\n');
}

export async function storeMemory(
  operatorId: string,
  ownerId: string,
  content: string,
  memoryType: MemoryType,
  sourceTrustLevel: SourceTrustLevel = 'ai_distilled',
  weight: number = 1.0,
  scopeId?: string,
): Promise<string> {
  let embedding: number[] | null = null;
  try {
    embedding = await embed(content);
  } catch {
    // store without embedding — still useful for display
  }

  const id = crypto.randomUUID();
  await db.insert(operatorMemoryTable).values({
    id,
    operatorId,
    ownerId,
    content,
    embedding: embedding ?? undefined,
    memoryType,
    sourceTrustLevel,
    weight,
    scopeId: scopeId ?? null,
    scopeTrust: scopeId ? 'slot' : 'owner',
  });

  return id;
}

export async function distillMemoriesFromConversations(
  operatorId: string,
  ownerId: string,
  operatorName: string,
): Promise<void> {
  const convs = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.operatorId, operatorId), eq(conversationsTable.ownerId, ownerId)))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(3);

  for (const conv of convs) {
    const msgs = await db
      .select({ role: messagesTable.role, content: messagesTable.content })
      .from(messagesTable)
      .where(and(eq(messagesTable.conversationId, conv.id), eq(messagesTable.isInternal, false)))
      .orderBy(desc(messagesTable.createdAt))
      .limit(DISTILL_MESSAGE_LIMIT);

    if (msgs.length < 4) continue;

    const transcript = msgs
      .reverse()
      .map(m => `${m.role === 'user' ? 'Owner' : operatorName}: ${m.content}`)
      .join('\n');

    const prompt = `Extract durable memories from this conversation between an owner and their AI Operator "${operatorName}".

Conversation:
${transcript}

Return a JSON array of memory objects. Each object: { "content": "...", "memoryType": "fact|preference|pattern|instruction|context", "confidence": 0.0-1.0 }

Rules:
- Only extract what is DURABLE — preferences, facts about the owner, behavioral patterns, standing instructions
- Ignore ephemeral responses, greetings, or one-off data
- Max 5 entries. Return [] if nothing durable is present
- Return ONLY valid JSON array, no markdown

Example: [{"content":"Owner prefers concise responses under 3 sentences","memoryType":"preference","confidence":0.85}]`;

    try {
      const result = await chatCompletion(
        [
          { role: 'system', content: 'You extract durable memories from conversations. Return only a JSON array.' },
          { role: 'user', content: prompt },
        ],
        { model: DISTILL_MODEL },
      );

      const raw = typeof result.content === 'string' ? result.content : '';
      const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
      const memories = JSON.parse(cleaned) as DistilledMemory[];

      for (const mem of memories) {
        if (!mem.content || mem.confidence < 0.6) continue;
        const memType = MEMORY_TYPES.includes(mem.memoryType as MemoryType) ? mem.memoryType as MemoryType : 'fact';
        await storeMemory(operatorId, ownerId, mem.content, memType, 'ai_distilled', mem.confidence);
      }
    } catch {
      // distillation failed — skip silently
    }
  }
}

export async function decayMemoriesForOperator(operatorId?: string): Promise<{
  decayed: number;
  archived: number;
}> {
  const baseConditions = [
    isNotNull(operatorMemoryTable.decayStartedAt),
    isNull(operatorMemoryTable.archivedAt),
  ];

  const memories = operatorId
    ? await db
        .select()
        .from(operatorMemoryTable)
        .where(and(eq(operatorMemoryTable.operatorId, operatorId), ...baseConditions))
    : await db
        .select()
        .from(operatorMemoryTable)
        .where(and(...baseConditions));

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
