import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorSkillsTable, platformSkillsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { isWebSearchAvailable } from '../utils/capabilityEngine.js';
import { operatorSecretsTable, operatorIntegrationsTable, conversationsTable } from '@workspace/db';
import { buildToolManifest, getTool } from '../utils/toolRegistry.js';
import { dispatchTool } from '../utils/toolHandlers.js';
import { buildOwnerScope } from '../utils/scopeResolver.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId as string),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

const InstallSkillSchema = z.object({
  skillId: z.string().min(1),
  customInstructions: z.string().max(2000).optional(),
});

const UpdateInstallSchema = z.object({
  customInstructions: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = InstallSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [skill] = await db
    .select()
    .from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, parsed.data.skillId));

  if (!skill) { res.status(404).json({ error: 'Platform skill not found' }); return; }

  const [existing] = await db
    .select({ id: operatorSkillsTable.id })
    .from(operatorSkillsTable)
    .where(
      and(
        eq(operatorSkillsTable.operatorId, operatorId),
        eq(operatorSkillsTable.skillId, parsed.data.skillId),
      ),
    );

  if (existing) {
    res.status(409).json({ error: 'Skill already installed on this operator' });
    return;
  }

  const [install] = await db.insert(operatorSkillsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    skillId: parsed.data.skillId,
    customInstructions: parsed.data.customInstructions,
    isActive: true,
  }).returning();

  await db.update(platformSkillsTable)
    .set({ installCount: (skill.installCount ?? 0) + 1 })
    .where(eq(platformSkillsTable.id, parsed.data.skillId));

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.status(201).json({ ...install, skill: { name: skill.name, description: skill.description } });
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const installs = await db
    .select({
      id: operatorSkillsTable.id,
      operatorId: operatorSkillsTable.operatorId,
      skillId: operatorSkillsTable.skillId,
      customInstructions: operatorSkillsTable.customInstructions,
      isActive: operatorSkillsTable.isActive,
      installedAt: operatorSkillsTable.installedAt,
      skillName: platformSkillsTable.name,
      skillDescription: platformSkillsTable.description,
      skillInstructions: platformSkillsTable.instructions,
      skillOutputFormat: platformSkillsTable.outputFormat,
      skillTriggerDescription: platformSkillsTable.triggerDescription,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(eq(operatorSkillsTable.operatorId, operatorId));

  res.json({ operatorId, count: installs.length, skills: installs });
});

// Manifest endpoint — returns the operator's full skill stack in 3 layers:
//   builtin   — universal agent capabilities (every operator)
//   archetype — derived from the operator's archetypes (deduplicated)
//   custom    — owner-installed platform skills
router.get('/manifest', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [op] = await db
    .select({ archetype: operatorsTable.archetype })
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));
  if (!op) { res.status(404).json({ error: 'Operator not found' }); return; }

  const archetypes = (op.archetype as string[] | null) ?? [];

  const [secretRows, archetypeSkills, customInstalls] = await Promise.all([
    db.select({ key: operatorSecretsTable.key })
      .from(operatorSecretsTable)
      .where(eq(operatorSecretsTable.operatorId, operatorId)),
    loadArchetypeSkills(archetypes),
    db.select({
      id:                 operatorSkillsTable.id,
      skillId:            operatorSkillsTable.skillId,
      customInstructions: operatorSkillsTable.customInstructions,
      isActive:           operatorSkillsTable.isActive,
      installedAt:        operatorSkillsTable.installedAt,
      skillName:          platformSkillsTable.name,
      skillDescription:   platformSkillsTable.description,
    })
      .from(operatorSkillsTable)
      .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
      .where(eq(operatorSkillsTable.operatorId, operatorId)),
  ]);

  // Universal builder tools — sourced from utils/toolRegistry.ts so the UI
  // sees exactly the same set the operator can call via the LLM and the
  // same set external MCP clients see at /mcp. Owner scope here matches
  // the auth context (chat route requires owner-level auth).
  const integrationRows = await db
    .select({ integrationType: operatorIntegrationsTable.integrationType })
    .from(operatorIntegrationsTable)
    .where(eq(operatorIntegrationsTable.operatorId, operatorId));

  const builtin = buildToolManifest({
    scopeType: 'owner',
    hasWebSearch: isWebSearchAvailable(),
    liveSecrets: secretRows.map((r) => r.key),
    connectedIntegrations: integrationRows.map((r) => r.integrationType),
  })
    .filter((t) => t.available)
    .map((t) => ({
      // Frontend SkillsSection.tsx renders `name` as the card title — use
      // the title-case displayName so the UI shows "Web search" rather than
      // the LLM-facing snake_case "web_search".
      name:        t.displayName,
      description: t.description,
      category:    t.category,
    }));

  const specialty = archetypeSkills.map((s) => ({
    skillId:            s.skillId,
    name:               s.name,
    description:        s.triggerDescription,
    integrationType:    s.integrationType,
  }));

  res.json({
    operatorId,
    builtin,
    specialty,
    custom: customInstalls,
  });
});

