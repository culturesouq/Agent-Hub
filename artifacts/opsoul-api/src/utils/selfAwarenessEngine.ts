import crypto from 'crypto';
import { db, pool } from '@workspace/db';
import {
  operatorsTable,
  selfAwarenessStateTable,
  growProposalsTable,
  operatorIntegrationsTable,
  operatorSkillsTable,
  platformSkillsTable,
  operatorKbTable,
  ownerKbTable,
  tasksTable,
  opsLogsTable,
} from '@workspace/db';
import { eq, and, count, avg, desc, not, isNull, inArray, sql } from 'drizzle-orm';

export type SelfAwarenessTrigger =
  | 'conversation_end'
  | 'kb_learn'
  | 'grow_approved'
  | 'capability_request'
  | 'integration_change'
  | 'force'
  | 'owner_manual';

export interface HealthScore {
  score: number;
  label: 'Strong' | 'Developing' | 'Needs Attention';
  components: {
    mandateCoverage: number;
    growActivity: number;
    kbConfidence: number;
    mandateGapPenalty: number;
    soulIntegrity: number;
  };
}

export interface IdentityState {
  name: string;
  archetype: string;
  mandate: string;
  coreValues: string[] | null;
  ethicalBoundaries: string[] | null;
  layer1LockedAt: string | null;
  growLockLevel: string | null;
  safeMode: boolean | null;
  createdAt: string | null;
}

export interface SoulState {
  personalityTraits: string[];
  toneProfile: string;
  communicationStyle: string;
  emotionalRange: string;
  decisionMakingStyle: string;
  conflictResolution: string;
  growProposalCount: number;
  appliedProposalCount: number;
  lastGrowActivity: string | null;
}

export interface CapabilityState {
  integrations: {
    id: string;
    label: string;
    type: string;
    status: string;
    hasToken: boolean;
    scopeCount: number;
  }[];
  skills: {
    id: string;
    name: string;
    isActive: boolean;
    description: string;
  }[];
  ownerKbChunks: number;
  operatorKbChunks: number;
  operatorKbAvgConfidence: number;
}

export interface TaskHistorySummary {
  last30Tasks: {
    taskType: string;
    integrationLabel: string;
    status: string;
    contextName: string;
    createdAt: string;
  }[];
  successRate: number;
  taskTypeBreakdown: Record<string, { total: number; succeeded: number; failed: number }>;
}

export interface SelfAwarenessState {
  operatorId: string;
  identityState: IdentityState;
  soulState: SoulState;
  capabilityState: CapabilityState;
  taskHistory: TaskHistorySummary;
  mandateGaps: string[];
  healthScore: HealthScore;
  lastUpdated: string;
  lastUpdateTrigger: SelfAwarenessTrigger;
}

async function buildIdentityState(op: typeof operatorsTable.$inferSelect): Promise<IdentityState> {
  return {
    name: op.name,
    archetype: op.archetype,
    mandate: op.mandate,
    coreValues: op.coreValues,
    ethicalBoundaries: op.ethicalBoundaries,
    layer1LockedAt: op.layer1LockedAt?.toISOString() ?? null,
    growLockLevel: op.growLockLevel,
    safeMode: op.safeMode,
    createdAt: op.createdAt?.toISOString() ?? null,
  };
}

async function buildSoulState(operatorId: string, op: typeof operatorsTable.$inferSelect): Promise<SoulState> {
  const soul = op.layer2Soul as Record<string, unknown>;

  const [growCounts] = await db
    .select({
      total: count(),
      applied: sql<number>`COUNT(*) FILTER (WHERE status = 'applied')`,
      lastActivity: sql<string>`MAX(created_at)::text`,
    })
    .from(growProposalsTable)
    .where(eq(growProposalsTable.operatorId, operatorId));

  return {
    personalityTraits: (soul.personalityTraits as string[]) ?? [],
    toneProfile: (soul.toneProfile as string) ?? '',
    communicationStyle: (soul.communicationStyle as string) ?? '',
    emotionalRange: (soul.emotionalRange as string) ?? '',
    decisionMakingStyle: (soul.decisionMakingStyle as string) ?? '',
    conflictResolution: (soul.conflictResolution as string) ?? '',
    growProposalCount: Number(growCounts?.total ?? 0),
    appliedProposalCount: Number(growCounts?.applied ?? 0),
    lastGrowActivity: growCounts?.lastActivity ?? null,
  };
}

