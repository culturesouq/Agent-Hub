import crypto from 'crypto';
import { db, pool } from '@workspace/db';
import { operatorMemoryTable, operatorMainMemoryTable, messagesTable, conversationsTable, operatorsTable } from '@workspace/db';
import { eq, and, isNull, isNotNull, inArray, desc } from 'drizzle-orm';
import { embed } from '@workspace/opsoul-utils/ai';
import { chatCompletion } from './openrouter.js';
import { verifyAndStore } from './kbIntake.js';

export const MEMORY_TOP_N = 8;
export const MEMORY_MIN_SIMILARITY = 0.55;
export const MEMORY_MIN_WEIGHT = 0.1;
export const MEMORY_DECAY_RATE_PER_DAY = 0.05;
export const MEMORY_ARCHIVE_THRESHOLD = 0.05;

const DISTILL_MODEL = 'moonshotai/kimi-k2.6';
const DISTILL_MESSAGE_LIMIT = 20;

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
  layer: 1 | 2;
}

export interface DistilledMemory {
  content: string;
  memoryType: MemoryType;
  confidence: number;
}

// ─── LAYER 1 — Endpoint Memory (scope-strict, PII ok) ────────────────────────

export async function searchLayer1Memory(
  operatorId: string,
  scopeId: string,
  embedding: number[],
  topN: number = MEMORY_TOP_N,
  minSimilarity: number = MEMORY_MIN_SIMILARITY,
  minWeight: number = MEMORY_MIN_WEIGHT,
): Promise<MemoryHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  const result = await pool.query<{
    id: string; content: string; memory_type: string;
    source_trust_level: string | null; weight: number;
    created_at: Date | null; distance: number;
  }>(
    `SELECT id, content, memory_type, source_trust_level, weight, created_at,
            (embedding <=> $1::vector) AS distance
     FROM operator_memory
     WHERE operator_id = $2
       AND scope_id = $3
       AND embedding IS NOT NULL
       AND archived_at IS NULL
       AND weight >= $4
       AND (1 - (embedding <=> $1::vector)) >= $5
     ORDER BY distance ASC
     LIMIT $6`,
    [vecStr, operatorId, scopeId, minWeight, minSimilarity, topN],
  );

  return result.rows.map((r) => ({
    id: r.id, content: r.content, memoryType: r.memory_type,
    sourceTrustLevel: r.source_trust_level, weight: Number(r.weight),
    similarity: 1 - Number(r.distance), createdAt: r.created_at, layer: 1 as const,
  }));
}

// ─── LAYER 2 — Main Memory (PII-free, GROW-eligible) ─────────────
//
// Two consumers of Layer 2 with different scope semantics:
//
//   1. CHAT path (this function, called via `searchMemory`): MUST be
//      scope-bound. The Layer 2 entry was distilled from a specific
//      conversation in a specific scope; it must not surface back to a
//      different scope in chat. Otherwise a memory distilled from a
//      Nahil farmer's conversation could appear in the owner's workspace,
//      or a memory from the WhatsApp channel could appear in a Hub UI
//      chat. That is the cross-scope pollution incident category.
//
//      → When `requestScope` is provided, restrict to entries whose
//        `source_scope` matches exactly. When not provided (legacy
//        callers, defensive default), no scope restriction is applied
//        and the function logs a warning.
//
//   2. GROW path (`getMainMemoryContext` in growEngine.ts): genuinely
//      cross-scope by design. GROW aggregates patterns from all scopes
//      to evolve the operator. That function does NOT call this one and
//      runs its own un-scoped query — see growEngine.ts.

