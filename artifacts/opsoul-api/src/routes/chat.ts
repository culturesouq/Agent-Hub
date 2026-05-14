import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import {
  operatorsTable,
  conversationsTable,
  messagesTable,
  operatorSkillsTable,
  platformSkillsTable,
  selfAwarenessStateTable,
  tasksTable,
  operatorIntegrationsTable,
  operatorFilesTable,
  operatorDeploymentSlotsTable,
  operatorSecretsTable,
  ragDnaTable,
  ownersTable,
} from '@workspace/db';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { executeHttpRequest } from '../utils/httpExecutor.js';
import { embed, semanticDistance } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { lockLayer1IfUnlocked } from '../utils/lockLayer1.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
// Curiosity engine is operator-governed (Patent claim 14): the operator's
// self-awareness layer initiates curiosity, not the chat route. Silent
// `[WEB CONTEXT]` auto-injection removed (Phase 4). The web_search tool
// remains available for the operator to call when its own soul decides.
import { assembleOperatorPrompt, buildBirthSystemPrompt, buildTemporalContext, containsTimeKeywords } from '../utils/systemPrompt.js';
import { applyFirewall, isArchitectureQuestion, FIREWALL_SUBSTITUTE_REPLY } from '../utils/architectureFirewall.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
import type { SelfAwarenessSnapshot, BuildSystemPromptOpts } from '../utils/systemPrompt.js';
import { searchMemory, buildMemoryContext, distillMemoriesFromConversations, storeMemory, distillRawContentForMemory } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { decryptToken, encryptToken } from '@workspace/opsoul-utils/crypto';
import type { ChatMessage, ToolDefinition } from '../utils/openrouter.js';
import { buildOwnerScope, buildScopeContext, type ValidatedScope } from '../utils/scopeResolver.js';
import { scrapeUrl } from '../utils/urlScraper.js';
import type { ContentPart } from '../utils/openrouter.js';
import { verifyAndStore, persistKbSeedEntry } from '../utils/kbIntake.js';
import { eq, and, ne, asc, sql, desc } from 'drizzle-orm';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { isWebSearchAvailable, executeWebSearch } from '../utils/capabilityEngine.js';

interface ActiveSkill {
  name: string;
  instructions: string;
  customInstructions?: string | null;
  outputFormat?: string | null;
}

// Dead code removed 2026-05-13 (C — chat.ts cleanup, §7 SoT):
// LiveStationData interface, SKILL_HOW_TO + INTEGRATION_HOW_TO records,
// and buildStationContext function. These were the machinery behind the
// [STATION] and [OPERATOR STATE] role:'user' injection blocks, which
// violated § 3 rule 10 and § 4 architecture-as-secret. The blocks are
// removed in the message-assembly path further below; their support code
// goes with them.

const router = Router({ mergeParams: true });
router.use(requireAuth);

// ─── Schemas ────────────────────────────────────────────────────────────────

const AttachmentSchema = z.object({
  type: z.enum(['image', 'text', 'url']),
  content: z.string(),
  mimeType: z.string().optional(),
  name: z.string().optional(),
});

const SendMessageSchema = z.object({
  message: z.string().min(1, 'message is required').max(8000),
  stream: z.boolean().default(false),
  kbSearch: z.boolean().default(true),
  kbTopN: z.number().int().min(1).max(20).default(8),
  kbMinConfidence: z.number().int().min(0).max(100).default(30),
  attachments: z.array(AttachmentSchema).optional(),
});

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function resolveOperatorAndConv(
  req: Request,
  res: Response,
): Promise<{ operator: typeof operatorsTable.$inferSelect; conv: typeof conversationsTable.$inferSelect; scope: ValidatedScope } | null> {
  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId as string),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }

  const scope = buildOwnerScope(req.owner!.ownerId);

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, req.params.convId as string),
        eq(conversationsTable.operatorId, operator.id),
        eq(conversationsTable.scopeId, scope.scopeId),
      ),
    );
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return null;
  }

  return { operator, conv, scope };
}

async function buildMessageHistory(convId: string): Promise<ChatMessage[]> {
  const msgs = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(asc(messagesTable.createdAt));

  return msgs.filter(m => {
    // Sanitize corrupted assistant messages — "Human:" prefix is never valid
    // in an assistant turn; it means the model echoed the user during a bug.
    // Feeding it back would perpetuate the pattern every turn.
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trimStart().startsWith('Human:')) {
      return false;
    }
    return true;
  }) as ChatMessage[];
}

async function loadActiveSkills(operatorId: string): Promise<ActiveSkill[]> {
  const installs = await db
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
    .where(
      and(
        eq(operatorSkillsTable.operatorId, operatorId),
        eq(operatorSkillsTable.isActive, true),
      ),
    );

  return installs as unknown as ActiveSkill[];
}

// ─── Birth identity extraction ───────────────────────────────────────────────
// Silently extracts name/rawIdentity/archetype/mandate from the birth conversation

async function extractBirthIdentity(operatorId: string, conversationId: string): Promise<void> {
  // DB guard first — skip LLM entirely if rawIdentity is already written.
  // Handles stale in-memory state and concurrent duplicate calls.
  const [current] = await db
    .select({ rawIdentity: operatorsTable.rawIdentity })
    .from(operatorsTable)
    .where(eq(operatorsTable.id, operatorId));
  if (current?.rawIdentity) return;

  const msgs = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt));

  const transcript = msgs
    .map(m => `${m.role === 'user' ? 'Owner' : 'Operator'}: ${m.content}`)
    .join('\n');

  const extractionPrompt = `You are extracting the founding identity of an AI Operator from a birth conversation. The owner named the operator and described its purpose.

Conversation:
${transcript}

Extract exactly:
- name: what the owner said to call the operator (just the name, cleaned up, no extra text)
- rawIdentity: a 200-400 word first-person story, written as the operator speaking, based on what the owner described as the purpose
- archetype: pick as many as genuinely fit — no minimum, no maximum. From this exact list only: ["Executor", "Advisor", "Expert", "Connector", "Creator", "Guardian", "Builder", "Catalyst", "Analyst"]
- roles: pick as many as genuinely fit — no minimum, no maximum. Exact strings only from this list: ["Strategist", "Researcher", "Executive Assistant", "Data Analyst", "Legal Reviewer", "Content Writer", "Project Manager", "Account Advisor", "Risk Officer", "Coach", "Chief of Staff", "Operations Manager", "Business Analyst", "Financial Advisor", "Sales Advisor", "Marketing Strategist", "Brand Manager", "Product Manager", "Customer Success Manager", "Procurement Advisor", "Policy Analyst", "Compliance Officer", "Public Affairs Advisor", "Regulatory Advisor", "Governance Advisor", "Communications Officer", "Intelligence Analyst", "Program Manager", "Domain Expert", "Knowledge Manager", "Technical Advisor", "Scientific Advisor", "Innovation Advisor", "HR Advisor", "Training Advisor", "Wellness Coach", "Leadership Coach", "Technology Advisor", "Cybersecurity Advisor", "Data Engineer", "Systems Analyst", "Investment Advisor", "Sustainability Advisor", "Cultural Affairs Advisor"]
- mandate: one sentence starting with a verb, stating the operator's core purpose

Return ONLY valid JSON, no markdown, no explanation:
{"name":"...","rawIdentity":"...","archetype":["..."],"roles":["..."],"mandate":"..."}`;

  const result = await chatCompletion(
    [
      { role: 'system', content: 'You extract structured identity data from conversations. Return only valid JSON, no markdown, no explanation.' },
      { role: 'user', content: extractionPrompt },
    ],
    { model: CHAT_MODEL },
  );

  let extracted: { name: string; rawIdentity: string; archetype: string[]; roles: string[]; mandate: string };
  try {
    const raw = typeof result.content === 'string' ? result.content : '';
    extracted = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return;
  }

  if (!extracted.name || !extracted.rawIdentity || !extracted.archetype?.length || !extracted.mandate) return;

  await db.update(operatorsTable)
    .set({
      name: extracted.name,
      rawIdentity: extracted.rawIdentity,
      archetype: extracted.archetype,
      roles: extracted.roles ?? [],
      mandate: extracted.mandate,
    })
    .where(eq(operatorsTable.id, operatorId));
}


// ─── Agency Layer shared helpers ─────────────────────────────────────────────

// Builds the deduplicated skill list and applies the policy gate in one place.
function buildAgencySkills(
  skills: any[],
  archetypeDefaultSkills: InstalledSkill[],
  installedNames: Set<string>,
  operator: typeof operatorsTable.$inferSelect,
): InstalledSkill[] {
  let list: InstalledSkill[] = [
    ...skills.map((s: any) => ({
      installId:          s.id ?? s.skillId,
      skillId:            s.skillId,
      name:               s.name ?? s.skillName,
      triggerDescription: s.triggerDescription ?? '',
      instructions:       s.instructions ?? s.skillInstructions ?? '',
      outputFormat:       s.outputFormat ?? s.skillOutputFormat ?? null,
      customInstructions: s.customInstructions ?? null,
      integrationType:    s.integrationType ?? null,
    })),
    ...archetypeDefaultSkills
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

  // Policy gate — only enforced in free roaming mode.
  // In normal mode skills are owner pre-approved; no gate needed.
  if (operator.freeRoaming && operator.toolUsePolicy) {
    const rawPolicy = operator.toolUsePolicy;
    if (rawPolicy !== 'auto' && typeof rawPolicy === 'object' && rawPolicy !== null) {
      const allowedNames = new Set(Object.keys(rawPolicy as Record<string, unknown>));
      if (allowedNames.size > 0) {
        const before = list.length;
        list = list.filter(s => allowedNames.has(s.name));
        console.log(`[policy] free roaming — filtered skills ${before} → ${list.length} for operator ${operator.id}`);
      }
    } else {
      console.log(`[policy] free roaming — auto policy, all ${list.length} skills allowed for operator ${operator.id}`);
    }
  }

  return list;
}

// Extract up to 2 unique URLs from a message string
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) ?? [];
  return [...new Set(matches)].slice(0, 2);
}