async function buildCapabilityState(operatorId: string): Promise<CapabilityState> {
  const [integrations, skillInstalls, ownerKbCount, operatorKbStats] = await Promise.all([
    db
      .select({
        id: operatorIntegrationsTable.id,
        label: operatorIntegrationsTable.integrationLabel,
        type: operatorIntegrationsTable.integrationType,
        status: operatorIntegrationsTable.status,
        tokenEncrypted: operatorIntegrationsTable.tokenEncrypted,
        scopes: operatorIntegrationsTable.scopes,
      })
      .from(operatorIntegrationsTable)
      .where(eq(operatorIntegrationsTable.operatorId, operatorId)),

    db
      .select({
        id: operatorSkillsTable.id,
        name: platformSkillsTable.name,
        isActive: operatorSkillsTable.isActive,
        description: platformSkillsTable.description,
      })
      .from(operatorSkillsTable)
      .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
      .where(eq(operatorSkillsTable.operatorId, operatorId)),

    db
      .select({ total: count() })
      .from(ownerKbTable)
      .where(eq(ownerKbTable.operatorId, operatorId)),

    db
      .select({
        total: count(),
        avgConfidence: avg(operatorKbTable.confidenceScore),
      })
      .from(operatorKbTable)
      .where(eq(operatorKbTable.operatorId, operatorId)),
  ]);

  return {
    integrations: integrations.map((i) => ({
      id: i.id,
      label: i.label,
      type: i.type,
      status: i.status ?? 'connected',
      hasToken: !!i.tokenEncrypted,
      scopeCount: i.scopes?.length ?? 0,
    })),
    skills: skillInstalls.map((s) => ({
      id: s.id,
      name: s.name,
      isActive: s.isActive ?? false,
      description: s.description,
    })),
    ownerKbChunks: Number(ownerKbCount[0]?.total ?? 0),
    operatorKbChunks: Number(operatorKbStats[0]?.total ?? 0),
    operatorKbAvgConfidence: Math.round(Number(operatorKbStats[0]?.avgConfidence ?? 0)),
  };
}

async function buildTaskHistory(operatorId: string): Promise<TaskHistorySummary> {
  const tasks = await db
    .select({
      taskType: tasksTable.taskType,
      integrationLabel: tasksTable.integrationLabel,
      status: tasksTable.status,
      contextName: tasksTable.contextName,
      createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .where(eq(tasksTable.operatorId, operatorId))
    .orderBy(desc(tasksTable.createdAt))
    .limit(30);

  const breakdown: Record<string, { total: number; succeeded: number; failed: number }> = {};
  let succeeded = 0;
  let failed = 0;

  for (const t of tasks) {
    const key = t.taskType;
    if (!breakdown[key]) breakdown[key] = { total: 0, succeeded: 0, failed: 0 };
    breakdown[key].total++;

    if (t.status === 'completed') {
      succeeded++;
      breakdown[key].succeeded++;
    } else if (t.status === 'failed') {
      failed++;
      breakdown[key].failed++;
    }
  }

  const total = tasks.length;
  const successRate = total > 0 ? Math.round((succeeded / total) * 100) : 100;

  return {
    last30Tasks: tasks.map((t) => ({
      taskType: t.taskType,
      integrationLabel: t.integrationLabel,
      status: t.status ?? 'pending',
      contextName: t.contextName,
      createdAt: t.createdAt?.toISOString() ?? '',
    })),
    successRate,
    taskTypeBreakdown: breakdown,
  };
}

function computeMandateGaps(taskHistory: TaskHistorySummary): string[] {
  const gaps: string[] = [];
  for (const [taskType, stats] of Object.entries(taskHistory.taskTypeBreakdown)) {
    const failRate = stats.total > 0 ? stats.failed / stats.total : 0;
    if (failRate >= 0.5) {
      gaps.push(`${taskType} — ${stats.failed}/${stats.total} tasks failed`);
    }
  }
  return gaps;
}

function getMandateCoveragePercent(capabilityState: CapabilityState): number {
  const activeSkills = capabilityState.skills.filter((s) => s.isActive).length;
  const connectedIntegrations = capabilityState.integrations.filter(
    (i) => i.status === 'connected',
  ).length;
  const hasKb = capabilityState.ownerKbChunks > 0 || capabilityState.operatorKbChunks > 0;

  let score = 0;
  if (hasKb) score += 40;
  if (activeSkills > 0) score += Math.min(activeSkills * 15, 30);
  if (connectedIntegrations > 0) score += Math.min(connectedIntegrations * 10, 30);
  return Math.min(score, 100);
}

function getGrowActivityScore(soulState: SoulState): number {
  if (soulState.growProposalCount === 0) return 50;
  const appliedRatio = soulState.appliedProposalCount / soulState.growProposalCount;
  return Math.min(Math.round(50 + appliedRatio * 50), 100);
}

function getSoulIntegrityScore(identityState: IdentityState): number {
  let score = 100;
  if (!identityState.layer1LockedAt) score -= 15;
  if (!identityState.coreValues || identityState.coreValues.length === 0) score -= 10;
  if (!identityState.ethicalBoundaries || identityState.ethicalBoundaries.length === 0) score -= 10;
  return Math.max(score, 0);
}

function computeHealthScore(
  identityState: IdentityState,
  soulState: SoulState,
  capabilityState: CapabilityState,
  mandateGaps: string[],
): HealthScore {
  const mandateCoverage = getMandateCoveragePercent(capabilityState);
  const growActivity = getGrowActivityScore(soulState);
  const kbConfidence = capabilityState.operatorKbAvgConfidence;
  const mandateGapPenalty = Math.min(mandateGaps.length * 10, 40);
  const soulIntegrity = getSoulIntegrityScore(identityState);

  const mandateGapsScore = 100 - mandateGapPenalty;

  const rawScore =
    mandateCoverage * 0.30 +
    mandateGapsScore * 0.20 +
    kbConfidence * 0.25 +
    growActivity * 0.15 +
    soulIntegrity * 0.10;

  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  let label: 'Strong' | 'Developing' | 'Needs Attention';
  if (score >= 70) label = 'Strong';
  else if (score >= 40) label = 'Developing';
  else label = 'Needs Attention';

  return {
    score,
    label,
    components: {
      mandateCoverage,
      mandateGaps: mandateGapsScore,
      kbConfidence,
      growActivity,
      soulIntegrity,
    },
  };
}

export async function buildSelfAwarenessState(
  operatorId: string,
): Promise<SelfAwarenessState> {
  const [op] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));

  if (!op) throw new Error(`Operator ${operatorId} not found`);

  const [identityState, soulState, capabilityState, taskHistory] = await Promise.all([
    buildIdentityState(op),
    buildSoulState(operatorId, op),
    buildCapabilityState(operatorId),
    buildTaskHistory(operatorId),
  ]);

  const mandateGaps = computeMandateGaps(taskHistory);
  const healthScore = computeHealthScore(identityState, soulState, capabilityState, mandateGaps);

  return {
    operatorId,
    identityState,
    soulState,
    capabilityState,
    taskHistory,
    mandateGaps,
    healthScore,
    lastUpdated: new Date().toISOString(),
    lastUpdateTrigger: 'force',
  };
}