export async function searchLayer2Memory(
  operatorId: string,
  embedding: number[],
  topN: number = MEMORY_TOP_N,
  minSimilarity: number = MEMORY_MIN_SIMILARITY,
  requestScope?: string,
): Promise<MemoryHit[]> {
  const vecStr = `[${embedding.join(',')}]`;

  if (!requestScope) {
    console.warn('[searchLayer2Memory] called without requestScope — falling back to operator-wide query (no scope isolation). Caller should pass current scopeId.');
  }

  const baseSql = `SELECT id, content, memory_type, confidence, created_at,
            (embedding <=> $1::vector) AS distance
     FROM operator_main_memory
     WHERE operator_id = $2
       AND embedding IS NOT NULL
       AND archived_at IS NULL
       AND grow_eligible = TRUE
       AND (1 - (embedding <=> $1::vector)) >= $3`;

  const result = requestScope
    ? await pool.query<{
        id: string; content: string; memory_type: string;
        confidence: number; created_at: Date | null; distance: number;
      }>(
        `${baseSql}
         AND source_scope = $5
         ORDER BY distance ASC
         LIMIT $4`,
        [vecStr, operatorId, minSimilarity, topN, requestScope],
      )
    : await pool.query<{
        id: string; content: string; memory_type: string;
        confidence: number; created_at: Date | null; distance: number;
      }>(
        `${baseSql}
         ORDER BY distance ASC
         LIMIT $4`,
        [vecStr, operatorId, minSimilarity, topN],
      );

  return result.rows.map((r) => ({
    id: r.id, content: r.content, memoryType: r.memory_type,
    sourceTrustLevel: 'ai_distilled',
    weight: Number(r.confidence),
    similarity: 1 - Number(r.distance),
    createdAt: r.created_at, layer: 2 as const,
  }));
}

// ─── Combined search — Layer 1 (if scopeId) + Layer 2, merged and ranked ──────

export async function searchMemory(
  operatorId: string,
  embedding: number[],
  topN: number = MEMORY_TOP_N,
  minSimilarity: number = MEMORY_MIN_SIMILARITY,
  minWeight: number = MEMORY_MIN_WEIGHT,
  scopeId?: string,
): Promise<MemoryHit[]> {
  const hasRealScope = scopeId && scopeId !== 'legacy' && scopeId !== 'action' && scopeId !== 'public';

  const [layer1Hits, layer2Hits] = await Promise.all([
    hasRealScope
      ? searchLayer1Memory(operatorId, scopeId!, embedding, topN, minSimilarity, minWeight)
      : Promise.resolve([] as MemoryHit[]),
    // Pass the current scopeId so Layer 2 retrieval is scope-bound at chat time.
    // Cross-scope pollution (one scope's memory surfacing in another scope's
    // chat) is architecturally prevented here. GROW retrieval has its own
    // path in growEngine.ts that intentionally aggregates across scopes.
    searchLayer2Memory(operatorId, embedding, topN, minSimilarity, scopeId),
  ]);

  // Merge, deduplicate by id, rank by similarity descending
  const seen = new Set<string>();
  const merged: MemoryHit[] = [];
  for (const hit of [...layer1Hits, ...layer2Hits]) {
    if (!seen.has(hit.id)) {
      seen.add(hit.id);
      merged.push(hit);
    }
  }
  merged.sort((a, b) => b.similarity - a.similarity);
  return merged.slice(0, topN);
}

export function buildMemoryContext(hits: MemoryHit[]): string {
  if (hits.length === 0) return '';
  return hits
    .map((h) => `[${h.memoryType}] (weight: ${h.weight.toFixed(2)}, similarity: ${(h.similarity * 100).toFixed(1)}%)\n${h.content}`)
    .join('\n\n');
}

// ─── Store Layer 1 memory (endpoint memory, PII ok, scope-bound) ─────────────

/**
 * Distill noisy raw content (web search hits, scraped pages) into a single
 * clean fact the operator can actually learn from. Strips URLs, snippet
 * boilerplate, formatting artifacts.
 *
 * Returns null when there's nothing worth remembering — caller should skip the
 * store rather than persist noise.
 */
export async function distillRawContentForMemory(
  rawContent: string,
  context: string,
): Promise<string | null> {
  const trimmed = rawContent.trim();
  if (trimmed.length < 40) return null;

  const prompt = `You are filtering raw content (web search results or scraped page text) into a single clean fact for an operator's long-term memory.

Context: ${context}

Raw content (often noisy — URLs, snippet fragments, formatting artifacts, repeated boilerplate):
${trimmed.slice(0, 3000)}

Extract the single most useful factual takeaway. Strip URLs, dates, navigation text, snippet markers, and any formatting. Output ONE sentence the operator can recall later — under 240 characters, no markdown, no quotes.

If the content has no clear factual takeaway worth remembering long-term, output exactly: NONE`;

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      DISTILL_MODEL,
    );
    const text = result.content.trim().replace(/^["'`]+|["'`]+$/g, '');
    if (text === 'NONE' || text.length < 15 || text.length > 280) return null;
    return text;
  } catch {
    return null;
  }
}

