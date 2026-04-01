import crypto from 'crypto';
import { db } from '@workspace/db';
import {
  operatorsTable,
  growProposalsTable,
  growBlockedLogTable,
  selfAwarenessStateTable,
  messagesTable,
  conversationsTable,
} from '@workspace/db';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { chatCompletion } from './openrouter.js';
import type { Layer2Soul } from '../validation/operator.js';

const GROW_MODEL = 'anthropic/claude-sonnet-4-5';
const RECENT_MESSAGES_LIMIT = 50;

export interface GrowEvaluation {
  approved: (keyof Layer2Soul)[];
  rejected: (keyof Layer2Soul)[];
  needsOwnerReview: (keyof Layer2Soul)[];
  reasoning: string;
  safetyFlags: string[];
  proposedChanges: Partial<Layer2Soul>;
  shouldApply: boolean;
}

async function getRecentMessages(operatorId: string): Promise<{ role: string; content: string }[]> {
  const convs = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.operatorId, operatorId))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(5);

  if (convs.length === 0) return [];

  const convIds = convs.map((c) => c.id);
  const messages = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(inArray(messagesTable.conversationId, convIds))
    .orderBy(desc(messagesTable.createdAt))
    .limit(RECENT_MESSAGES_LIMIT);

  return messages.reverse();
}

function buildGrowPrompt(
  operator: typeof operatorsTable.$inferSelect,
  recentMessages: { role: string; content: string }[],
  selfAwareness: typeof selfAwarenessStateTable.$inferSelect | null,
): string {
  const soul = operator.layer2Soul as Layer2Soul;
  const sampleConversation = recentMessages
    .slice(-20)
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}`)
    .join('\n');

  const awarenessContext = selfAwareness
    ? `\nSelf-Awareness State:\n${JSON.stringify(selfAwareness.identityState ?? {}, null, 2)}`
    : '';

  return `You are evaluating an AI agent's soul (Layer 2 identity) for potential evolution via the GROW system.

## Current Agent Profile
- Name: ${operator.name}
- Archetype: ${operator.archetype}
- Mandate: ${operator.mandate}
- Core Values: ${(operator.coreValues ?? []).join(', ')}
${awarenessContext}

## Current Soul (Layer 2)
${JSON.stringify(soul, null, 2)}

## Recent Conversations (sample)
${sampleConversation || 'No recent conversations.'}

## Your Task
Analyse the agent's recent conversations against its current soul definition. Determine whether any soul fields should evolve to better serve the agent's mandate and core values.

For each soul field, decide: APPROVE (safe evolution), REJECT (harmful or mandate-violating), NEEDS_OWNER_REVIEW (uncertain/significant change), or KEEP (no change needed).

GROWTH RULES:
1. Never propose changes that violate Layer 0 Human Core principles.
2. Never propose changes that contradict the agent's archetype or mandate.
3. Approve only incremental, evidence-based improvements grounded in actual conversation patterns.
4. Flag any change that significantly alters the agent's fundamental character for owner review.
5. If no meaningful evolution is warranted, return empty proposedChanges.