export async function recomputeSelfAwareness(
  operatorId: string,
  trigger: SelfAwarenessTrigger,
): Promise<void> {
  let previousState: typeof selfAwarenessStateTable.$inferSelect | null = null;

  try {
    const [prev] = await db
      .select()
      .from(selfAwarenessStateTable)
      .where(eq(selfAwarenessStateTable.operatorId, operatorId));
    previousState = prev ?? null;

    const computed = await buildSelfAwarenessState(operatorId);
    computed.lastUpdateTrigger = trigger;

    const payload = {
      identityState: computed.identityState as unknown as Record<string, unknown>,
      soulState: computed.soulState as unknown as Record<string, unknown>,
      capabilityState: computed.capabilityState as unknown as Record<string, unknown>,
      taskHistory: computed.taskHistory as unknown as Record<string, unknown>,
      mandateGaps: computed.mandateGaps,
      healthScore: computed.healthScore as unknown as Record<string, unknown>,
      lastUpdated: new Date(),
      lastUpdateTrigger: trigger,
    };

    if (previousState) {
      await db.update(selfAwarenessStateTable)
        .set(payload)
        .where(eq(selfAwarenessStateTable.operatorId, operatorId));
    } else {
      await db.insert(selfAwarenessStateTable).values({
        id: crypto.randomUUID(),
        operatorId,
        ...payload,
      });
    }
  } catch (err) {
    console.error(`[self-awareness] Recompute failed for ${operatorId} (trigger: ${trigger}):`, (err as Error).message);

    if (previousState) {
      console.warn(`[self-awareness] Preserving previous state for ${operatorId} due to recompute failure`);
    }

    await db.insert(opsLogsTable).values({
      id: crypto.randomUUID(),
      logTier: 'error',
      errorType: 'self_awareness_recompute_failed',
      operatorId,
      layerFailed: 'self_awareness',
      integration: null,
      skill: null,
    }).catch((logErr) => {
      console.error('[self-awareness] Failed to write ops_log:', (logErr as Error).message);
    });
  }
}

export async function triggerSelfAwareness(
  operatorId: string,
  trigger: SelfAwarenessTrigger,
): Promise<void> {
  setImmediate(() => {
    recomputeSelfAwareness(operatorId, trigger).catch((err) => {
      console.error(`[self-awareness] Background trigger failed (${trigger}):`, err.message);
    });
  });
}