export async function storeMemory(
  operatorId: string,
  ownerId: string,
  content: string,
  memoryType: MemoryType,
  sourceTrustLevel: SourceTrustLevel = 'user',
  weight: number = 1.0,
  startDecay: boolean = false,
  scopeId?: string,
  scopeTrust?: string,
): Promise<typeof operatorMemoryTable.$inferSelect> {
  const embedding = await embed(content);

  const [memory] = await db.insert(operatorMemoryTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId,
    content,
    embedding,
    memoryType,
    sourceTrustLevel,
    weight,
    decayStartedAt: startDecay ? new Date() : undefined,
    scopeId: scopeId ?? 'legacy',
    scopeTrust: scopeTrust ?? 'owner',
  }).returning();

  return memory;
}

// ─── Store Layer 2 memory (main memory, PII-free, GROW-eligible) ─────────────

export async function storeMainMemory(
  operatorId: string,
  ownerId: string,
  content: string,
  memoryType: MemoryType,
  confidence: number,
  sourceScope: string,
): Promise<typeof operatorMainMemoryTable.$inferSelect> {
  const embedding = await embed(content);
  const vecStr = `[${embedding.join(',')}]`;

  // Dedup: skip if a very similar insight already exists (>85% cosine similarity)
  const dupCheck = await pool.query<{ id: string; distance: number }>(
    `SELECT id, (embedding <=> $1::vector) AS distance
     FROM operator_main_memory
     WHERE operator_id = $2
       AND embedding IS NOT NULL
       AND archived_at IS NULL
     ORDER BY distance ASC
     LIMIT 1`,
    [vecStr, operatorId],
  );
  if (dupCheck.rows.length > 0 && (1 - dupCheck.rows[0].distance) > 0.85) {
    const [existing] = await db
      .select()
      .from(operatorMainMemoryTable)
      .where(eq(operatorMainMemoryTable.id, dupCheck.rows[0].id));
    return existing;
  }

  // Platform-candidate flag retained on the row for the future Operator Insight
  // Network. The old Vael-id exclusion guard was removed alongside the rag_dna
  // teardown (2026-05-15); every operator is now eligible to surface memories
  // as platform candidates. OIN handles scoping + verification at query time,
  // not by excluding source operators here.
  const PLATFORM_ELIGIBLE_TYPES: MemoryType[] = ['fact', 'pattern', 'context'];
  const isPlatformCandidate =
    confidence >= 0.85 &&
    PLATFORM_ELIGIBLE_TYPES.includes(memoryType);

  const [memory] = await db.insert(operatorMainMemoryTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId,
    content,
    embedding,
    memoryType,
    confidence,
    sourceScope,
    weight: confidence,
    growEligible: confidence >= 0.80,
    platformCandidate: isPlatformCandidate,
  }).returning();

  return memory;
}

// ─── Decay Layer 1 memories ───────────────────────────────────────────────────

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

// ─── Distillation prompts ─────────────────────────────────────────────────────

function buildLayer1DistillPrompt(
  operatorName: string,
  messages: { role: string; content: string }[],
): string {
  const transcript = messages
    .map((m) => `${m.role === 'assistant' ? 'OPERATOR' : 'USER'}: ${m.content.slice(0, 400)}`)
    .join('\n');

  return `You are analysing a conversation transcript to extract persistent memory entries for an Operator named "${operatorName}".

## Role clarification — CRITICAL
In the transcript below:
- OPERATOR = the AI Operator ("${operatorName}")
- USER = the human having the conversation

Memories you extract are things "${operatorName}" should remember ABOUT THE HUMAN USER across future conversations.

Extract only factual, preference, interaction pattern, or context information that would be genuinely useful for this Operator to remember across future conversations. Do NOT extract trivial greetings or one-time tasks.

Memory types:
- "fact" — objective facts stated by the user (name, location, occupation, etc.)
- "preference" — user preferences or working style
- "interaction" — patterns in how the user interacts
- "pattern" — recurring topics or themes
- "context" — situational context relevant to future sessions

## Transcript
${transcript}

## Phrasing instruction
Write each memory so it can be retrieved by the QUESTIONS a user will ask in future conversations. Include likely retrieval keywords.

CRITICAL: Memories are about the HUMAN (USER role). Always write them as "User ..." — NEVER as "${operatorName} ..." unless capturing the operator's behaviour toward this specific user.

Respond ONLY with valid JSON:
{
  "memories": [
    {
      "content": "<retrieval-optimized memory statement>",
      "memoryType": "fact" | "preference" | "interaction" | "pattern" | "context",
      "confidence": <0.0–1.0>
    }
  ]
}

Return an empty memories array if nothing worth persisting was found. Never fabricate.`;
}

