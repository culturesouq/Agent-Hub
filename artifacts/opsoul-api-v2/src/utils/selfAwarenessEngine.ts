import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import {
  operatorsTable,
  selfAwarenessStateTable,
  growProposalsTable,
  operatorIntegrationsTable,
  operatorSkillsTable,
  platformSkillsTable,
  operatorKbTable,
  ownerKbTable,
  operatorMemoryTable,
  conversationsTable,
  tasksTable,
  opsLogsTable,
  operatorFilesTable,
} from '@workspace/db-v2';
import { eq, and, count, avg, desc, isNull, sql, gte, lt } from 'drizzle-orm';

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
    mandateGaps: number;
    soulIntegrity: number;
  };
}

export interface IdentityState {
  name: string;
  archetype: string[];
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
  integrations: { id: string; label: string; type: string; status: string; hasToken: boolean; scopes: string[] }[];
  skills: { id: string; name: string; isActive: boolean; description: string }[];
  ownerKbChunks: number;
  operatorKbChunks: number;
  operatorKbAvgConfidence: number;
}

export interface TaskHistorySummary {
  last30Tasks: { taskType: string; integrationLabel: string; status: string; contextName: string; createdAt: string }[];
  successRate: number;
  taskTypeBreakdown: Record<string, { total: number; succeeded: number; failed: number }>;
}

export interface WorkspaceManifest {
  kbByTier: { high: number; medium: number; low: number };
  memoryByType: Record<string, number>;
  totalMemoryActive: number;
  lastConversationAt: string | null;
  lastGrowActivity: string | null;
  generatedAt: string;
  fileCount: number;
  fileNames: string[];
}

export interface SelfAwarenessState {
  operatorId: string;
  identityState: IdentityState;
  soulState: SoulState;
  capabilityState: CapabilityState;
  taskHistory: TaskHistorySummary;
  mandateGaps: string[];
  healthScore: HealthScore;
  workspaceManifest: WorkspaceManifest;
  lastUpdated: string;
  lastUpdateTrigger: SelfAwarenessTrigger;
}