router.patch('/:installId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateInstallSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select()
    .from(operatorSkillsTable)
    .where(
      and(
        eq(operatorSkillsTable.id, req.params.installId as string),
        eq(operatorSkillsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Skill install not found' }); return; }

  const updates: Record<string, unknown> = {};
  if (parsed.data.customInstructions !== undefined) {
    updates.customInstructions = parsed.data.customInstructions;
  }
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [updated] = await db
    .update(operatorSkillsTable)
    .set(updates)
    .where(eq(operatorSkillsTable.id, req.params.installId as string))
    .returning();

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json(updated);
});

router.delete('/:installId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select()
    .from(operatorSkillsTable)
    .where(
      and(
        eq(operatorSkillsTable.id, req.params.installId as string),
        eq(operatorSkillsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Skill install not found' }); return; }

  await db.delete(operatorSkillsTable).where(eq(operatorSkillsTable.id, req.params.installId as string));

  const [skill] = await db
    .select({ installCount: platformSkillsTable.installCount })
    .from(platformSkillsTable)
    .where(eq(platformSkillsTable.id, existing.skillId));

  if (skill) {
    await db.update(platformSkillsTable)
      .set({ installCount: Math.max(0, (skill.installCount ?? 1) - 1) })
      .where(eq(platformSkillsTable.id, existing.skillId));
  }

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  res.json({ ok: true, uninstalled: req.params.installId as string });
});

/**
 * Owner-only tool test endpoint. Fires a single MCP tool against the operator's
 * own runtime context, bypassing the LLM. Used by the Skills tab's "Test fire"
 * panel so the owner can verify any of the 57 tools without having to talk to
 * the operator and hope it chooses to invoke the tool.
 *
 * Auth: requireAuth + resolveOperator already enforce that the caller owns the
 * operator. The tool runs with owner-scope authority.
 */
router.post('/test-tool', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const { name, args } = (req.body ?? {}) as { name?: string; args?: unknown };
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Body must include "name" (string).' });
    return;
  }
  if (!getTool(name)) {
    res.status(404).json({ error: `Tool "${name}" is not registered.` });
    return;
  }

  // Resolve the most recent conversation for the operator — handlers that
  // touch messagesTable need a valid conversationId. If none exists yet,
  // create a transient owner-scope one.
  const [latestConv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(eq(conversationsTable.operatorId, operatorId))
    .limit(1);

  const scope = buildOwnerScope(req.owner!.ownerId);
  let conversationId = latestConv?.id;
  if (!conversationId) {
    const [created] = await db.insert(conversationsTable).values({
      id: crypto.randomUUID(),
      operatorId,
      ownerId: req.owner!.ownerId,
      contextName: 'Tool test',
      scopeId: scope.scopeId,
      scopeType: 'owner',
    }).returning({ id: conversationsTable.id });
    conversationId = created.id;
  }

  const [op] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, operatorId));
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return;
  }

  try {
    const result = await dispatchTool(name, JSON.stringify(args ?? {}), {
      operatorId,
      ownerId: req.owner!.ownerId,
      conversationId,
      scope: { scopeId: scope.scopeId, scopeTrust: scope.scopeTrust, scopeType: 'owner' },
      mandate: op.mandate ?? '',
    });
    res.json({ ok: true, name, args, result });
  } catch (err) {
    res.status(500).json({ ok: false, name, error: (err as Error).message });
  }
});

export default router;