function buildLayer2DistillPrompt(
  operatorName: string,
  messages: { role: string; content: string }[],
): string {
  const transcript = messages
    .map((m) => `${m.role === 'assistant' ? 'OPERATOR' : 'USER'}: ${m.content.slice(0, 400)}`)
    .join('\n');

  return `You are extracting general, anonymised insights from a conversation for the operator "${operatorName}" to learn from at a population level.

## ABSOLUTE RULE — ZERO PII
Every insight MUST be completely stripped of all personally identifiable information:
- No names (person or company)
- No locations (city, country, building)
- No identifiers (phone numbers, emails, IDs)
- No relationship references ("a CEO named...", "someone from XYZ")

Transform specifics into general patterns:
- "Ahmed, CEO of XYZ Trading, has cash flow problems" → "Business owners in trading struggle with cash flow management"
- "Sara in Dubai wants weekly updates" → "Users in professional roles prefer regular progress updates"
- "Mohammed asked about halal investments" → "Users ask about ethically-aligned investment options"

Extract only insights that are genuinely useful for understanding how people in this domain think, ask, and struggle. Skip trivial exchanges.

## Transcript
${transcript}

Respond ONLY with valid JSON:
{
  "insights": [
    {
      "content": "<general, fully anonymised insight>",
      "memoryType": "fact" | "preference" | "interaction" | "pattern" | "context",
      "confidence": <0.0–1.0 — how confident this is a general truth, not a one-off>
    }
  ]
}

Return an empty insights array if nothing generalisable was found. Never include any PII under any condition.`;
}

// ─── Distill from conversations — Layer 1 + Layer 2 ─────────────────────────

export async function distillMemoriesFromConversations(
  operatorId: string,
  ownerId: string,
  operatorName: string,
  scopeId?: string,
  scopeTrust?: string,
): Promise<{ storedLayer1: number; storedLayer2: number; extracted: number; memories: DistilledMemory[] }> {
  const hasRealScope = scopeId && scopeId !== 'legacy' && scopeId !== 'action' && scopeId !== 'public';

  // Get recent conversations — scoped for Layer 1, all for Layer 2
  const convQuery = db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.operatorId, operatorId),
        hasRealScope ? eq(conversationsTable.scopeId, scopeId!) : undefined,
      ),
    )
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(5);

  const convs = await convQuery;
  if (convs.length === 0) return { storedLayer1: 0, storedLayer2: 0, extracted: 0, memories: [] };

  const convIds = convs.map((c) => c.id);
  const messages = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(inArray(messagesTable.conversationId, convIds))
    .orderBy(desc(messagesTable.createdAt))
    .limit(DISTILL_MESSAGE_LIMIT);

  if (messages.length === 0) return { storedLayer1: 0, storedLayer2: 0, extracted: 0, memories: [] };

  const chronoMessages = messages.reverse();

  // ── Run both distillation prompts in parallel ─────────────────────────────
  const [layer1Result, layer2Result] = await Promise.allSettled([
    chatCompletion([{ role: 'user', content: buildLayer1DistillPrompt(operatorName, chronoMessages) }], DISTILL_MODEL),
    chatCompletion([{ role: 'user', content: buildLayer2DistillPrompt(operatorName, chronoMessages) }], DISTILL_MODEL),
  ]);

  let storedLayer1 = 0;
  let storedLayer2 = 0;
  const allDistilled: DistilledMemory[] = [];

  // ── Layer 1: store scoped endpoint memories ───────────────────────────────
  if (hasRealScope && layer1Result.status === 'fulfilled') {
    try {
      const jsonMatch = layer1Result.value.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const distilled: DistilledMemory[] = (parsed.memories ?? []).filter(
          (m: DistilledMemory) =>
            m.content?.trim() &&
            MEMORY_TYPES.includes(m.memoryType) &&
            typeof m.confidence === 'number',
        );

        allDistilled.push(...distilled);

        for (const m of distilled.filter((m) => m.confidence >= 0.80)) {
          try {
            const embedding = await embed(m.content);
            const vecStr = `[${embedding.join(',')}]`;
            const dupCheck = await pool.query<{ distance: number }>(
              `SELECT (embedding <=> $1::vector) AS distance
               FROM operator_memory
               WHERE operator_id = $2
                 AND scope_id = $3
                 AND embedding IS NOT NULL
                 AND archived_at IS NULL
               ORDER BY distance ASC LIMIT 1`,
              [vecStr, operatorId, scopeId],
            );
            if (dupCheck.rows.length > 0 && (1 - dupCheck.rows[0].distance) > 0.85) continue;

            await storeMemory(operatorId, ownerId, m.content, m.memoryType, 'ai_distilled', m.confidence, false, scopeId, scopeTrust);
            storedLayer1++;
          } catch { /* individual failure should not abort batch */ }
        }
      }
    } catch (err) {
      console.warn('[memory] Layer 1 distill parse failed:', (err as Error).message);
    }
  }

  // ── Layer 2: store PII-stripped main memory insights ─────────────────────
  if (layer2Result.status === 'fulfilled') {
    try {
      const jsonMatch = layer2Result.value.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const insights: DistilledMemory[] = (parsed.insights ?? []).filter(
          (m: DistilledMemory) =>
            m.content?.trim() &&
            MEMORY_TYPES.includes(m.memoryType) &&
            typeof m.confidence === 'number' &&
            m.confidence >= 0.80,
        );

        for (const insight of insights) {
          try {
            await storeMainMemory(
              operatorId,
              ownerId,
              insight.content,
              insight.memoryType,
              insight.confidence,
              scopeId ?? 'owner',
            );

            // Promote high-confidence insights to KB via curiosity engine
            if (insight.confidence >= 0.85) {
              const operatorRow = await db.select({ mandate: operatorsTable.mandate })
                .from(operatorsTable)
                .where(eq(operatorsTable.id, operatorId))
                .limit(1);
              const mandate = operatorRow[0]?.mandate ?? '';

              const { curiositySearch } = await import('./curiosityEngine.js');
              const curiosity = await curiositySearch(insight.content, operatorId, mandate);
              if (curiosity.verified && curiosity.corroborated) {
                verifyAndStore(operatorId, ownerId, insight.content, curiosity.bestSource, 'ai_distilled', mandate).catch(() => {});
              }
            }

            storedLayer2++;
          } catch { /* individual failure should not abort batch */ }
        }
      }
    } catch (err) {
      console.warn('[memory] Layer 2 distill parse failed:', (err as Error).message);
    }
  }

  return { storedLayer1, storedLayer2, extracted: allDistilled.length, memories: allDistilled };
}