async function buildWorkspaceManifest(operatorId: string): Promise<WorkspaceManifest> {
  const [kbHigh, kbMedium, kbLow, memoryRows, lastGrow, lastConv, filesRows] = await Promise.all([
    db.select({ total: count() }).from(operatorKbTable).where(and(eq(operatorKbTable.operatorId, operatorId), gte(operatorKbTable.confidenceScore, 80))),
    db.select({ total: count() }).from(operatorKbTable).where(and(eq(operatorKbTable.operatorId, operatorId), gte(operatorKbTable.confidenceScore, 50), lt(operatorKbTable.confidenceScore, 80))),
    db.select({ total: count() }).from(operatorKbTable).where(and(eq(operatorKbTable.operatorId, operatorId), lt(operatorKbTable.confidenceScore, 50))),
    db.select({ memoryType: operatorMemoryTable.memoryType, total: count() }).from(operatorMemoryTable).where(and(eq(operatorMemoryTable.operatorId, operatorId), isNull(operatorMemoryTable.archivedAt))).groupBy(operatorMemoryTable.memoryType),
    db.select({ lastActivity: sql<string>`MAX(created_at)::text` }).from(growProposalsTable).where(and(eq(growProposalsTable.operatorId, operatorId), sql`status = 'applied'`)),
    db.select({ lastAt: sql<string>`MAX(last_message_at)::text` }).from(conversationsTable).where(eq(conversationsTable.operatorId, operatorId)),
    db.select({ id: operatorFilesTable.id, filename: operatorFilesTable.filename }).from(operatorFilesTable).where(eq(operatorFilesTable.operatorId, operatorId)),
  ]);

  const memoryByType: Record<string, number> = {};
  let totalMemoryActive = 0;
  for (const row of memoryRows) {
    memoryByType[row.memoryType] = Number(row.total);
    totalMemoryActive += Number(row.total);
  }

  return {
    kbByTier: {
      high: Number(kbHigh[0]?.total ?? 0),
      medium: Number(kbMedium[0]?.total ?? 0),
      low: Number(kbLow[0]?.total ?? 0),
    },
    memoryByType,
    totalMemoryActive,
    lastConversationAt: lastConv[0]?.lastAt ?? null,
    lastGrowActivity: lastGrow[0]?.lastActivity ?? null,
    generatedAt: new Date().toISOString(),
    fileCount: filesRows.length,
    fileNames: filesRows.map(f => f.filename),
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
    db.select({ id: operatorIntegrationsTable.id, label: operatorIntegrationsTable.integrationLabel, type: operatorIntegrationsTable.integrationType, status: operatorIntegrationsTable.status, tokenEncrypted: operatorIntegrationsTable.tokenEncrypted, scopes: operatorIntegrationsTable.scopes }).from(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.operatorId, operatorId)),
    db.select({ id: operatorSkillsTable.id, name: platformSkillsTable.name, isActive: operatorSkillsTable.isActive, description: platformSkillsTable.description }).from(operatorSkillsTable).innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id)).where(eq(operatorSkillsTable.operatorId, operatorId)),
    db.select({ total: count() }).from(ownerKbTable).where(eq(ownerKbTable.operatorId, operatorId)),
    db.select({ total: count(), avgConfidence: avg(operatorKbTable.confidenceScore) }).from(operatorKbTable).where(eq(operatorKbTable.operatorId, operatorId)),
  ]);

  return {
    integrations: integrations.map(i => ({ id: i.id, label: i.label, type: i.type, status: i.status ?? 'connected', hasToken: !!i.tokenEncrypted, scopes: i.scopes ?? [] })),
    skills: skillInstalls.map(s => ({ id: s.id, name: s.name, isActive: s.isActive ?? false, description: s.description })),
    ownerKbChunks: Number(ownerKbCount[0]?.total ?? 0),
    operatorKbChunks: Number(operatorKbStats[0]?.total ?? 0),
    operatorKbAvgConfidence: Math.round(Number(operatorKbStats[0]?.avgConfidence ?? 0)),
  };
}

async function buildTaskHistory(operatorId: string): Promise<TaskHistorySummary> {
  const tasks = await db.select({ taskType: tasksTable.taskType, integrationLabel: tasksTable.integrationLabel, status: tasksTable.status, contextName: tasksTable.contextName, createdAt: tasksTable.createdAt }).from(tasksTable).where(eq(tasksTable.operatorId, operatorId)).orderBy(desc(tasksTable.createdAt)).limit(30);

  const breakdown: Record<string, { total: number; succeeded: number; failed: number }> = {};
  let succeeded = 0;
  let failed = 0;

  for (const t of tasks) {
    const key = t.taskType;
    if (!breakdown[key]) breakdown[key] = { total: 0, succeeded: 0, failed: 0 };
    breakdown[key].total++;
    if (t.status === 'completed') { succeeded++; breakdown[key].succeeded++; }
    else if (t.status === 'failed') { failed++; breakdown[key].failed++; }
  }

  const total = tasks.length;
  return {
    last30Tasks: tasks.map(t => ({ taskType: t.taskType, integrationLabel: t.integrationLabel, status: t.status ?? 'pending', contextName: t.contextName, createdAt: t.createdAt?.toISOString() ?? '' })),
    successRate: total > 0 ? Math.round((succeeded / total) * 100) : 100,
    taskTypeBreakdown: breakdown,
  };
}

function computeMandateGaps(taskHistory: TaskHistorySummary): string[] {
  return Object.entries(taskHistory.taskTypeBreakdown)
    .filter(([, stats]) => stats.total > 0 && stats.failed / stats.total >= 0.5)
    .map(([taskType, stats]) => `${taskType} — ${stats.failed}/${stats.total} tasks failed`);
}