Respond ONLY with valid JSON in this exact structure:
{
  "proposedChanges": {
    "personalityTraits"?: string[],
    "toneProfile"?: string,
    "communicationStyle"?: string,
    "emotionalRange"?: string,
    "decisionMakingStyle"?: string,
    "conflictResolution"?: string,
    "quirks"?: string[],
    "valuesManifestation"?: string[]
  },
  "fieldDecisions": {
    "<fieldName>": "APPROVE" | "REJECT" | "NEEDS_OWNER_REVIEW" | "KEEP"
  },
  "reasoning": "<concise explanation of what changed and why>",
  "safetyFlags": ["<any concerns>"],
  "mandateAlignment": "<how proposals align with mandate>"
}`;
}

function parseClaudeResponse(raw: string): {
  proposedChanges: Partial<Layer2Soul>;
  fieldDecisions: Record<string, 'APPROVE' | 'REJECT' | 'NEEDS_OWNER_REVIEW' | 'KEEP'>;
  reasoning: string;
  safetyFlags: string[];
} {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude returned no valid JSON');
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    proposedChanges: parsed.proposedChanges ?? {},
    fieldDecisions: parsed.fieldDecisions ?? {},
    reasoning: parsed.reasoning ?? '',
    safetyFlags: parsed.safetyFlags ?? [],
  };
}

function categoriseFields(
  fieldDecisions: Record<string, 'APPROVE' | 'REJECT' | 'NEEDS_OWNER_REVIEW' | 'KEEP'>,
  growLockLevel: string,
): { approved: (keyof Layer2Soul)[]; rejected: (keyof Layer2Soul)[]; needsOwnerReview: (keyof Layer2Soul)[] } {
  const approved: (keyof Layer2Soul)[] = [];
  const rejected: (keyof Layer2Soul)[] = [];
  const needsOwnerReview: (keyof Layer2Soul)[] = [];

  for (const [field, decision] of Object.entries(fieldDecisions)) {
    const key = field as keyof Layer2Soul;
    if (decision === 'APPROVE') {
      if (growLockLevel === 'OPEN') {
        approved.push(key);
      } else if (growLockLevel === 'CONTROLLED') {
        approved.push(key);
      } else {
        rejected.push(key);
      }
    } else if (decision === 'NEEDS_OWNER_REVIEW') {
      if (growLockLevel === 'OPEN') {
        approved.push(key);
      } else {
        needsOwnerReview.push(key);
      }
    } else if (decision === 'REJECT') {
      rejected.push(key);
    }
  }

  return { approved, rejected, needsOwnerReview };
}

export async function runGrowCycle(operatorId: string): Promise<{
  proposalId: string;
  status: string;
  changesApplied: number;
  fieldsBlocked: number;
  needsOwnerReview: boolean;
}> {
  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));

  if (!operator) throw new Error(`Operator ${operatorId} not found`);

  const growLockLevel = operator.growLockLevel ?? 'CONTROLLED';

  if (growLockLevel === 'FROZEN' || growLockLevel === 'LOCKED') {
    return { proposalId: '', status: 'skipped', changesApplied: 0, fieldsBlocked: 0, needsOwnerReview: false };
  }

  if (operator.lockedUntil && operator.lockedUntil > new Date()) {
    return { proposalId: '', status: 'locked_until', changesApplied: 0, fieldsBlocked: 0, needsOwnerReview: false };
  }

  const [selfAwareness] = await db
    .select()
    .from(selfAwarenessStateTable)
    .where(eq(selfAwarenessStateTable.operatorId, operatorId));

  const recentMessages = await getRecentMessages(operatorId);

  const proposalId = crypto.randomUUID();
  const selfAwarenessSnapshot = selfAwareness ?? null;

  await db.insert(growProposalsTable).values({
    id: proposalId,
    operatorId,
    proposedChanges: {},
    selfAwarenessSnapshot,
    status: 'evaluating',
    retryCount: 0,
  });

  let claudeRaw = '';
  try {
    const prompt = buildGrowPrompt(operator, recentMessages, selfAwareness ?? null);
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      GROW_MODEL,
    );
    claudeRaw = result.content;
  } catch (err) {
    await db.update(growProposalsTable)
      .set({ status: 'error', claudeReasoning: `Claude call failed: ${(err as Error).message}` })
      .where(eq(growProposalsTable.id, proposalId));
    throw err;
  }

  let parsedEval: ReturnType<typeof parseClaudeResponse>;
  try {
    parsedEval = parseClaudeResponse(claudeRaw);
  } catch (err) {
    await db.update(growProposalsTable)
      .set({ status: 'error', claudeReasoning: `Parse failed: ${(err as Error).message}` })
      .where(eq(growProposalsTable.id, proposalId));
    throw err;
  }

  const { proposedChanges, fieldDecisions, reasoning, safetyFlags } = parsedEval;
  const { approved, rejected, needsOwnerReview } = categoriseFields(fieldDecisions, growLockLevel);

  const claudeEvaluation = { approved, rejected, needsOwnerReview, fieldDecisions };
  const hasChanges = Object.keys(proposedChanges).length > 0;
  const needsReview = needsOwnerReview.length > 0;
  const status = !hasChanges
    ? 'no_change'
    : needsReview
    ? 'needs_owner_review'
    : approved.length > 0
    ? 'approved'
    : 'rejected';

  await db.update(growProposalsTable)
    .set({
      proposedChanges,
      claudeEvaluation,
      claudeReasoning: reasoning,
      status,
      evaluatedAt: new Date(),
    })
    .where(eq(growProposalsTable.id, proposalId));

  let changesApplied = 0;

  if (approved.length > 0 && hasChanges) {
    const currentSoul = operator.layer2Soul as Layer2Soul;
    const updatedSoul: Layer2Soul = { ...currentSoul };

    for (const field of approved) {
      if (proposedChanges[field] !== undefined) {
        (updatedSoul as Record<string, unknown>)[field] = proposedChanges[field];
        changesApplied++;
      }
    }

    await db.update(operatorsTable)
      .set({ layer2Soul: updatedSoul })
      .where(eq(operatorsTable.id, operatorId));
  }

  if (rejected.length > 0) {
    await db.insert(growBlockedLogTable).values({
      id: crypto.randomUUID(),
      operatorId,
      blockedFields: rejected,
      reason: `GROW cycle — fields rejected by Claude evaluation (${growLockLevel})`,
      proposalSummary: reasoning.slice(0, 500),
    });
  }

  await db.insert(selfAwarenessStateTable)
    .values({
      id: selfAwareness?.id ?? crypto.randomUUID(),
      operatorId,
      identityState: {
        archetype: operator.archetype,
        mandate: operator.mandate,
        growLockLevel,
        lastGrowCycle: new Date().toISOString(),
        proposalId,
      },
      soulState: operator.layer2Soul,
      mandateGaps: safetyFlags,
      lastUpdated: new Date(),
      lastUpdateTrigger: 'grow_cycle',
    })
    .onConflictDoUpdate({
      target: selfAwarenessStateTable.operatorId,
      set: {
        identityState: {
          archetype: operator.archetype,
          mandate: operator.mandate,
          growLockLevel,
          lastGrowCycle: new Date().toISOString(),
          proposalId,
        },
        soulState: operator.layer2Soul,
        mandateGaps: safetyFlags,
        lastUpdated: new Date(),
        lastUpdateTrigger: 'grow_cycle',
      },
    });

  if (status === 'approved' || status === 'no_change') {
    await db.update(growProposalsTable)
      .set({ status: changesApplied > 0 ? 'applied' : 'no_change', decidedAt: new Date() })
      .where(eq(growProposalsTable.id, proposalId));
  }

  return {
    proposalId,
    status: changesApplied > 0 ? 'applied' : status,
    changesApplied,
    fieldsBlocked: rejected.length,
    needsOwnerReview: needsReview,
  };
}

export { GROW_MODEL };
