import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  operatorsTable,
  operatorSkillsTable,
  platformSkillsTable,
  operatorIntegrationsTable,
  operatorSecretsTable,
} from '@workspace/db';
import { requireSlotKey } from '../middleware/requireSlotKey.js';
import { CHAT_MODEL } from '../utils/openrouter.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { assembleOperatorPrompt } from '../utils/systemPrompt.js';
import { distillActionTaskPattern } from '../utils/memoryEngine.js';
import { buildScopeContext, type ValidatedScope } from '../utils/scopeResolver.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
import { buildOperatorToolset } from '../utils/operatorToolset.js';
import { runSyncAgentLoop } from '../utils/operatorAgentLoop.js';
import { analyzeInputForSafety, analyzeOutputForLeak } from '../utils/operatorFirewall.js';
import { eq, and } from 'drizzle-orm';

const router = Router();
router.use(requireSlotKey);

const CrudActionSchema = z.object({
  action:  z.string().min(1).max(500),
  payload: z.record(z.unknown()).optional(),
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const slot = req.slot!;

  if (slot.surfaceType !== 'crud') {
    res.status(403).json({ error: 'Only crud slots can use this endpoint' });
    return;
  }

  const parsed = CrudActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { action, payload } = parsed.data;

  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, slot.operatorId));

  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return;
  }

  // ── Skills ──
  const installedRows = await db
    .select({
      id: operatorSkillsTable.id,
      skillId: operatorSkillsTable.skillId,
      customInstructions: operatorSkillsTable.customInstructions,
      name: platformSkillsTable.name,
      instructions: platformSkillsTable.instructions,
      outputFormat: platformSkillsTable.outputFormat,
      triggerDescription: platformSkillsTable.triggerDescription,
      integrationType: platformSkillsTable.integrationType,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(and(eq(operatorSkillsTable.operatorId, slot.operatorId), eq(operatorSkillsTable.isActive, true)));

  const installedNames = new Set(installedRows.map(s => s.name));
  const archetypeDefaults = await loadArchetypeSkills(operator.archetype ?? ['All']);

  const allSkills: InstalledSkill[] = [
    ...installedRows.map(s => ({
      installId:          s.id,
      skillId:            s.skillId,
      name:               s.name,
      triggerDescription: s.triggerDescription ?? '',
      instructions:       s.instructions,
      outputFormat:       s.outputFormat ?? null,
      customInstructions: s.customInstructions ?? null,
      integrationType:    s.integrationType ?? null,
    })),
    ...archetypeDefaults
      .filter(a => !installedNames.has(a.name))
      .map(a => ({
        installId:          a.installId,
        skillId:            a.skillId,
        name:               a.name,
        triggerDescription: a.triggerDescription,
        instructions:       a.instructions,
        outputFormat:       a.outputFormat,
        customInstructions: null,
        integrationType:    a.integrationType ?? null,
      })),
  ];

  const actionText = payload
    ? `${action}\n\nPayload:\n${JSON.stringify(payload, null, 2)}`
    : action;

  // ── OPERATOR-IN-CONTROL ───────────────────────────────────────────────
  // STEP 1 — Operator analyses the inbound action call BEFORE any LLM /
  // skill is dispatched. Action calls are programmatic — but the operator
  // still owns the decision to refuse architecture-introspection actions,
  // returning the refusal text in its own voice. No LLM call needed.
  const actionAgent = new OperatorAgent({
    operatorId: operator.id,
    operatorName: operator.name,
    isBirthMode: false,
    scopeType: 'action',
  });


  // ── Try skill trigger first ──
  const trigger = await detectSkillTrigger(actionText, allSkills, operator.name);
  if (trigger) {
    try {
      trigger.operatorId = slot.operatorId;
      trigger.operatorOwnerId = slot.ownerId;
      // Resolve via the same pattern chat.ts uses: operator default if set
      // and not the auto sentinel, otherwise the platform CHAT_MODEL from
      // the registry. Was hardcoded 'moonshotai/kimi-k2.5' — coupled action
      // surface to one provider regardless of operator config.
      const skillModel = operator.defaultModel && operator.defaultModel !== 'opsoul/auto'
        ? operator.defaultModel
        : CHAT_MODEL;
      const skillResult = await executeSkill(trigger, skillModel);
      res.json({ result: skillResult.output, skill: trigger.name });
      distillActionTaskPattern(
        slot.operatorId,
        slot.ownerId,
        operator.name,
        action,
        payload ?? null,
        skillResult.output,
      ).catch(() => {});
      return;
    } catch { /* fall through to LLM */ }
  }

  // KB + station + skill injection pre-MCP removed — the agent loop's
  // universal toolset (buildOperatorToolset → Claims 4/9/31/36) gives the
  // operator first-class tool access to kb_search, list_integrations,
  // list_tasks, list_files, list_slots, list_secrets, and skill triggers.
  // Pre-loading them into a prompt block was redundant after the MCP
  // refactor (ragContext / liveStation / activeSkills were all computed
  // and never read). liveSecrets is still loaded below for the http_request
  // tool's {{secret-label}} interpolation. liveIntegrations is still loaded
  // below to gate the connected-app tools.

  // ── LLM fallback — pure function, no conversation stored ──
  const liveSecrets = await db.select({ key: operatorSecretsTable.key })
    .from(operatorSecretsTable)
    .where(eq(operatorSecretsTable.operatorId, slot.operatorId));
  const liveIntegrations = await db.select({ type: operatorIntegrationsTable.integrationType })
    .from(operatorIntegrationsTable)
    .where(eq(operatorIntegrationsTable.operatorId, slot.operatorId));

  // Action-scope context: tells the operator they are processing an automated
  // action call (no human reading directly). buildScopeContext provides the
  // scope awareness; the action contract (request shape, expected response
  // shape) is appended as the I/O contract for this surface.
  const actionScope: ValidatedScope = {
    scopeId:        `action:${slot.slotId}`,
    scopeType:      'action',
    scopeTrust:     'authenticated',
    writesHistory:  false,
    persistsLayer1: false,
  };
  const scopeAwareness = buildScopeContext({
    scope: actionScope,
    actionName: action,
  });
  const crudScopeLine = [
    scopeAwareness,
    '',
    `Action API contract for slot "${slot.slotId}":`,
    `- Request shape: { action: string describing what to do, payload?: object containing input data }`,
    `- Response shape: JSON when the action implies data, plain text when it implies explanation, a mix when both apply`,
  ].join('\n');

  let systemPrompt = assembleOperatorPrompt(
    operator,
    undefined,
    { scopeLine: crudScopeLine },
  );

  // ── 5(a) Input tagger surface (Claim 5) — action API ──────────────────
  // Stub returns null today; Phase 4 will populate. When non-null the
  // [SAFETY] annotation is appended to the operator's system prompt for
  // this single action turn.
  const safetyContext = analyzeInputForSafety(actionText);
  if (safetyContext) {
    systemPrompt = `${systemPrompt}\n\n[SAFETY] ${safetyContext.risk} (confidence ${safetyContext.confidence.toFixed(2)}): ${safetyContext.rationale}`;
  }

  // Resolve via the same pattern chat.ts uses: operator default if set and
  // not the auto sentinel, otherwise the platform CHAT_MODEL from the
  // registry. Was hardcoded 'moonshotai/kimi-k2.5' — coupled action surface
  // to one provider regardless of operator config.
  const resolvedModel = operator.defaultModel && operator.defaultModel !== 'opsoul/auto'
    ? operator.defaultModel
    : CHAT_MODEL;

  // ── FULL UNIVERSAL TOOL SUBSTRATE (Claims 4 / 9 / 31 / 36 / D-4) ──
  // Action API used to dispatch with `{ model }` only — silently capability-
  // stripped relative to the owner Hub. Per [[expand-never-cut]] the operator
  // now receives the FULL universal tool catalogue filtered by the action
  // scope's allowlist (the registry enforces — we do not subset further).
  // Action scope synthesized here (no conv row exists for action calls).
  const actionToolset = buildOperatorToolset({
    operatorId: slot.operatorId,
    ownerId: slot.ownerId,
    conversationId: `action:${slot.slotId}`, // synthetic — no conv row
    scope: actionScope,
    mandate: operator.mandate ?? '',
    liveSecrets: liveSecrets.map(s => s.key),
    connectedIntegrations: liveIntegrations.map(i => i.type).filter((t): t is string => typeof t === 'string'),
  });

  // OPERATOR-AS-DRIVER (full TurnPlan) — operator composes its plan post-
  // toolset so introspect can reference real tool names for this action scope.
  const actionTurnPlan = actionAgent.composeTurnPlan(actionText, {
    toolNames: actionToolset.tools.map(t => t.function.name),
    toolDescriptions: new Map(actionToolset.tools.map(t => [t.function.name, t.function.description ?? ''])),
  });

  // STEP 2 — Operator dispatches the LLM via the shared sync agent loop,
  // which exposes the FULL universal tool catalogue for the action scope.
  // Per [[no-fallbacks]] + Claim 13: on LLM failure, propagate the real
  // upstream error as structured JSON. NEVER substitute synthetic operator
  // voice in the action result.
  let result;
  try {
    result = await runSyncAgentLoop({
      agent: actionAgent,
      toolset: actionToolset,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: actionText },
      ],
      model: resolvedModel,
      turnPlan: actionTurnPlan,
      // Patent claim 21: operator-decided tool gating (legacy fallback).
      analyseDecision: actionTurnPlan.kind,
    });
  } catch (llmErr: unknown) {
    console.error('[public-crud] action LLM error', llmErr);
    const status = (llmErr as { status?: number })?.status ?? null;
    const code = (llmErr as { code?: string })?.code ?? null;
    const rawMessage = (llmErr as { message?: string })?.message ?? null;
    const httpStatus = status === 402 ? 503 : 502;
    res.status(httpStatus).json({
      error: 'llm_invocation_failed',
      upstreamStatus: status,
      upstreamCode: code,
      upstreamMessage: rawMessage,
      operatorId: slot.operatorId,
      action,
    });
    return;
  }

  // ── 5(b) Output leak-check surface (Claim 5) — action API ─────────────
  // Stub returns null today; Phase 4 fills in. Always included on the wire
  // so the contract is stable when Phase 4 lights up.
  const leakFeedback = analyzeOutputForLeak(result.content, slot.operatorId);

  res.json({ result: result.content, leakFeedback });

  // Action scope contributes to GROW via PII-free task pattern memory
  distillActionTaskPattern(
    slot.operatorId,
    slot.ownerId,
    operator.name,
    action,
    payload ?? null,
    result.content,
  ).catch(() => {});
});

export default router;