// containsTimeKeywords moved to ../utils/systemPrompt.js — shared with
// public-chat.ts and any other route that needs hybrid time injection.

async function persistUrlScrapedResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  url: string,
  content: string,
  scopeId?: string,
  scopeTrust?: string,
): Promise<void> {
  let domain = url;
  try { domain = new URL(url).hostname; } catch { /* use full url */ }
  await db.insert(messagesTable).values({
    id:             crypto.randomUUID(),
    operatorId,
    conversationId: convId,
    role:           'system',
    content:        `[URL Content] ${url}\n${content}`,
  });

  // Distill the noisy raw content into one clean fact before persisting to
  // memory. Conversation log keeps the raw output above; long-term memory
  // gets only the filtered insight.
  distillRawContentForMemory(content, `URL: ${url}`)
    .then((distilled) => {
      if (!distilled) return;
      return storeMemory(
        operatorId,
        ownerId,
        `From ${domain}: ${distilled}`,
        'fact',
        'ai_distilled',
        0.6,
        false,
        scopeId,
        scopeTrust,
      );
    })
    .catch(() => {});
}

async function persistWebSearchResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  searchQuery: string,
  capResult: { output: string },
  mandate: string,
  scopeId?: string,
  scopeTrust?: string,
): Promise<void> {
  await db.insert(messagesTable).values({
    id:             crypto.randomUUID(),
    operatorId,
    conversationId: convId,
    role:           'system',
    content:        `[Web Search] ${searchQuery}\n${capResult.output}`,
  });

  verifyAndStore(
    operatorId,
    ownerId,
    capResult.output,
    `web_search:${searchQuery}`,
    searchQuery,
    mandate,
  ).catch(() => {});

  // Distill the raw search output into one clean fact before persisting to
  // memory. Conversation log keeps the raw snippet bundle above; long-term
  // memory gets only the filtered takeaway.
  distillRawContentForMemory(capResult.output, `web search: ${searchQuery}`)
    .then((distilled) => {
      if (!distilled) return;
      return storeMemory(
        operatorId,
        ownerId,
        `Web search "${searchQuery}": ${distilled}`,
        'fact',
        'ai_distilled',
        0.65,
        false,
        scopeId,
        scopeTrust,
      );
    })
    .catch(() => {});
}

// Persists a skill execution result to the conversation log, tasks table, and memory.
async function persistSkillResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  skillTrigger: { name: string; skillId: string },
  skillResult: { skillName: string; output: string },
): Promise<void> {
  await db.insert(messagesTable).values({
    id:             crypto.randomUUID(),
    operatorId,
    conversationId: convId,
    role:           'system',
    content:        `[Skill: ${skillResult.skillName}] Result:\n${skillResult.output}`,
  });

  await db.insert(tasksTable).values({
    id:               crypto.randomUUID(),
    operatorId,
    conversationId:   convId,
    contextName:      skillTrigger.name,
    taskType:         'skill_execution',
    integrationLabel: 'platform_skill',
    payload:          { skillId: skillTrigger.skillId, result: skillResult.output },
    status:           'completed',
    summary:          `Executed ${skillTrigger.name}`,
    completedAt:      new Date(),
  });

  console.log(`[agency] skill ${skillTrigger.name} executed and logged`);

  triggerSelfAwareness(operatorId, 'integration_change').catch((err) => console.warn('[selfAwareness] failed:', err?.message));

  // Distill the skill's raw output into one clean fact before persisting.
  // The conversation log keeps the full output above; memory gets the
  // filtered takeaway only.
  distillRawContentForMemory(skillResult.output, `skill: ${skillTrigger.name}`)
    .then((distilled) => {
      if (!distilled) return;
      return storeMemory(
        operatorId,
        ownerId,
        `Skill "${skillTrigger.name}": ${distilled}`,
        'pattern',
        'ai_distilled',
        0.6,
      );
    })
    .catch(() => {});
}

// Runs all post-response fire-and-forget tasks — identical for both stream and sync.
function runPostResponseTasks(
  operator: typeof operatorsTable.$inferSelect,
  conv: typeof conversationsTable.$inferSelect,
  finalContent: string,
  isBirthMode: boolean,
  scope: ValidatedScope,
): void {
  // [LEARN:] tag extraction — operator self-learning
  if (!operator.safeMode) {
    const learnMatches = finalContent.match(/\[LEARN:\s*(.*?)\]/gs);
    if (learnMatches && learnMatches.length > 0) {
      for (const match of learnMatches) {
        const text = match.replace(/\[LEARN:\s*/i, '').replace(/\]$/, '').trim();
        if (text.length > 20) {
          verifyAndStore(
            operator.id,
            operator.ownerId,
            text,
            'self_learn',
            'operator_self_learn',
            operator.mandate ?? '',
          ).catch(() => {});
        }
      }
    }
  }

  // Birth extraction — triggered after 2+ user messages in birth mode
  if (isBirthMode) {
    db.select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(eq(messagesTable.conversationId, conv.id), eq(messagesTable.role, 'user')))
      .then(userMessages => {
        if (userMessages.length >= 2) {
          extractBirthIdentity(operator.id, conv.id).catch((err) => console.warn('[runPostResponse] birth-extraction failed:', err?.message));
        }
      })
      .catch((err) => console.warn('[runPostResponse] birth-extraction query failed:', err?.message));
  }

  // Self-awareness + periodic memory distillation
  if (!operator.safeMode) {
    triggerSelfAwareness(operator.id, 'conversation_end').catch((err) => console.warn('[selfAwareness] failed:', err?.message));
    const shouldDistill = ((conv.messageCount ?? 0) % 10 === 0);
    if (shouldDistill) {
      distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name, scope.scopeId, scope.scopeTrust).catch((err) => console.warn('[runPostResponse] distill failed:', err?.message));
    }
  }
}

// Second-pass prompt used after a skill executes — same wording for both paths.

// ─── Soul-based failure response helper ──────────────────────────────────────

// ─── OAuth auto-injection for http_request tool ──────────────────────────────

const OAUTH_DOMAIN_MAP: Record<string, string> = {
  'gmail.googleapis.com':       'gmail',
  'api.github.com':             'github',
  'www.googleapis.com/calendar': 'google_calendar',
  'www.googleapis.com/drive':   'google_drive',
  'api.notion.com':             'notion',
  'slack.com/api':              'slack',
  'api.hubapi.com':             'hubspot',
  'api.linear.app':             'linear',
};

const GOOGLE_TYPES = new Set(['gmail', 'google_calendar', 'google_drive']);

function detectOAuthType(url: string): string | null {
  for (const [domain, type] of Object.entries(OAUTH_DOMAIN_MAP)) {
    if (url.includes(domain)) return type;
  }
  return null;
}

type IntegrationRow = typeof operatorIntegrationsTable.$inferSelect;

function extractTokenFromRow(row: IntegrationRow): string | null {
  if (!row.tokenEncrypted) return null;
  try {
    const raw = decryptToken(row.tokenEncrypted);
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed?.access_token === 'string') return parsed.access_token;
    } catch { /* plain token, not JSON */ }
    return raw;
  } catch {
    return null;
  }
}

async function refreshGoogleAccessToken(row: IntegrationRow): Promise<string | null> {
  try {
    let refreshToken: string | null = null;
    if (row.tokenEncrypted) {
      try {
        const raw = decryptToken(row.tokenEncrypted);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed?.refresh_token === 'string') refreshToken = parsed.refresh_token;
      } catch { /* skip */ }
    }
    if (!refreshToken && row.refreshTokenEncrypted) {
      try { refreshToken = decryptToken(row.refreshTokenEncrypted); } catch { /* skip */ }
    }
    if (!refreshToken) return null;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await resp.json() as { access_token?: string };
    if (!data.access_token) return null;

    const raw = decryptToken(row.tokenEncrypted!);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    await db.update(operatorIntegrationsTable)
      .set({ tokenEncrypted: encryptToken(JSON.stringify({ ...parsed, access_token: data.access_token })) })
      .where(eq(operatorIntegrationsTable.id, row.id));

    return data.access_token;
  } catch {
    return null;
  }
}

async function executeHttpWithOAuth(
  operatorId: string,
  httpArgs: { method: string; url: string; headers?: Record<string, string>; body?: string },
): Promise<string> {
  const integrationType = detectOAuthType(httpArgs.url);

  if (!integrationType) {
    return executeHttpRequest(operatorId, httpArgs);
  }

  const [integrationRow] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(and(
      eq(operatorIntegrationsTable.operatorId, operatorId),
      eq(operatorIntegrationsTable.integrationType, integrationType),
    ))
    .limit(1);

  if (!integrationRow) {
    return `HTTP 401 Unauthorized\nIntegration "${integrationType}" is not connected. Go to Integrations and connect it first.`;
  }

  const token = extractTokenFromRow(integrationRow);
  if (!token) {
    return `HTTP 401 Unauthorized\nIntegration "${integrationType}" has no valid token. Reconnect it in the Integrations tab.`;
  }

  const extraHeaders: Record<string, string> = integrationType === 'notion'
    ? { 'Notion-Version': '2022-06-28' }
    : {};

  const argsWithAuth = {
    ...httpArgs,
    headers: { ...httpArgs.headers, ...extraHeaders, Authorization: `Bearer ${token}` },
  };

  const result = await executeHttpRequest(operatorId, argsWithAuth);

  if (result.startsWith('HTTP 401') && GOOGLE_TYPES.has(integrationType)) {
    const newToken = await refreshGoogleAccessToken(integrationRow);
    if (!newToken) {
      return `HTTP 401 Unauthorized\nGoogle access token for "${integrationType}" expired and could not be refreshed. Reconnect it in the Integrations tab.`;
    }
    const argsRetry = {
      ...httpArgs,
      headers: { ...httpArgs.headers, ...extraHeaders, Authorization: `Bearer ${newToken}` },
    };
    return executeHttpRequest(operatorId, argsRetry);
  }

  if (result.startsWith('HTTP 401')) {
    return `HTTP 401 Unauthorized\nToken for "${integrationType}" was rejected. It may have expired or been revoked. Reconnect it in the Integrations tab.`;
  }

  return result;
}