// ─── Action scope task pattern memory ────────────────────────────────────────
// Action scope has no conversations to distill from. Each action invocation
// produces a structured request → result pair. We synthesize a PII-free task
// pattern memory so action scope contributes to GROW like every other scope.

export async function distillActionTaskPattern(
  operatorId: string,
  ownerId: string,
  operatorName: string,
  action: string,
  payload: Record<string, unknown> | null,
  resultContent: string,
): Promise<void> {
  const payloadShape = payload && Object.keys(payload).length > 0
    ? Object.keys(payload).join(', ')
    : 'none';
  const resultPreview = resultContent.slice(0, 400);

  const prompt = `${operatorName} just executed an action via the structured action API.

Action: ${action}
Payload field names (no values): ${payloadShape}
Result preview (first 400 chars): ${resultPreview}

Extract one PII-free task pattern that captures what kind of work this operator handles via the action API. Generalize away from this specific request — focus on the type of task, the kind of input, the kind of output. Examples: "Generates short marketing copy from product details", "Translates Arabic feedback into English summaries", "Returns sentiment scores for review text".

Strip every concrete name, number, brand, person, place, URL, code identifier — keep only the schema-level pattern.

Return strict JSON: { "pattern": "<one sentence>", "confidence": <0.0-1.0> }
Confidence 0.85+ only when the action implies a clearly repeatable task type. Lower for one-off or ambiguous actions.`;

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      DISTILL_MODEL,
    );
    const match = result.content.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as { pattern?: string; confidence?: number };
    if (
      parsed.pattern &&
      typeof parsed.confidence === 'number' &&
      parsed.confidence >= 0.80
    ) {
      await storeMainMemory(
        operatorId,
        ownerId,
        parsed.pattern,
        'pattern',
        parsed.confidence,
        'action',
      );
    }
  } catch {
    /* non-fatal — task pattern distillation is best-effort */
  }
}