function computeHealthScore(op: typeof operatorsTable.$inferSelect, soul: SoulState, cap: CapabilityState, mandateGaps: string[]): HealthScore {
  const activeSkills = cap.skills.filter(s => s.isActive).length;
  const connectedIntegrations = cap.integrations.filter(i => i.status === 'connected').length;
  const hasKb = cap.ownerKbChunks > 0 || cap.operatorKbChunks > 0;

  let mandateCoverage = 0;
  if (hasKb) mandateCoverage += 40;
  if (activeSkills > 0) mandateCoverage += Math.min(activeSkills * 15, 30);
  if (connectedIntegrations > 0) mandateCoverage += Math.min(connectedIntegrations * 10, 30);
  mandateCoverage = Math.min(mandateCoverage, 100);

  const growActivity = soul.growProposalCount === 0 ? 50 : Math.min(Math.round(50 + (soul.appliedProposalCount / soul.growProposalCount) * 50), 100);
  const kbConfidence = cap.operatorKbAvgConfidence;
  const mandateGapPenalty = Math.min(mandateGaps.length * 10, 40);

  let soulIntegrity = 100;
  if (!op.layer1LockedAt) soulIntegrity -= 15;
  if (!op.coreValues?.length) soulIntegrity -= 10;
  if (!op.ethicalBoundaries?.length) soulIntegrity -= 10;
  soulIntegrity = Math.max(soulIntegrity, 0);

  const rawScore = mandateCoverage * 0.30 + (100 - mandateGapPenalty) * 0.20 + kbConfidence * 0.25 + growActivity * 0.15 + soulIntegrity * 0.10;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  return {
    score,
    label: score >= 70 ? 'Strong' : score >= 40 ? 'Developing' : 'Needs Attention',
    components: { mandateCoverage, growActivity, kbConfidence, mandateGaps: 100 - mandateGapPenalty, soulIntegrity },
  };
}

export async function buildSelfAwarenessState(operatorId: string): Promise<SelfAwarenessState> {
  const [op] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, operatorId));
  if (!op) throw new Error(`Operator ${operatorId} not found`);

  const [soulState, capabilityState, taskHistory, workspaceManifest] = await Promise.all([
    buildSoulState(operatorId, op),
    buildCapabilityState(operatorId),
    buildTaskHistory(operatorId),
    buildWorkspaceManifest(operatorId),
  ]);

  const identityState: IdentityState = {
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

  const mandateGaps = computeMandateGaps(taskHistory);
  const healthScore = computeHealthScore(op, soulState, capabilityState, mandateGaps);

  return {
    operatorId,
    identityState,
    soulState,
    capabilityState,
    taskHistory,
    mandateGaps,
    healthScore,
    workspaceManifest,
    lastUpdated: new Date().toISOString(),
    lastUpdateTrigger: 'force',
  };
}

export async function recomputeSelfAwareness(operatorId: string, trigger: SelfAwarenessTrigger): Promise<void> {
  let previousState: typeof selfAwarenessStateTable.$inferSelect | null = null;

  try {
    const [prev] = await db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operatorId));
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
      workspaceManifest: computed.workspaceManifest as unknown as Record<string, unknown>,
      lastUpdated: new Date(),
      lastUpdateTrigger: trigger,
    };

    if (previousState) {
      await db.update(selfAwarenessStateTable).set(payload).where(eq(selfAwarenessStateTable.operatorId, operatorId));
    } else {
      await db.insert(selfAwarenessStateTable).values({ id: crypto.randomUUID(), operatorId, ...payload });
    }
  } catch (err) {
    console.error(`[self-awareness] Recompute failed for ${operatorId} (trigger: ${trigger}):`, (err as Error).message);
    if (previousState) {
      console.warn(`[self-awareness] Preserving previous state for ${operatorId}`);
    }
    await db.insert(opsLogsTable).values({
      id: crypto.randomUUID(),
      logTier: 'error',
      errorType: 'self_awareness_recompute_failed',
      operatorId,
      layerFailed: 'self_awareness',
    }).catch(() => {});
  }
}

export function triggerSelfAwareness(operatorId: string, trigger: SelfAwarenessTrigger): void {
  setImmediate(() => {
    recomputeSelfAwareness(operatorId, trigger).catch(err => {
      console.error(`[self-awareness] Background trigger failed (${trigger}):`, err.message);
    });
  });
}