function soulFailureResponse(operator: { rawIdentity?: string | null; name?: string | null }, tool: string, target: string, error: string): string {
  const soul = operator.rawIdentity ?? '';
  const isBrief = soul.length < 300 || /brief|concise|direct|short/i.test(soul);
  if (isBrief) {
    return `I tried a ${tool} call to ${target} — it failed with: ${error}. Waiting for your direction.`;
  }
  return `I attempted a ${tool} call to ${target}. It failed with: ${error}. I won't guess or retry blindly — let me know how you want to proceed.`;
}

// ─── Main route handler ──────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const ctx = await resolveOperatorAndConv(req, res);
  if (!ctx) return;

  const { operator, conv, scope } = ctx;

  const parsed = SendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { message, stream, kbSearch, kbTopN, kbMinConfidence, attachments } = parsed.data;

  const chatApiKey = operator.openrouterApiKey
    ? (() => { try { return decryptToken(operator.openrouterApiKey!); } catch { return undefined; } })()
    : undefined;
  const rawModel = operator.defaultModel || CHAT_MODEL;
  let chatModel = rawModel;
  const chatOpts = { apiKey: chatApiKey, get model() { return chatModel; } };

  // Stale queries removed 2026-05-13 (C — chat.ts cleanup): the old [STATION]
  // injection prefetched integrations / tasks / files / slots into a literal
  // that was dumped into the operator prompt. The block was removed; the queries
  // went with it. liveSecrets is kept — still used by httpRequestTool gating below.
  const [skills, archetypeDefaultSkills, selfAwarenessRow, history, liveSecrets] = await Promise.all([
    loadActiveSkills(operator.id),
    loadArchetypeSkills((operator.archetype as string[]) ?? []),
    db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operator.id)).limit(1),
    buildMessageHistory(conv.id),
    db.select({ key: operatorSecretsTable.key })
      .from(operatorSecretsTable)
      .where(eq(operatorSecretsTable.operatorId, operator.id)),
  ]);

  const selfAwarenessData = selfAwarenessRow[0] ?? null;
  const storedIdentity = selfAwarenessData?.identityState as Record<string, unknown> | null | undefined;
  const storedTaskHistory = selfAwarenessData?.taskHistory as {
    successRate?: number;
    taskTypeBreakdown?: Record<string, { total: number; succeeded: number; failed: number }>;
    last30Tasks?: { taskType: string }[];
  } | null | undefined;

  const selfAwareness: SelfAwarenessSnapshot | null = selfAwarenessData
    ? {
        healthScore: selfAwarenessData.healthScore as { score: number; label: string } | null,
        mandateGaps: selfAwarenessData.mandateGaps ?? null,
        lastUpdateTrigger: selfAwarenessData.lastUpdateTrigger ?? null,
        lastUpdated: selfAwarenessData.lastUpdated ?? null,
        growLockLevel: (storedIdentity?.growLockLevel as string | null) ?? null,
        soulState: selfAwarenessData.soulState as SelfAwarenessSnapshot['soulState'],
        capabilityState: selfAwarenessData.capabilityState as SelfAwarenessSnapshot['capabilityState'],
        taskSummary: storedTaskHistory
          ? {
              successRate: storedTaskHistory.successRate ?? 100,
              recentTypes: [
                ...new Set(
                  (storedTaskHistory.last30Tasks ?? []).map((t) => t.taskType).filter(Boolean),
                ),
              ].slice(0, 5),
            }
          : null,
        workspaceManifest: selfAwarenessData.workspaceManifest as SelfAwarenessSnapshot['workspaceManifest'],
      }
    : null;

  // Q7 — Sycophancy detection: cosine distance between first and last assistant message.
  // Only runs when there are 6+ messages in history. Silently adds position-hold reminder to prompt.
  let sycophancyWarning = false;
  if (history.length >= 6) {
    const assistantMsgs = history.filter((m) => m.role === 'assistant');
    if (assistantMsgs.length >= 2) {
      try {
        const firstContent = assistantMsgs[0].content;
        const lastContent = assistantMsgs[assistantMsgs.length - 1].content;
        if (typeof firstContent === 'string' && typeof lastContent === 'string') {
          const dist = await semanticDistance(firstContent, lastContent);
          sycophancyWarning = dist > 0.35;
        }
      } catch {
        // non-critical — skip silently
      }
    }
  }

  // Q8 — Soul anchoring: if history token estimate exceeds 40% of 128k context window,
  // reinject Layer 0 + Layer 1 at top of system prompt to reinforce identity.
  const CONTEXT_WINDOW = 128_000;
  const ANCHOR_THRESHOLD = Math.floor(CONTEXT_WINDOW * 0.4); // 51,200 tokens
  const historyTokenEstimate = history.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
  const soulAnchorActive = historyTokenEstimate > ANCHOR_THRESHOLD;

  // T2 — Language detection: Arabic Unicode blocks (Arabic, Arabic Supplement, Arabic Extended-A)
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(message);
  const languageInstruction = hasArabic
    ? 'The user is writing in Arabic. Respond in Arabic. Match their dialect if possible.'
    : undefined;

  // Owner-scope context: tell the operator they are in their private workspace
  // with their owner (named when available), and which conversation reference
  // applies. The operator reads this BEFORE its own identity, knowledge, or
  // character — same way a person reads the room before they speak.
  let ownerName: string | null = null;
  try {
    const [ownerRow] = await db
      .select({ name: ownersTable.name })
      .from(ownersTable)
      .where(eq(ownersTable.id, req.owner!.ownerId));
    ownerName = ownerRow?.name ?? null;
  } catch {
    // non-fatal — fall back to "your owner" without a name
    ownerName = null;
  }
  const scopeLine = buildScopeContext({
    scope,
    conversationId: conv.id,
    ownerName,
  });
  const promptOpts: BuildSystemPromptOpts = { sycophancyWarning, soulAnchorActive, languageInstruction, scopeLine };

  // Merge archetype-born skills with owner-installed skills.
  // Installed skills win on name conflict — archetype defaults fill in the rest.
  const installedNames = new Set(skills.map((s: any) => s.name));
  const mergedSkills: ActiveSkill[] = [
    ...skills,
    ...(archetypeDefaultSkills.filter(a => !installedNames.has(a.name)) as unknown as ActiveSkill[]),
  ];

  let kbContext = '';
  let memoryHits: MemoryHit[] = [];

  if (kbSearch) {
    try {
      const queryEmbedding = await embed(message);
      const [kbHits, memHits] = await Promise.all([
        searchBothKbs(operator.id, queryEmbedding, kbTopN, kbMinConfidence, operator.archetype ?? [], operator.domainTags ?? []),
        searchMemory(operator.id, queryEmbedding, undefined, undefined, undefined, scope.scopeId),
      ]);
      kbContext = buildRagContext(kbHits);
      memoryHits = memHits;
    } catch {
      kbContext = '';
      memoryHits = [];
    }
  }

  // Auto routing — resolved after kbContext and memoryHits are known
  chatModel = (() => {
    if (rawModel !== 'opsoul/auto') return rawModel;
    const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
    const isShort = message.length < 200;
    const hasContext = kbContext.length > 0 || memoryHits.length > 0;
    // Never route to Haiku when web search is available — Haiku narrates instead of calling tools
    const webSearchActive = isWebSearchAvailable();
    let resolved = hasAttachment
      ? 'google/gemini-flash-2.0'
      : isShort && !hasContext && !webSearchActive
        ? 'anthropic/claude-haiku-4-5'
        : 'anthropic/claude-sonnet-4-5';
    // Force vision-capable model when image attachments are present
    const hasImageAttachment = Array.isArray(attachments) && attachments.some((a) => a.type === 'image');
    if (hasImageAttachment) {
      resolved = 'google/gemini-2.0-flash-001';
    }
    console.log(`[AUTO] routed → ${resolved} | short=${isShort} attachment=${hasAttachment} image=${hasImageAttachment} hasContext=${hasContext} webSearch=${webSearchActive}`);
    return resolved;
  })();

  // BIRTH MODE — operator has no identity yet; use birth system prompt instead of Layer 1
  const isBirthMode = !operator.rawIdentity;

  // ── INPUT FIREWALL ──
  // ── OPERATOR-IN-CONTROL ───────────────────────────────────────────────
  // STEP 1 — Operator analyses the user message BEFORE any LLM is called.
  // The OperatorAgent owns the decision; this route just executes what
  // the operator decides. Today's analyse() returns either 'execute'
  // (dispatch the LLM) or 'refuse_architecture' (operator handles the
  // refusal directly in its own voice). See utils/operatorAgent.ts for
  // the full contract and Step 2 plans.
  const agent = new OperatorAgent({
    operatorId: operator.id,
    operatorName: operator.name,
    isBirthMode,
    scopeType: scope.scopeType,
  });

  const decision = agent.analyse(message);

  if (decision.kind === 'refuse_architecture') {
    const refusalText = agent.composeArchitectureRefusal();
    console.warn('[operator:refuse]', JSON.stringify({
      path: 'chat',
      operatorId: operator.id,
      conversationId: conv.id,
      reason: 'architecture_introspection',
      message: message.slice(0, 200),
    }));
    const subId = crypto.randomUUID();
    await db.insert(messagesTable).values({
      id: subId,
      conversationId: conv.id,
      operatorId: operator.id,
      role: 'assistant',
      content: refusalText,
      model: 'operator-direct',
    });
    await db.update(conversationsTable)
      .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ delta: refusalText })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, messageId: subId })}\n\n`);
      res.end();
    } else {
      res.json({
        messageId: subId,
        content: refusalText,
        model: 'operator-direct',
      });
    }
    return;
  }
  // STEP 2 — Operator dispatches the LLM as executor (the existing chat
  // pipeline below: tool-loop, streaming, retrieval-augmented context).
  // STEP 3 — Operator validates the LLM's draft (applyFirewall calls
  // below) before delivery to the user.

  let systemPrompt = isBirthMode
    ? buildBirthSystemPrompt()
    : assembleOperatorPrompt(operator, selfAwareness, promptOpts);

  // ── HYBRID TIME INJECTION ────────────────────────────────────────────────
  // Owner direction 2026-05-14: live time is non-negotiable. Sonnet did not
  // reliably reach for the get_current_time tool when needed (probe 8
  // hallucinated January 2025). The hybrid approach: detect time-relevant
  // keywords in the current user message; when found, prepend the current
  // time as a fact to the prompt. The get_current_time tool stays available
  // for explicit timezone queries ("what time in Tokyo"). For the 90% of
  // conversations that do not reference time, the prompt carries no time
  // line at all — preserves the "knowledge accessible, not forced into soul"
  // principle. The clock comes out of the pocket only when needed.
  if (!isBirthMode && containsTimeKeywords(message)) {
    systemPrompt = `**Current time:** ${buildTemporalContext(new Date())}.\n\n${systemPrompt}`;
  }

  // Build user content — plain string or multimodal array when attachments present
  let userContent: string | ContentPart[] = message;
  if (attachments && attachments.length > 0) {
    const parts: ContentPart[] = [{ type: 'text', text: message }];
    for (const att of attachments) {
      if (att.type === 'image') {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${att.mimeType ?? 'image/jpeg'};base64,${att.content}` },
        });
      } else if (att.type === 'text') {
        parts.push({
          type: 'text',
          text: `[Attached file: ${att.name ?? 'document'}]\n${att.content}`,
        });
      } else if (att.type === 'url') {
        try {
          const scraped = await scrapeUrl(att.content);
          parts.push({ type: 'text', text: `[Content from ${att.content}]:\n${scraped}` });
        } catch {
          parts.push({ type: 'text', text: `[URL: ${att.content} — could not be fetched]` });
        }
      }
    }
    userContent = parts;
  }

  // SENSES → KB PERSISTENCE
  // Text attachments and URLs are persisted to Learned KB (fire-and-forget).
  // Images are context-only (no text to store).
  if (!operator.safeMode && attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === 'text' && att.content.length > 100) {
        verifyAndStore(
          operator.id,
          operator.ownerId,
          att.content,
          'file_upload',
          att.name ?? 'uploaded_document',
          operator.mandate ?? '',
        ).catch(() => {});
      } else if (att.type === 'url') {
        try {
          const scraped = await scrapeUrl(att.content);
          if (scraped && scraped.length > 100) {
            verifyAndStore(
              operator.id,
              operator.ownerId,
              scraped,
              att.content,
              att.content,
              operator.mandate ?? '',
            ).catch(() => {});
          }
        } catch {
          // scrape failed — already handled in the parts builder above
        }
      }
    }
  }

  // ── System prompt is built unlabeled (per § 3 rule 10). KB hits + memory
  // hits + DNA spirit get woven into the system prompt as the operator's
  // absorbed knowledge — never as labeled role:'user' exhibits. Counts of
  // KB/memory are operator metadata (not for the operator's mouth) — omitted.
  // [STATION] block removed: operator can call list_files / list_secrets /
  // similar skills on demand. The tools array passed to streamChat already
  // gives the LLM functional info about available tools — duplicating it as
  // a prompt exhibit only created labels the LLM quoted back to users.
  //
  // The DNA pull stays (operator carries absorbed identity from approved DNA
  // entries), but it's now mixed into the system prompt without the
  // "[OPSOUL IDENTITY]" label and without the "This is who you are and how
  // OpSoul works" preamble (which the LLM treated as user-facing context).
  const dnaEntries = await db
    .select({ content: ragDnaTable.content })
    .from(ragDnaTable)
    .where(and(
      eq(ragDnaTable.isActive, true),
      ne(ragDnaTable.layer, 'l4_platform'),
    ))
    .orderBy(desc(ragDnaTable.confidence))
    .limit(12);

  const promptSections: string[] = [systemPrompt];

  if (dnaEntries.length > 0) {
    promptSections.push(dnaEntries.map((e) => e.content).join('\n\n'));
  }

  if (kbContext && kbContext.trim()) {
    promptSections.push(kbContext.trim());
  }

  if (memoryHits && memoryHits.length > 0) {
    const memLines = memoryHits.map((m: MemoryHit) => m.content).join('\n');
    promptSections.push(memLines);
  }

  const fullSystemPrompt = promptSections.join('\n\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: fullSystemPrompt },
    ...history,
  ];

  messages.push({ role: 'user', content: userContent });

  // Save the user message and lock Layer 1 if still unlocked
  await db.insert(messagesTable).values({
    id: crypto.randomUUID(),
    conversationId: conv.id,
    operatorId: operator.id,
    role: 'user',
    content: message,
    tokenCount: null,
  });

  await lockLayer1IfUnlocked(operator.id);

  // Web search tool — offered to the operator; the operator decides when to call it
  const webSearchTool: ToolDefinition | null = isWebSearchAvailable()
    ? {
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Issues a search query and returns ranked results — URLs and text snippets from matching pages.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Concise search query, 3–8 words' },
            },
            required: ['query'],
          },
        },
      }
    : null;

  // KB seed tool — lets the operator persist a synthesized knowledge entry directly.
  // Offered alongside web_search (same availability gate). Skips curiositySearch since
  // the operator has already done the research; entries land pending for VAEL cron verification.
  const kbSeedTool: ToolDefinition | null = isWebSearchAvailable()
    ? {
        type: 'function',
        function: {
          name: 'kb_seed',
          description: 'Adds an entry to the operator\'s knowledge base. The entry is embedded at insertion time and becomes retrievable in subsequent conversations. New entries land in pending state for verification.',
          parameters: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The knowledge content to store — a self-contained factual chunk, typically 100–400 words.',
              },
              source: {
                type: 'string',
                description: 'Source identifier(s) the entry was derived from (e.g. "Google AI Blog 2024, MIT study on transformer efficiency").',
              },
              confidence: {
                type: 'number',
                description: 'Confidence score 0–100 reflecting expected reliability of the entry.',
              },
            },
            required: ['content', 'source', 'confidence'],
          },
        },
      }
    : null;

  // write_file tool — always offered; operator creates/updates files in their workspace
  const writeFileTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Creates or replaces a file in the operator\'s workspace under a chosen name. Files persist across conversations and appear in the Files tab.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename including extension (e.g. "report.md", "todo.txt")' },
          content: { type: 'string', description: 'Full file content as a string.' },
          action: { type: 'string', enum: ['create', 'update'], description: '\'create\' for a new file, \'update\' to overwrite an existing one.' },
        },
        required: ['filename', 'content', 'action'],
      },
    },
  };

  // http_request tool — only offered when the operator has stored secrets
  const httpRequestTool: ToolDefinition | null = liveSecrets.length > 0 ? {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Issues an HTTP request to an external endpoint. Stored secrets are referenced via the {{SECRET_NAME}} syntax in URL, headers, or body; the label resolves to its value at call time. Available stored secret labels: ' + (liveSecrets.length > 0 ? liveSecrets.map(s => `{{${s}}}`).join(', ') : '(none stored)') + '.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
          url: { type: 'string', description: 'Full URL including query parameters' },
          headers: {
            type: 'object',
            description: 'HTTP headers as key-value pairs. {{SECRET_NAME}} placeholders are resolved to stored secret values at call time.',
            additionalProperties: { type: 'string' },
          },
          body: {
            type: 'string',
            description: 'Request body as a JSON string (for POST/PUT/PATCH). {{SECRET_NAME}} placeholders are resolved to stored secret values at call time.',
          },
        },
        required: ['method', 'url'],
      },
    },
  } : null;

  // read_file tool — always offered; operator can re-read its own workspace
  const readFileTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Returns the contents of a workspace file by name.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename including extension. Must match an existing file exactly.' },
        },
        required: ['filename'],
      },
    },
  };

  // list_files tool — always offered; operator can see what is in its workspace
  const listFilesTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Enumerates files present in the workspace with size and last-update timestamp.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  };

  // get_current_time tool — always offered; operator pulls current time when
  // a time-relative question arises. Replaces the previous always-on temporal
  // substrate auto-injection. Operator carries no time in its head; calls the
  // tool when it needs to know.
  const getCurrentTimeTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Returns the current date and time. Defaults to Asia/Dubai (GST). Optional timezone parameter accepts an IANA timezone identifier (e.g. "America/New_York", "Asia/Tokyo", "Europe/London", "UTC") for time elsewhere in the world.',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA timezone identifier. Defaults to Asia/Dubai when omitted.',
          },
        },
        required: [],
      },
    },
  };

  // schedule_task tool — always offered; operator can create its own automations
  const scheduleTaskTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'schedule_task',
      description: 'Creates a recurring task with a daily or weekly schedule. The task fires on schedule, executing a stored prompt against the operator.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short label for the task (shown in the Tasks tab).' },
          prompt: { type: 'string', description: 'The prompt that will execute on each scheduled run. Read by the next-run instance of the operator as its task brief.' },
          schedule: { type: 'string', enum: ['daily', 'weekly'], description: 'How often the task fires.' },
        },
        required: ['name', 'prompt', 'schedule'],
      },
    },
  };

  // update_task tool — change name, prompt, or schedule of an existing automation
  const updateTaskTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Modifies the name, prompt, or schedule of an existing task, identified by its current name.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Current name of the task to update.' },
          newName: { type: 'string', description: 'Optional new name.' },
          newPrompt: { type: 'string', description: 'Optional new prompt — what each future run will read.' },
          newSchedule: { type: 'string', enum: ['daily', 'weekly'], description: 'Optional new schedule.' },
        },
        required: ['name'],
      },
    },
  };

  // pause_task tool — stop a task from firing without deleting it
  const pauseTaskTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'pause_task',
      description: 'Sets a task to paused state. A paused task is preserved but does not fire on its schedule.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the task to pause.' },
        },
        required: ['name'],
      },
    },
  };

  // resume_task tool — restart a paused task
  const resumeTaskTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'resume_task',
      description: 'Sets a paused task to active state, resuming its scheduled firing.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the paused task to resume.' },
        },
        required: ['name'],
      },
    },
  };

  // delete_task tool — retire a task permanently
  const deleteTaskTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Removes a task permanently from the operator\'s task list.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the task to delete.' },
        },
        required: ['name'],
      },
    },
  };

  // ─── STREAMING PATH ────────────────────────────────────────────────────────

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Transfer-Encoding', 'chunked');
    // Disable TCP Nagle algorithm — every write() flushes to the wire immediately
    // instead of waiting to batch small packets. Critical for token-by-token streaming.
    (res.socket as any)?.setNoDelay?.(true);
    res.flushHeaders();

    let fullContent = '';
    let completionTokens = 0;
    let promptTokens = 0;
    let messageSaved = false;

    // Keepalive: ping every 15s so the reverse proxy never idles out a long run
    const keepalive = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch { /* connection already gone */ }
    }, 15_000);

    const cleanupKeepalive = () => clearInterval(keepalive);

    req.on('close', async () => {
      cleanupKeepalive();
      if (!messageSaved && fullContent.length > 20) {
        try {
          await db.insert(messagesTable).values({
            id: crypto.randomUUID(),
            conversationId: conv.id,
            operatorId: operator.id,
            role: 'assistant',
            content: fullContent,
            tokenCount: null,
          });
          await db.update(conversationsTable)
            .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
            .where(eq(conversationsTable.id, conv.id));
          console.log(`[chat] partial message saved on disconnect (${fullContent.length} chars)`);
        } catch {
          // best-effort
        }
      }
    });

    try {
      // URL auto-reading — scrape URLs mentioned in the message and inject content before responding
      for (const url of extractUrls(message)) {
        res.write(`data: ${JSON.stringify({ reading: url })}\n\n`);
        const scraped = await scrapeUrl(url).catch(() => null);
        if (scraped && scraped.length > 200) {
          messages.push({ role: 'system', content: `[URL Content: ${url}]\n${scraped}` });
          await persistUrlScrapedResult(operator.id, operator.ownerId, conv.id, url, scraped, scope.scopeId, scope.scopeTrust);
        }
      }

      // ── AGENT LOOP ────────────────────────────────────────────────────────
      // Each iteration: stream LLM → if tool call, execute and loop back.
      // Up to MAX_ITER tool calls per turn. Only the last clean (no-tool) response
      // is saved to DB. All tokens stream live to the browser throughout.
      const MAX_ITER = 8;
      const MAX_SEARCHES = 5;
      const loopMessages: ChatMessage[] = [...messages];
      let finalContent = '';
      let finalTokens = 0;
      let webSearchCount = 0;
      let httpRequestFired = false;

      for (let iter = 0; iter < MAX_ITER; iter++) {
        let iterContent = '';
        const iterFullStart = fullContent.length; // mark start of this iteration in fullContent
        let iterToolCall: { id: string; name: string; args: string } | undefined;

        const iterTools: ToolDefinition[] = [];
        if (webSearchTool && webSearchCount < MAX_SEARCHES) iterTools.push(webSearchTool);
        if (kbSeedTool) iterTools.push(kbSeedTool);
        iterTools.push(writeFileTool);
        iterTools.push(readFileTool);
        iterTools.push(listFilesTool);
        iterTools.push(getCurrentTimeTool);
        iterTools.push(scheduleTaskTool);
        iterTools.push(updateTaskTool);
        iterTools.push(pauseTaskTool);
        iterTools.push(resumeTaskTool);
        iterTools.push(deleteTaskTool);
        if (httpRequestTool) iterTools.push(httpRequestTool);
        const iterOpts = {
          ...chatOpts,
          tools: iterTools.length > 0 ? iterTools : undefined,
        };

        for await (const chunk of streamChat(loopMessages, iterOpts)) {
          if (chunk.delta) {
            iterContent += chunk.delta;
            fullContent += chunk.delta;
            res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
          }
          if (chunk.toolCall) {
            iterToolCall = chunk.toolCall;
          }
          if (chunk.done && chunk.usage) {
            promptTokens += chunk.usage.promptTokens;
            completionTokens += chunk.usage.completionTokens;
          }
        }

        // ── WEB SEARCH TOOL CALL ───────────────────────────────────────────
        if (iterToolCall?.name === 'web_search') {
          let searchQuery = '';
          try { searchQuery = JSON.parse(iterToolCall.args).query ?? ''; } catch { /* skip */ }

          if (searchQuery) {
            console.log(`[agency] loop iter ${iter} — web search: "${searchQuery}"`);
            res.write(`data: ${JSON.stringify({ searching: searchQuery })}\n\n`);
            const capResult = await executeWebSearch(searchQuery);

            if (capResult.success) {
              await persistWebSearchResult(operator.id, operator.ownerId, conv.id, searchQuery, capResult, operator.mandate ?? '', scope.scopeId, scope.scopeTrust);
              webSearchCount++;

              // Inject the assistant turn + tool result so the model has full context
              loopMessages.push(
                {
                  role: 'assistant',
                  content: iterContent || '',
                  tool_calls: [{
                    id: iterToolCall.id,
                    type: 'function',
                    function: { name: 'web_search', arguments: iterToolCall.args },
                  }],
                },
                { role: 'tool', content: capResult.output, tool_call_id: iterToolCall.id },
              );
              continue; // loop: LLM sees the result and decides what to do next
            }
          }

          // Search failed or empty query — what we have is the final response
          finalContent = iterContent;
          break;
        }

        // ── KB SEED TOOL CALL ──────────────────────────────────────────────
        if (iterToolCall?.name === 'kb_seed') {
          let seedArgs: { content?: string; source?: string; confidence?: number } = {};
          try { seedArgs = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (seedArgs.content && seedArgs.source) {
            const confidence = typeof seedArgs.confidence === 'number' ? seedArgs.confidence : 65;
            console.log(`[agency] loop iter ${iter} — kb_seed: "${seedArgs.source}" (confidence ${confidence})`);
            res.write(`data: ${JSON.stringify({ seeding: seedArgs.source })}\n\n`);

            const seedResult = await persistKbSeedEntry(
              operator.id,
              operator.ownerId,
              seedArgs.content,
              seedArgs.source,
              confidence,
            );

            const toolResultText = seedResult.stored
              ? `Entry stored successfully. Confidence: ${Math.max(40, Math.min(85, Math.round(confidence)))}. Status: pending — queued for VAEL pipeline verification.`
              : `Entry not stored: ${seedResult.reason}`;

            if (seedResult.stored) {
              storeMemory(
                operator.id,
                operator.ownerId,
                `Knowledge entry seeded: "${seedArgs.source}". ${seedArgs.content!.slice(0, 300)}`,
                'fact',
                'ai_distilled',
                confidence / 100,
              ).catch(() => {});
            }

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{
                  id: iterToolCall.id,
                  type: 'function',
                  function: { name: 'kb_seed', arguments: iterToolCall.args },
                }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          // Missing required args — treat as final response
          finalContent = iterContent;
          break;
        }

        // ── WRITE FILE TOOL CALL ───────────────────────────────────────────
        if (iterToolCall?.name === 'write_file') {
          let fileArgs: { filename?: string; content?: string; action?: string } = {};
          try { fileArgs = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (fileArgs.filename && fileArgs.content) {
            console.log(`[agency] loop iter ${iter} — write_file: "${fileArgs.filename}"`);
            res.write(`data: ${JSON.stringify({ writing: fileArgs.filename })}\n\n`);

            const existing = await db.select({ id: operatorFilesTable.id })
              .from(operatorFilesTable)
              .where(and(eq(operatorFilesTable.operatorId, operator.id), eq(operatorFilesTable.filename, fileArgs.filename)))
              .limit(1);

            let fileId: string;
            if (existing.length > 0 && fileArgs.action !== 'create') {
              fileId = existing[0].id;
              await db.update(operatorFilesTable).set({ content: fileArgs.content, updatedAt: new Date() }).where(eq(operatorFilesTable.id, fileId));
            } else {
              fileId = crypto.randomUUID();
              await db.insert(operatorFilesTable).values({ id: fileId, operatorId: operator.id, ownerId: operator.ownerId, filename: fileArgs.filename, content: fileArgs.content });
            }

            res.write(`data: ${JSON.stringify({ file_created: { id: fileId, filename: fileArgs.filename } })}\n\n`);
            const toolResultText = `File "${fileArgs.filename}" ${existing.length > 0 && fileArgs.action !== 'create' ? 'updated' : 'created'}. Owner can see and download it from the Files tab.`;

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'write_file', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }

        // ── HTTP REQUEST TOOL CALL ─────────────────────────────────────────
        if (iterToolCall?.name === 'http_request') {
          let httpArgs: { method: string; url: string; headers?: Record<string, string>; body?: string } = { method: 'GET', url: '' };
          try { httpArgs = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (httpArgs.url) {
            httpRequestFired = true;
            // Strip any pre-call narration text from fullContent — text streamed
            // before a tool fires is noise, not a response (covers consecutive tool calls too)
            fullContent = fullContent.slice(0, iterFullStart);
            console.log(`[agency] loop iter ${iter} — http_request: ${httpArgs.method} ${httpArgs.url}`);
            res.write(`data: ${JSON.stringify({ calling: httpArgs.url })}\n\n`);
            let toolResultText: string;
            try {
              toolResultText = await executeHttpWithOAuth(operator.id, httpArgs);
            } catch (err: any) {
              finalContent = soulFailureResponse(operator, 'http_request', httpArgs.url, err.message);
              fullContent += finalContent;
              res.write(`data: ${JSON.stringify({ delta: finalContent })}\n\n`);
              break; // never goes back to LLM
            }
            // HTTP succeeded — persist and feed back into the loop
            await db.insert(messagesTable).values({
              id: crypto.randomUUID(),
              conversationId: conv.id,
              operatorId: operator.id,
              role: 'system',
              content: `[HTTP Response]\n${toolResultText}`,
            });
            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'http_request', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: `[HTTP Response]\n${toolResultText}`, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }

        // ── READ FILE TOOL CALL ────────────────────────────────────────────
        if (iterToolCall?.name === 'read_file') {
          let readArgs: { filename?: string } = {};
          try { readArgs = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (readArgs.filename) {
            console.log(`[agency] loop iter ${iter} — read_file: "${readArgs.filename}"`);
            res.write(`data: ${JSON.stringify({ reading: readArgs.filename })}\n\n`);

            const [file] = await db.select({ content: operatorFilesTable.content })
              .from(operatorFilesTable)
              .where(and(eq(operatorFilesTable.operatorId, operator.id), eq(operatorFilesTable.filename, readArgs.filename)))
              .limit(1);

            const toolResultText = file
              ? `File "${readArgs.filename}":\n${file.content}`
              : `File "${readArgs.filename}" not found in your workspace.`;

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'read_file', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }

        // ── LIST FILES TOOL CALL ───────────────────────────────────────────
        if (iterToolCall?.name === 'list_files') {
          console.log(`[agency] loop iter ${iter} — list_files`);
          res.write(`data: ${JSON.stringify({ listing: 'workspace files' })}\n\n`);

          const files = await db.select({
            filename: operatorFilesTable.filename,
            updatedAt: operatorFilesTable.updatedAt,
            content: operatorFilesTable.content,
          })
            .from(operatorFilesTable)
            .where(eq(operatorFilesTable.operatorId, operator.id));

          const toolResultText = files.length === 0
            ? 'Your workspace has no files yet.'
            : files
                .map((f) => `- ${f.filename} (${f.content.length} chars, updated ${f.updatedAt?.toISOString() ?? 'unknown'})`)
                .join('\n');

          loopMessages.push(
            {
              role: 'assistant',
              content: iterContent || '',
              tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'list_files', arguments: iterToolCall.args } }],
            },
            { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
          );
          continue;
        }

        // ── GET CURRENT TIME TOOL CALL ─────────────────────────────────────
        if (iterToolCall?.name === 'get_current_time') {
          let timeArgs: { timezone?: string } = {};
          try { timeArgs = JSON.parse(iterToolCall.args); } catch { /* default to Asia/Dubai */ }
          const tz = timeArgs.timezone || 'Asia/Dubai';
          console.log(`[agency] loop iter ${iter} — get_current_time (${tz})`);
          res.write(`data: ${JSON.stringify({ checking_time: tz })}\n\n`);

          let toolResultText: string;
          try {
            toolResultText = buildTemporalContext(new Date(), tz);
          } catch (err: any) {
            toolResultText = `Invalid timezone "${tz}". The timezone parameter accepts IANA identifiers such as "Asia/Dubai", "America/New_York", "Europe/London", "UTC".`;
          }

          loopMessages.push(
            {
              role: 'assistant',
              content: iterContent || '',
              tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'get_current_time', arguments: iterToolCall.args } }],
            },
            { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
          );
          continue;
        }

        // ── SCHEDULE TASK TOOL CALL ────────────────────────────────────────
        if (iterToolCall?.name === 'schedule_task') {
          let taskArgs: { name?: string; prompt?: string; schedule?: string } = {};
          try { taskArgs = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (taskArgs.name && taskArgs.prompt && (taskArgs.schedule === 'daily' || taskArgs.schedule === 'weekly')) {
            console.log(`[agency] loop iter ${iter} — schedule_task: "${taskArgs.name}" (${taskArgs.schedule})`);
            res.write(`data: ${JSON.stringify({ scheduling: taskArgs.name })}\n\n`);

            const intervalMs = taskArgs.schedule === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
            const taskId = crypto.randomUUID();
            await db.insert(tasksTable).values({
              id: taskId,
              operatorId: operator.id,
              conversationId: conv.id,
              contextName: taskArgs.name,
              taskType: taskArgs.schedule,
              integrationLabel: 'self_scheduled',
              prompt: taskArgs.prompt,
              payload: { description: taskArgs.prompt, scheduledBy: 'operator' },
              status: 'active',
              nextRunAt: new Date(Date.now() + intervalMs),
            });

            const toolResultText = `Task "${taskArgs.name}" scheduled to run ${taskArgs.schedule}. First run at ${new Date(Date.now() + intervalMs).toISOString()}. Owner can pause or edit it from the Tasks tab.`;

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'schedule_task', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }

        // ── UPDATE TASK TOOL CALL ──────────────────────────────────────────
        if (iterToolCall?.name === 'update_task') {
          let upd: { name?: string; newName?: string; newPrompt?: string; newSchedule?: string } = {};
          try { upd = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (upd.name) {
            const [task] = await db.select({ id: tasksTable.id })
              .from(tasksTable)
              .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, upd.name)))
              .limit(1);

            let toolResultText: string;
            if (!task) {
              toolResultText = `No task named "${upd.name}" found in your station.`;
            } else {
              const patch: Record<string, unknown> = {};
              if (upd.newName) patch.contextName = upd.newName;
              if (upd.newPrompt) patch.prompt = upd.newPrompt;
              if (upd.newSchedule === 'daily' || upd.newSchedule === 'weekly') patch.taskType = upd.newSchedule;
              if (Object.keys(patch).length === 0) {
                toolResultText = `No fields to update on "${upd.name}".`;
              } else {
                await db.update(tasksTable).set(patch).where(eq(tasksTable.id, task.id));
                console.log(`[agency] loop iter ${iter} — update_task: "${upd.name}"`);
                res.write(`data: ${JSON.stringify({ updating_task: upd.name })}\n\n`);
                toolResultText = `Task "${upd.name}" updated.`;
              }
            }

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'update_task', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }

        // ── PAUSE TASK TOOL CALL ───────────────────────────────────────────
        if (iterToolCall?.name === 'pause_task') {
          let p: { name?: string } = {};
          try { p = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (p.name) {
            const result = await db.update(tasksTable)
              .set({ status: 'paused' })
              .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, p.name)))
              .returning({ id: tasksTable.id });

            const toolResultText = result.length > 0
              ? `Task "${p.name}" paused. It will not fire until you resume it.`
              : `No task named "${p.name}" found in your station.`;

            console.log(`[agency] loop iter ${iter} — pause_task: "${p.name}" (${result.length} rows)`);
            res.write(`data: ${JSON.stringify({ pausing_task: p.name })}\n\n`);

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'pause_task', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }

        // ── RESUME TASK TOOL CALL ──────────────────────────────────────────
        if (iterToolCall?.name === 'resume_task') {
          let r: { name?: string } = {};
          try { r = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (r.name) {
            const result = await db.update(tasksTable)
              .set({ status: 'active' })
              .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, r.name)))
              .returning({ id: tasksTable.id });

            const toolResultText = result.length > 0
              ? `Task "${r.name}" resumed.`
              : `No task named "${r.name}" found in your station.`;

            console.log(`[agency] loop iter ${iter} — resume_task: "${r.name}" (${result.length} rows)`);
            res.write(`data: ${JSON.stringify({ resuming_task: r.name })}\n\n`);

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'resume_task', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }

        // ── DELETE TASK TOOL CALL ──────────────────────────────────────────
        if (iterToolCall?.name === 'delete_task') {
          let d: { name?: string } = {};
          try { d = JSON.parse(iterToolCall.args); } catch { /* skip */ }

          if (d.name) {
            const result = await db.delete(tasksTable)
              .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, d.name)))
              .returning({ id: tasksTable.id });

            const toolResultText = result.length > 0
              ? `Task "${d.name}" deleted.`
              : `No task named "${d.name}" found in your station.`;

            console.log(`[agency] loop iter ${iter} — delete_task: "${d.name}" (${result.length} rows)`);
            res.write(`data: ${JSON.stringify({ deleting_task: d.name })}\n\n`);

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'delete_task', arguments: iterToolCall.args } }],
              },
              { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
            );
            continue;
          }

          finalContent = iterContent;
          break;
        }


        // ── NO TOOL CALL — clean final response ────────────────────────────
        finalContent = iterContent;
        break;
      }

      // Hit max iterations without a clean final — use everything streamed
      if (!finalContent) finalContent = fullContent;

      // Soul-based fallback — if loop produced no user-facing text, respond in operator's voice
      if (!finalContent || finalContent.trim().length < 5) {
        finalContent = soulFailureResponse(operator, 'execution', 'tool loop', 'No result was produced.');
        fullContent += finalContent;
        res.write(`data: ${JSON.stringify({ delta: finalContent })}\n\n`);
      }

      finalTokens = completionTokens;

      // ── Skill detection (streaming path) — fires after tool loop, before DB commit ──
      if (!httpRequestFired && finalContent && finalContent.trim().length > 10) {
        const installedSkills = buildAgencySkills(skills, archetypeDefaultSkills, installedNames, operator);
        if (installedSkills.length > 0) {
          const trigger = await detectSkillTrigger(message, installedSkills, finalContent).catch(() => null);
          if (trigger) {
            trigger.operatorId = operator.id;
            trigger.operatorOwnerId = operator.ownerId;
            console.log(`[agency] stream — skill triggered: ${trigger.name}`);
            const skillResult = await executeSkill(trigger, chatModel);
            if (skillResult.success) {
              const secondMsgs: ChatMessage[] = [
                ...(loopMessages.length > 0 ? loopMessages : messages),
                { role: 'assistant', content: finalContent },
                { role: 'system', content: `[Skill result — ${trigger.name}]\n${skillResult.output}` },
              ];
              const secondResult = await chatCompletion(secondMsgs, chatOpts).catch(() => null);
              if (secondResult?.content && secondResult.content.trim().length > 0) {
                res.write(`data: ${JSON.stringify({ clear: true })}\n\n`);
                res.write(`data: ${JSON.stringify({ delta: secondResult.content })}\n\n`);
                finalContent = secondResult.content;
              }
              await persistSkillResult(operator.id, operator.ownerId, conv.id, trigger, skillResult).catch(() => {});
            }
          }
        }
      }

      // Architecture firewall — patent-claim protection at the output boundary.
      // Runs on every assistant response, regardless of which LLM is behind
      // the operator. High-confidence patterns (Layer N, GROW engine, OpSoul,
      // STEP 3 — Operator validates the LLM's streamed draft before delivery.
      // The operator inspects the final draft for patent-protected vocabulary
      // and substitutes a refusal in its own voice when triggered. See
      // utils/operatorAgent.ts validate() for the contract.
      const validation = agent.validate(finalContent);
      if (validation.triggers.length > 0) {
        console.warn('[operator:validate]', JSON.stringify({
          path: 'chat:stream',
          operatorId: operator.id,
          scopeId: scope.scopeId,
          conversationId: conv.id,
          substituted: validation.substituted,
          triggers: validation.triggers,
        }));
      }
      if (validation.substituted) {
        finalContent = validation.text;
        res.write(`data: ${JSON.stringify({ replace: true, content: finalContent })}\n\n`);
      }

      // Signal to frontend that response is complete, DB write happening
      res.write(`data: ${JSON.stringify({ processing: true })}\n\n`);

      // Save assistant message and update conversation. Persist the actual
      // model used so post-hoc audits can compare model behaviour over time.
      messageSaved = true;
      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: finalContent,
        tokenCount: finalTokens || null,
        model: validation.substituted ? 'operator-validate' : chatModel,
      });

      await db.update(conversationsTable)
        .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));

      cleanupKeepalive();
      res.write(`data: ${JSON.stringify({
        done: true,
        messageId: asstMsgId,
        model: chatModel,
        usage: { promptTokens, completionTokens: finalTokens },
        activeSkillCount: skills.length,
        memoryCount: memoryHits.length,
      })}\n\n`);
      res.end();

      runPostResponseTasks(operator, conv, finalContent, isBirthMode, scope);

    } catch (err) {
      cleanupKeepalive();
      if (fullContent.trim().length > 0 && !messageSaved) {
        await db.insert(messagesTable).values({
          id: crypto.randomUUID(),
          conversationId: conv.id,
          operatorId: operator.id,
          role: 'assistant',
          content: fullContent + '\n\n[Response incomplete — connection dropped]',
        }).catch(() => {});
      }
      res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      res.end();
    }

  // ─── SYNC PATH ─────────────────────────────────────────────────────────────

  } else {
    try {
      // URL auto-reading — scrape URLs mentioned in the message and inject content before responding
      for (const url of extractUrls(message)) {
        const scraped = await scrapeUrl(url).catch(() => null);
        if (scraped && scraped.length > 200) {
          messages.push({ role: 'system', content: `[URL Content: ${url}]\n${scraped}` });
          await persistUrlScrapedResult(operator.id, operator.ownerId, conv.id, url, scraped, scope.scopeId, scope.scopeTrust);
        }
      }

      const syncTools: ToolDefinition[] = [];
      if (webSearchTool) syncTools.push(webSearchTool);
      if (kbSeedTool) syncTools.push(kbSeedTool);
      syncTools.push(writeFileTool);
      syncTools.push(readFileTool);
      syncTools.push(listFilesTool);
      syncTools.push(getCurrentTimeTool);
      syncTools.push(scheduleTaskTool);
      syncTools.push(updateTaskTool);
      syncTools.push(pauseTaskTool);
      syncTools.push(resumeTaskTool);
      syncTools.push(deleteTaskTool);
      if (httpRequestTool) syncTools.push(httpRequestTool);
      const syncOpts = { ...chatOpts, tools: syncTools.length > 0 ? syncTools : undefined };
      const result = await chatCompletion(messages, syncOpts);

      let finalContent = result.content;
      let finalPromptTokens = result.promptTokens;
      let finalCompletionTokens = result.completionTokens;
      let capabilityFired = false;


      // Web search — operator actually called the tool via function calling
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'web_search') {
        let searchQuery = '';
        try { searchQuery = JSON.parse(result.toolCall.args).query ?? ''; } catch { /* skip */ }
        if (searchQuery) {
          console.log(`[agency] operator-initiated web search (sync): "${searchQuery}"`);
          const capResult = await executeWebSearch(searchQuery);
          if (capResult.success) {
            await persistWebSearchResult(operator.id, operator.ownerId, conv.id, searchQuery, capResult, operator.mandate ?? '', scope.scopeId, scope.scopeTrust);
            capabilityFired = true;
            const toolResultMessages: ChatMessage[] = [
              ...messages,
              { role: 'system', content: `[Web Search] ${searchQuery}\n${capResult.output}` },
            ];
            const secondResult = await chatCompletion(toolResultMessages, chatOpts);
            finalContent = secondResult.content;
            finalPromptTokens = secondResult.promptTokens;
            finalCompletionTokens = secondResult.completionTokens;
          }
        }
      }

      // KB seed — operator called the tool via function calling (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'kb_seed') {
        let seedArgs: { content?: string; source?: string; confidence?: number } = {};
        try { seedArgs = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (seedArgs.content && seedArgs.source) {
          const confidence = typeof seedArgs.confidence === 'number' ? seedArgs.confidence : 65;
          console.log(`[agency] kb_seed (sync): "${seedArgs.source}" (confidence ${confidence})`);
          const seedResult = await persistKbSeedEntry(operator.id, operator.ownerId, seedArgs.content, seedArgs.source, confidence);
          capabilityFired = true;
          const toolResultText = seedResult.stored
            ? `Entry stored. Confidence: ${Math.max(40, Math.min(85, Math.round(confidence)))}. Status: pending.`
            : `Entry not stored: ${seedResult.reason}`;
          const seedMessages: ChatMessage[] = [
            ...messages,
            { role: 'system', content: `[KB Seed Result]\n${toolResultText}` },
          ];
          const secondResult = await chatCompletion(seedMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // Write file — operator called write_file tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'write_file') {
        let fileArgs: { filename?: string; content?: string; action?: string } = {};
        try { fileArgs = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (fileArgs.filename && fileArgs.content) {
          console.log(`[agency] write_file (sync): "${fileArgs.filename}"`);
          const existing = await db.select({ id: operatorFilesTable.id })
            .from(operatorFilesTable)
            .where(and(eq(operatorFilesTable.operatorId, operator.id), eq(operatorFilesTable.filename, fileArgs.filename)))
            .limit(1);

          let fileId: string;
          if (existing.length > 0 && fileArgs.action !== 'create') {
            fileId = existing[0].id;
            await db.update(operatorFilesTable).set({ content: fileArgs.content, updatedAt: new Date() }).where(eq(operatorFilesTable.id, fileId));
          } else {
            fileId = crypto.randomUUID();
            await db.insert(operatorFilesTable).values({ id: fileId, operatorId: operator.id, ownerId: operator.ownerId, filename: fileArgs.filename, content: fileArgs.content });
          }

          capabilityFired = true;
          const toolResultText = `File "${fileArgs.filename}" ${existing.length > 0 && fileArgs.action !== 'create' ? 'updated' : 'created'}. Owner can see it in the Files tab.`;
          const fileMessages: ChatMessage[] = [
            ...messages,
            { role: 'system', content: `[File Created]\n${toolResultText}` },
          ];
          const secondResult = await chatCompletion(fileMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // Read file — operator called read_file tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'read_file') {
        let readArgs: { filename?: string } = {};
        try { readArgs = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (readArgs.filename) {
          console.log(`[agency] read_file (sync): "${readArgs.filename}"`);
          const [file] = await db.select({ content: operatorFilesTable.content })
            .from(operatorFilesTable)
            .where(and(eq(operatorFilesTable.operatorId, operator.id), eq(operatorFilesTable.filename, readArgs.filename)))
            .limit(1);
          capabilityFired = true;
          const toolResultText = file
            ? `File "${readArgs.filename}":\n${file.content}`
            : `File "${readArgs.filename}" not found in your workspace.`;
          const readMessages: ChatMessage[] = [
            ...messages,
            { role: 'system', content: `[File Read]\n${toolResultText}` },
          ];
          const secondResult = await chatCompletion(readMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // List files — operator called list_files tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'list_files') {
        console.log(`[agency] list_files (sync)`);
        const files = await db.select({
          filename: operatorFilesTable.filename,
          updatedAt: operatorFilesTable.updatedAt,
          content: operatorFilesTable.content,
        })
          .from(operatorFilesTable)
          .where(eq(operatorFilesTable.operatorId, operator.id));
        capabilityFired = true;
        const toolResultText = files.length === 0
          ? 'Your workspace has no files yet.'
          : files
              .map((f) => `- ${f.filename} (${f.content.length} chars, updated ${f.updatedAt?.toISOString() ?? 'unknown'})`)
              .join('\n');
        const listMessages: ChatMessage[] = [
          ...messages,
          { role: 'system', content: `[Files in workspace]\n${toolResultText}` },
        ];
        const secondResult = await chatCompletion(listMessages, chatOpts);
        finalContent = secondResult.content;
        finalPromptTokens = secondResult.promptTokens;
        finalCompletionTokens = secondResult.completionTokens;
      }

      // Get current time — operator called get_current_time tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'get_current_time') {
        let timeArgs: { timezone?: string } = {};
        try { timeArgs = JSON.parse(result.toolCall.args); } catch { /* default tz */ }
        const tz = timeArgs.timezone || 'Asia/Dubai';
        console.log(`[agency] get_current_time (sync): ${tz}`);
        capabilityFired = true;
        let toolResultText: string;
        try {
          toolResultText = buildTemporalContext(new Date(), tz);
        } catch {
          toolResultText = `Invalid timezone "${tz}". The timezone parameter accepts IANA identifiers such as "Asia/Dubai", "America/New_York", "Europe/London", "UTC".`;
        }
        const timeMessages: ChatMessage[] = [
          ...messages,
          { role: 'system', content: `[Current time]\n${toolResultText}` },
        ];
        const secondResult = await chatCompletion(timeMessages, chatOpts);
        finalContent = secondResult.content;
        finalPromptTokens = secondResult.promptTokens;
        finalCompletionTokens = secondResult.completionTokens;
      }

      // Schedule task — operator called schedule_task tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'schedule_task') {
        let taskArgs: { name?: string; prompt?: string; schedule?: string } = {};
        try { taskArgs = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (taskArgs.name && taskArgs.prompt && (taskArgs.schedule === 'daily' || taskArgs.schedule === 'weekly')) {
          console.log(`[agency] schedule_task (sync): "${taskArgs.name}" (${taskArgs.schedule})`);
          const intervalMs = taskArgs.schedule === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
          await db.insert(tasksTable).values({
            id: crypto.randomUUID(),
            operatorId: operator.id,
            conversationId: conv.id,
            contextName: taskArgs.name,
            taskType: taskArgs.schedule,
            integrationLabel: 'self_scheduled',
            prompt: taskArgs.prompt,
            payload: { description: taskArgs.prompt, scheduledBy: 'operator' },
            status: 'active',
            nextRunAt: new Date(Date.now() + intervalMs),
          });
          capabilityFired = true;
          const toolResultText = `Task "${taskArgs.name}" scheduled to run ${taskArgs.schedule}. First run at ${new Date(Date.now() + intervalMs).toISOString()}.`;
          const taskMessages: ChatMessage[] = [
            ...messages,
            { role: 'system', content: `[Task Scheduled]\n${toolResultText}` },
          ];
          const secondResult = await chatCompletion(taskMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // Update task — operator called update_task tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'update_task') {
        let upd: { name?: string; newName?: string; newPrompt?: string; newSchedule?: string } = {};
        try { upd = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (upd.name) {
          const [task] = await db.select({ id: tasksTable.id })
            .from(tasksTable)
            .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, upd.name)))
            .limit(1);
          let toolResultText: string;
          if (!task) {
            toolResultText = `No task named "${upd.name}" found in your station.`;
          } else {
            const patch: Record<string, unknown> = {};
            if (upd.newName) patch.contextName = upd.newName;
            if (upd.newPrompt) patch.prompt = upd.newPrompt;
            if (upd.newSchedule === 'daily' || upd.newSchedule === 'weekly') patch.taskType = upd.newSchedule;
            if (Object.keys(patch).length === 0) {
              toolResultText = `No fields to update on "${upd.name}".`;
            } else {
              await db.update(tasksTable).set(patch).where(eq(tasksTable.id, task.id));
              toolResultText = `Task "${upd.name}" updated.`;
            }
          }
          capabilityFired = true;
          const updMessages: ChatMessage[] = [...messages, { role: 'system', content: `[Task Updated]\n${toolResultText}` }];
          const secondResult = await chatCompletion(updMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // Pause task (sync)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'pause_task') {
        let p: { name?: string } = {};
        try { p = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (p.name) {
          const updated = await db.update(tasksTable)
            .set({ status: 'paused' })
            .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, p.name)))
            .returning({ id: tasksTable.id });
          capabilityFired = true;
          const toolResultText = updated.length > 0
            ? `Task "${p.name}" paused.`
            : `No task named "${p.name}" found in your station.`;
          const pauseMessages: ChatMessage[] = [...messages, { role: 'system', content: `[Task Paused]\n${toolResultText}` }];
          const secondResult = await chatCompletion(pauseMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // Resume task (sync)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'resume_task') {
        let r: { name?: string } = {};
        try { r = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (r.name) {
          const updated = await db.update(tasksTable)
            .set({ status: 'active' })
            .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, r.name)))
            .returning({ id: tasksTable.id });
          capabilityFired = true;
          const toolResultText = updated.length > 0
            ? `Task "${r.name}" resumed.`
            : `No task named "${r.name}" found in your station.`;
          const resMessages: ChatMessage[] = [...messages, { role: 'system', content: `[Task Resumed]\n${toolResultText}` }];
          const secondResult = await chatCompletion(resMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // Delete task (sync)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'delete_task') {
        let d: { name?: string } = {};
        try { d = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (d.name) {
          const deleted = await db.delete(tasksTable)
            .where(and(eq(tasksTable.operatorId, operator.id), eq(tasksTable.contextName, d.name)))
            .returning({ id: tasksTable.id });
          capabilityFired = true;
          const toolResultText = deleted.length > 0
            ? `Task "${d.name}" deleted.`
            : `No task named "${d.name}" found in your station.`;
          const delMessages: ChatMessage[] = [...messages, { role: 'system', content: `[Task Deleted]\n${toolResultText}` }];
          const secondResult = await chatCompletion(delMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // HTTP request — operator called http_request tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'http_request') {
        let httpArgs: { method: string; url: string; headers?: Record<string, string>; body?: string } = { method: 'GET', url: '' };
        try { httpArgs = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (httpArgs.url) {
          console.log(`[agency] http_request (sync): ${httpArgs.method} ${httpArgs.url}`);
          capabilityFired = true;
          let httpResult: string;
          try {
            httpResult = await executeHttpWithOAuth(operator.id, httpArgs);
          } catch (err: any) {
            httpResult = `HTTP request failed: ${err.message}`;
          }
          await db.insert(messagesTable).values({
            id: crypto.randomUUID(),
            conversationId: conv.id,
            operatorId: operator.id,
            role: 'system',
            content: `[HTTP Response]\n${httpResult}`,
          });
          const httpMessages: ChatMessage[] = [
            ...messages,
            { role: 'system', content: `[HTTP Response]\n${httpResult}` },
          ];
          const secondResult = await chatCompletion(httpMessages, chatOpts);
          finalContent = secondResult.content;
          finalPromptTokens = secondResult.promptTokens;
          finalCompletionTokens = secondResult.completionTokens;
        }
      }

      // ── Skill detection (sync path) ───────────────────────────────────────────
      if (!capabilityFired && finalContent && finalContent.trim().length > 10) {
        const installedSkills = buildAgencySkills(skills, archetypeDefaultSkills, installedNames, operator);
        if (installedSkills.length > 0) {
          const trigger = await detectSkillTrigger(message, installedSkills, finalContent).catch(() => null);
          if (trigger) {
            trigger.operatorId = operator.id;
            trigger.operatorOwnerId = operator.ownerId;
            console.log(`[agency] sync — skill triggered: ${trigger.name}`);
            const skillResult = await executeSkill(trigger, chatModel);
            if (skillResult.success) {
              const secondMsgs: ChatMessage[] = [
                ...messages,
                { role: 'assistant', content: finalContent },
                { role: 'system', content: `[Skill result — ${trigger.name}]\n${skillResult.output}` },
              ];
              const secondResult = await chatCompletion(secondMsgs, chatOpts).catch(() => null);
              if (secondResult?.content && secondResult.content.trim().length > 0) {
                finalContent = secondResult.content;
                finalPromptTokens = secondResult.promptTokens;
                finalCompletionTokens = secondResult.completionTokens;
              }
              capabilityFired = true;
              await persistSkillResult(operator.id, operator.ownerId, conv.id, trigger, skillResult).catch(() => {});
            }
          }
        }
      }

      // STEP 3 — Operator validates the LLM's draft before delivery (sync path).
      // Same contract as the streaming path above; see utils/operatorAgent.ts.
      const validation = agent.validate(finalContent);
      if (validation.triggers.length > 0) {
        console.warn('[operator:validate]', JSON.stringify({
          path: 'chat:sync',
          operatorId: operator.id,
          scopeId: scope.scopeId,
          conversationId: conv.id,
          substituted: validation.substituted,
          triggers: validation.triggers,
        }));
      }
      finalContent = validation.text;

      // Save assistant message and update conversation. Persist the actual
      // model used so post-hoc audits can compare model behaviour over time.
      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: finalContent,
        tokenCount: finalCompletionTokens || null,
        model: validation.substituted ? 'operator-validate' : chatModel,
      });

      await db.update(conversationsTable)
        .set({ messageCount: sql`message_count + 2`, lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));

      res.json({
        messageId: asstMsgId,
        conversationId: conv.id,
        role: 'assistant',
        content: finalContent,
        model: chatModel,
        usage: {
          promptTokens: finalPromptTokens,
          completionTokens: finalCompletionTokens,
        },
        activeSkillCount: skills.length,
        memoryCount: memoryHits.length,
        layer1WasLocked: operator.layer1LockedAt !== null,
      });

      runPostResponseTasks(operator, conv, finalContent, isBirthMode, scope);

    } catch (err) {
      res.status(502).json({ error: 'AI backend error', detail: (err as Error).message });
    }
  }
});

export default router;
