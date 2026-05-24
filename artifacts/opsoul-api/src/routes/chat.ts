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
  operatorDeploymentSlotsTable,
  operatorSecretsTable,
  operatorIntegrationsTable,
  ownersTable,
} from '@workspace/db';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { embed, semanticDistance } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { lockLayer1IfUnlocked } from '../utils/lockLayer1.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
// Curiosity engine is operator-governed (Patent claim 14): the operator's
// self-awareness layer initiates curiosity, not the chat route. Silent
// `[WEB CONTEXT]` auto-injection removed (Phase 4). The web_search tool
// remains available for the operator to call when its own soul decides.
import { assembleOperatorPrompt, buildBirthSystemPrompt, buildTemporalContext, containsTimeKeywords } from '../utils/systemPrompt.js';
import { OperatorAgent } from '../utils/operatorAgent.js';
import type { SelfAwarenessSnapshot, BuildSystemPromptOpts } from '../utils/systemPrompt.js';
import { searchMemory, buildMemoryContext, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { BIRTH_MODEL_ID, resolveModel, DEFAULT_MODEL_ID } from '../utils/modelRegistry.js';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import type { ChatMessage, ToolDefinition } from '../utils/openrouter.js';
import { buildOwnerScope, buildScopeContext, type ValidatedScope } from '../utils/scopeResolver.js';
import { scrapeUrl } from '../utils/urlScraper.js';
import type { ContentPart } from '../utils/openrouter.js';
import { verifyAndStore } from '../utils/kbIntake.js';
import { eq, and, ne, asc, sql, desc } from 'drizzle-orm';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { isWebSearchAvailable } from '../utils/capabilityEngine.js';
import {
  persistUrlScrapedResult,
  persistSkillResult,
} from '../utils/toolPersistence.js';
import { listToolsForContext } from '../utils/toolRegistry.js';
import { dispatchTool, type ToolHandlerContext } from '../utils/toolHandlers.js';

/**
 * Sync-path tool-result system-message prefixes, preserved verbatim from
 * the pre-MCP-refactor sync blocks. The LLM sees these labels in the second
 * executeSync() pass after a tool fires, so its view of "what just happened"
 * matches the pre-refactor wording. handleHttpRequest already includes the
 * '[HTTP Response]' prefix in its returned content; the sync path guards
 * against double-prefixing via a startsWith check.
 */
const SYNC_TOOL_PREFIX: Record<string, string> = {
  web_search:       '[Web Search]',
  kb_seed:          '[KB Seed Result]',
  write_file:       '[File Created]',
  read_file:        '[File Read]',
  list_files:       '[Files in workspace]',
  get_current_time: '[Current time]',
  schedule_task:    '[Task Scheduled]',
  update_task:      '[Task Updated]',
  pause_task:       '[Task Paused]',
  resume_task:      '[Task Resumed]',
  delete_task:      '[Task Deleted]',
  http_request:     '[HTTP Response]',
};

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
  kbMinConfidence: z.number().int().min(0).max(100).default(75),
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

// History budget caps to keep total prompt under model context windows.
// Sliding window: take last N messages, then trim further if their estimated
// token count exceeds the budget. Estimates 4 chars ≈ 1 token (matches the
// soul-anchor math). 60k tokens leaves headroom for system prompt + KB +
// memory + tool catalog + output even on the smallest catalogued model.
const HISTORY_MAX_MESSAGES = 40;
const HISTORY_MAX_TOKENS = 60_000;

async function buildMessageHistory(convId: string): Promise<ChatMessage[]> {
  const msgs = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, convId))
    .orderBy(asc(messagesTable.createdAt));

  const cleaned = msgs.filter(m => {
    // Sanitize corrupted assistant messages — "Human:" prefix is never valid
    // in an assistant turn; it means the model echoed the user during a bug.
    // Feeding it back would perpetuate the pattern every turn.
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trimStart().startsWith('Human:')) {
      return false;
    }
    return true;
  }) as ChatMessage[];

  // Sliding window from the tail: keep the last HISTORY_MAX_MESSAGES, then
  // walk backwards trimming the oldest until the estimated token count is
  // under HISTORY_MAX_TOKENS. Newest turn always preserved.
  const windowed = cleaned.slice(-HISTORY_MAX_MESSAGES);
  let tokenEstimate = windowed.reduce((sum, m) => sum + Math.ceil((m.content?.length ?? 0) / 4), 0);
  while (tokenEstimate > HISTORY_MAX_TOKENS && windowed.length > 1) {
    const dropped = windowed.shift();
    tokenEstimate -= Math.ceil((dropped?.content?.length ?? 0) / 4);
  }
  return windowed;
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

const BIRTH_ARCHETYPES = ['Executor', 'Advisor', 'Expert', 'Connector', 'Creator', 'Guardian', 'Builder', 'Catalyst', 'Analyst'] as const;

const BIRTH_ROLES = [
  // Strategy & Leadership
  'Strategist', 'Chief of Staff', 'General Manager', 'Team Lead', 'Department Head', 'Portfolio Manager', 'Change Manager',
  // Research & Knowledge
  'Researcher', 'Research Director', 'Domain Expert', 'Knowledge Manager', 'Information Scientist', 'Librarian', 'Curator', 'Archivist', 'Scientific Advisor', 'Technical Advisor', 'Innovation Advisor',
  // Project & Program
  'Project Manager', 'Program Manager', 'Operations Manager', 'Quality Manager', 'Process Engineer', 'Quality Assurance Advisor',
  // Business & Analysis
  'Business Analyst', 'Data Analyst', 'Pricing Analyst', 'Strategic Analyst', 'Market Research Analyst',
  // Finance & Accounting
  'Financial Advisor', 'Investment Advisor', 'Wealth Manager', 'Tax Advisor', 'Audit Advisor', 'Treasury Advisor', 'Controller', 'Accounts Advisor', 'Insurance Advisor',
  // Sales & Marketing
  'Sales Advisor', 'Marketing Strategist', 'Brand Manager', 'Product Manager', 'Growth Strategist', 'Customer Success Manager', 'Channel Manager', 'Partnership Advisor', 'Content Strategist', 'Social Media Strategist', 'SEO Advisor',
  // Operations & Supply
  'Procurement Advisor', 'Supply Chain Advisor', 'Logistics Advisor', 'Inventory Manager', 'Vendor Manager', 'Manufacturing Advisor', 'Maritime Advisor', 'Aviation Advisor', 'Transportation Advisor',
  // Government, Policy & Diplomacy
  'Policy Analyst', 'Compliance Officer', 'Regulatory Advisor', 'Governance Advisor', 'Public Affairs Advisor', 'Public Sector Advisor', 'Diplomat', 'Trade Advisor', 'Customs Advisor', 'Foreign Affairs Advisor', 'Defense Advisor', 'Public Procurement Advisor', 'Tax Policy Advisor',
  // Communications & Media
  'Communications Officer', 'Public Relations Advisor', 'Spokesperson', 'Media Advisor', 'Speechwriter', 'Journalist', 'Editor', 'Copywriter', 'Content Writer', 'Crisis Communications Advisor',
  // Intelligence & Security
  'Intelligence Analyst', 'Risk Officer', 'Risk Analyst', 'Security Advisor', 'Cybersecurity Advisor', 'Investigations Officer', 'Forensic Analyst', 'Threat Intelligence Advisor',
  // Legal
  'Legal Reviewer', 'Contracts Advisor', 'Intellectual Property Advisor', 'Compliance Counsel', 'Privacy Advisor', 'Mediator', 'Arbitrator', 'Paralegal Advisor',
  // People & Culture
  'HR Advisor', 'Talent Advisor', 'Recruitment Advisor', 'Compensation Advisor', 'Benefits Advisor', 'Organizational Development Advisor', 'Diversity Advisor', 'Employee Relations Advisor',
  // Coaching
  'Coach', 'Wellness Coach', 'Leadership Coach', 'Career Coach', 'Performance Coach', 'Founder Coach', 'Pitch Coach', 'Mental Health Coach',
  // Education & Training
  'Educator', 'Tutor', 'Faculty Advisor', 'Academic Advisor', 'Training Advisor', 'Curriculum Designer', 'Instructional Designer', 'Education Policy Advisor',
  // Technology & Engineering
  'Technology Advisor', 'Software Architect', 'Solutions Architect', 'Systems Analyst', 'Data Engineer', 'DevOps Advisor', 'Cloud Advisor', 'Database Advisor', 'Network Advisor', 'AI Advisor', 'IT Advisor', 'Platform Advisor', 'Frontend Advisor', 'Backend Advisor', 'Mobile Advisor',
  // Design & Creative
  'Creative Director', 'Art Director', 'Product Designer', 'UX Designer', 'UI Designer', 'Brand Designer', 'Visual Designer', 'Service Designer', 'Design Researcher', 'Storyteller', 'Game Designer', 'Industrial Designer',
  // Health & Wellbeing
  'Health Advisor', 'Medical Advisor', 'Nutritional Advisor', 'Wellness Strategist', 'Public Health Advisor', 'Healthcare Policy Advisor', 'Pharmaceutical Advisor',
  // Sustainability & Environment
  'Sustainability Advisor', 'Environmental Advisor', 'Climate Advisor', 'ESG Advisor', 'Energy Advisor', 'Renewable Energy Advisor', 'Water Advisor', 'Conservation Advisor',
  // Agriculture & Food
  'Agricultural Advisor', 'Food Security Advisor', 'Aquaculture Advisor',
  // Real Estate & Built Environment
  'Real Estate Advisor', 'Property Manager', 'Construction Advisor', 'Architecture Advisor', 'Urban Planner', 'Facilities Advisor', 'Civil Engineering Advisor',
  // Entrepreneurship & Venture
  'Startup Advisor', 'Venture Advisor', 'Incubator Advisor', 'Fundraising Advisor', 'Exit Strategy Advisor',
  // Culture, Arts & Tourism
  'Cultural Affairs Advisor', 'Heritage Advisor', 'Museum Advisor', 'Performing Arts Advisor', 'Music Advisor', 'Film Advisor', 'Literary Advisor', 'Tourism Advisor',
  // Executive Support
  'Executive Assistant', 'Account Advisor',
] as const;

async function extractBirthIdentity(operatorId: string, conversationId: string): Promise<void> {
  const msgs = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt));

  const transcript = msgs
    .map(m => `${m.role === 'user' ? 'Owner' : 'Operator'}: ${m.content}`)
    .join('\n');

  const archetypeList = JSON.stringify(BIRTH_ARCHETYPES);
  const rolesList = JSON.stringify(BIRTH_ROLES);

  const extractionPrompt = `You are extracting the founding identity of an AI Operator from a birth conversation. The owner named the operator and described its purpose.

Conversation:
${transcript}

Extract exactly:
- name: what the owner said to call the operator (just the name, cleaned up, no extra text)
- rawIdentity: a 200-400 word first-person story, written as the operator speaking, based on what the owner described as the purpose
- archetype: pick as many as genuinely fit the described purpose — no minimum, no maximum. From this exact list only: ${archetypeList}
- roles: pick as many as genuinely fit the described purpose — no minimum, no maximum. Exact strings only from this list: ${rolesList}
- mandate: one sentence starting with a verb, stating the operator's core purpose

Return ONLY valid JSON, no markdown, no explanation:
{"name":"...","rawIdentity":"...","archetype":["..."],"roles":["..."],"mandate":"..."}`;

  // Birth-time extraction uses Sonnet (BIRTH_MODEL_ID). One-time, identity-
  // critical — irreversible once Layer 1 locks. Worth paying for quality on
  // this single call rather than running the cheaper runtime default.
  const result = await chatCompletion(
    [
      { role: 'system', content: 'You extract structured identity data from conversations. Return only valid JSON, no markdown, no explanation.' },
      { role: 'user', content: extractionPrompt },
    ],
    { model: BIRTH_MODEL_ID },
  );

  let extracted: { name: string; rawIdentity: string; archetype: string[]; roles: string[]; mandate: string };
  try {
    const raw = typeof result.content === 'string' ? result.content : '';
    extracted = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  } catch {
    return;
  }

  // Canonical-taxonomy enforcement — the extraction prompt SAYS "from this
  // exact list only" but LLMs occasionally drift across the two adjacent
  // lists (e.g. Sonnet 2026-05-24 put role "Coach" into the archetype array
  // for Istishari). The 9-archetype alphabet is patent-protected per Vision
  // Lock § 5 item 3 — no additions, no silent drift. Strip any value that
  // isn't in the canonical lists before persisting.
  const archetypeSet = new Set<string>(BIRTH_ARCHETYPES);
  const roleSet = new Set<string>(BIRTH_ROLES);
  if (Array.isArray(extracted.archetype)) {
    const dropped = extracted.archetype.filter(a => !archetypeSet.has(a));
    if (dropped.length) {
      console.warn(`[birth-extraction] dropped out-of-taxonomy archetypes for ${operatorId}: ${dropped.join(', ')}`);
    }
    extracted.archetype = extracted.archetype.filter(a => archetypeSet.has(a));
  }
  if (Array.isArray(extracted.roles)) {
    const dropped = extracted.roles.filter(r => !roleSet.has(r));
    if (dropped.length) {
      console.warn(`[birth-extraction] dropped out-of-taxonomy roles for ${operatorId}: ${dropped.join(', ')}`);
    }
    extracted.roles = extracted.roles.filter(r => roleSet.has(r));
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

// persistUrlScrapedResult, persistWebSearchResult, persistSkillResult moved
// to utils/toolPersistence.js (2026-05-19, MCP refactor — see commit on
// branch feat/mcp-runtime-layer). They are imported above and used
// unchanged below in the agent loop.

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

// OAuth auto-injection (executeHttpWithOAuth + the OAUTH_DOMAIN_MAP,
// GOOGLE_TYPES, detectOAuthType, extractTokenFromRow, refreshGoogleAccessToken
// helpers it depends on) moved to utils/toolPersistence.js (2026-05-19,
// MCP refactor — see commit on branch feat/mcp-runtime-layer). The
// http_request tool dispatch below imports executeHttpWithOAuth from there.

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
  // went with it. liveSecrets + liveIntegrations are kept — used by the
  // toolListCtx below to gate http_request and the wave-3 connected-app tools
  // (gmail, calendar, drive, github, notion, slack, linear, hubspot).
  const [skills, archetypeDefaultSkills, selfAwarenessRow, history, liveSecrets, liveIntegrations] = await Promise.all([
    loadActiveSkills(operator.id),
    loadArchetypeSkills((operator.archetype as string[]) ?? []),
    db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operator.id)).limit(1),
    buildMessageHistory(conv.id),
    db.select({ key: operatorSecretsTable.key })
      .from(operatorSecretsTable)
      .where(eq(operatorSecretsTable.operatorId, operator.id)),
    db.select({ integrationType: operatorIntegrationsTable.integrationType })
      .from(operatorIntegrationsTable)
      .where(eq(operatorIntegrationsTable.operatorId, operator.id)),
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

  // Q8 — Soul anchoring: if history token estimate exceeds 40% of the model's
  // context window, reinject Layer 0 + Layer 1 at top of system prompt to
  // reinforce identity. Context window comes from the operator's selected
  // model so anchoring scales with what the LLM can actually carry.
  const CONTEXT_WINDOW = resolveModel(operator.defaultModel || DEFAULT_MODEL_ID).config.contextWindow;
  const ANCHOR_THRESHOLD = Math.floor(CONTEXT_WINDOW * 0.4);
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

  // Single-model strategy: Kimi K2.5 handles chat + vision + tool calling natively.
  // 'opsoul/auto' sentinel now resolves directly to CHAT_MODEL (no per-turn switching).
  chatModel = rawModel === 'opsoul/auto' ? CHAT_MODEL : rawModel;

  // BIRTH MODE — operator has no identity yet; use birth system prompt instead of Layer 1
  const isBirthMode = !operator.rawIdentity;

  // ── OPERATOR-AS-DRIVER ───────────────────────────────────────────────
  // The operator analyses the user message and decides whether tools should
  // be offered to the LLM this turn: 'chat' (no tools) or 'execute' (tools
  // available). The LLM does not autonomously call tools — it acts only
  // when the operator gives it the catalog. See utils/operatorAgent.ts.
  const agent = new OperatorAgent({
    operatorId: operator.id,
    operatorName: operator.name,
    isBirthMode,
    scopeType: scope.scopeType,
  });

  const decision = agent.analyse(message);

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
  // hits get woven into the system prompt as the operator's absorbed
  // knowledge. Counts of KB/memory are operator metadata (not for the
  // operator's mouth) — omitted. The tools array passed to streamChat already
  // gives the LLM functional info about available tools.
  const promptSections: string[] = [systemPrompt];

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

  // Tool definitions live in utils/toolRegistry.ts — single source of truth
  // for OpSoul's universal toolset. Both this internal chat path and the
  // external /mcp HTTP endpoint resolve tools through the same registry.
  // listToolsForContext(ctx) returns the wire-format ToolDefinition[] the
  // LLM call expects, filtered by scope + availability + (for http_request)
  // injected with the operator's live secret labels.
  const toolHandlerCtx: ToolHandlerContext = {
    operatorId: operator.id,
    ownerId: operator.ownerId,
    conversationId: conv.id,
    scope: {
      scopeId: scope.scopeId,
      scopeTrust: scope.scopeTrust,
      // owner-scope only path currently — chat.ts requires auth. Public/
      // channel scopes flow through public-chat.ts / channel webhooks.
      scopeType: 'owner',
    },
    mandate: operator.mandate ?? '',
  };
  const toolListCtx = {
    scopeType: 'owner' as const,
    hasWebSearch: isWebSearchAvailable(),
    liveSecrets: liveSecrets.map(s => s.key),
    connectedIntegrations: liveIntegrations.map(i => i.integrationType),
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

        // Operator-as-driver (Patent claim 21): the operator decided in
        // analyse() whether tools are needed this turn. For `chat` intent
        // the catalog is empty — the LLM cannot call tools because none
        // are offered. For `execute` intent the full universal catalog is
        // presented from the toolRegistry. Birth mode passes 'execute' so
        // newborn operators retain full capability during identity formation.
        const allTools = decision.kind === 'execute' ? listToolsForContext(toolListCtx) : [];
        // Per-iteration cap on web_search — once an operator has done
        // MAX_SEARCHES in this turn, filter it out of the offered set so
        // the LLM cannot keep searching in a loop.
        const iterTools = webSearchCount >= MAX_SEARCHES
          ? allTools.filter(t => t.function.name !== 'web_search')
          : allTools;
        const iterOpts = {
          ...chatOpts,
          tools: iterTools.length > 0 ? iterTools : undefined,
        };

        // STEP 2 — Operator dispatches the LLM as streaming executor for
        // each tool-loop iteration. The operator owns the call (model,
        // tool catalog, system prompt all set by the operator). The LLM
        // produces text + optional tool call. The operator decides what
        // to do with each chunk via the loop body below.
        for await (const chunk of agent.executeStreaming(loopMessages, iterOpts)) {
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
        // ── TOOL DISPATCH (via toolHandlers.dispatchTool — single path for all 12 tools) ──
        //
        // Each handler in toolHandlers.ts mirrors the pre-refactor inline
        // block behavior verbatim: it parses args, fires the SSE progress
        // event the frontend ChatSection.tsx regex-matches, persists side
        // effects, and returns { content, meta? }. The meta hints
        // (webSearchFired, httpRequestFired, terminateLoop) carry the
        // loop-control signals the inline blocks used to encode via
        // if/break/continue.
        if (iterToolCall) {
          const dispatchResult = await dispatchTool(
            iterToolCall.name,
            iterToolCall.args,
            toolHandlerCtx,
            (e) => {
              try { res.write(`data: ${JSON.stringify(e.payload)}\n\n`); } catch { /* connection gone */ }
            },
          );

          if (dispatchResult.meta?.webSearchFired) webSearchCount++;
          if (dispatchResult.meta?.httpRequestFired) {
            httpRequestFired = true;
            // Strip pre-call narration text from fullContent — text streamed
            // before a tool fires is noise, not a response. Mirrors the
            // pre-refactor http_request behavior (covers consecutive tool
            // calls too).
            fullContent = fullContent.slice(0, iterFullStart);
          }

          if (dispatchResult.meta?.terminateLoop) {
            // Handler reported it couldn't make useful progress (missing
            // required args, or underlying operation failed). Fall back to
            // whatever the model streamed before the call — matches the
            // pre-refactor break-on-failure behavior of each inline block.
            finalContent = iterContent;
            break;
          }

          // Push the assistant turn + tool result back into the loop so the
          // model sees the result and decides what to do next.
          loopMessages.push(
            {
              role: 'assistant',
              content: iterContent || '',
              tool_calls: [{
                id: iterToolCall.id,
                type: 'function',
                function: { name: iterToolCall.name, arguments: iterToolCall.args },
              }],
            },
            { role: 'tool', content: dispatchResult.content, tool_call_id: iterToolCall.id },
          );
          continue;
        }

        // ── NO TOOL CALL — clean final response ────────────────────────────
        finalContent = iterContent;
        break;
      }

      // If the loop ended without setting finalContent (e.g. MAX_ITER hit on a
      // tool-only iteration), fall back to whatever was streamed. No platform
      // substitution — if the operator produced nothing, finalContent stays
      // empty and the caller sees an empty assistant message.
      if (!finalContent) finalContent = fullContent;

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
              const secondResult = await agent.executeSync(secondMsgs, chatOpts).catch(() => null);
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
        model: chatModel,
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

      // Operator-as-driver (Patent claim 21): same gating as the streaming
      // path. Tools are offered only when the operator's analyse() decision
      // is 'execute'. Tool definitions come from the universal toolRegistry,
      // filtered for this scope + availability.
      const syncTools = decision.kind === 'execute' ? listToolsForContext(toolListCtx) : [];
      const syncOpts = { ...chatOpts, tools: syncTools.length > 0 ? syncTools : undefined };
      const result = await agent.executeSync(messages, syncOpts);

      let finalContent = result.content;
      let finalPromptTokens = result.promptTokens;
      let finalCompletionTokens = result.completionTokens;
      let capabilityFired = false;

      // ── TOOL DISPATCH (sync) — single path via toolHandlers.dispatchTool ──
      //
      // Pattern: if the LLM produced a tool call, execute it via the same
      // dispatcher chat.ts streaming and the external /mcp endpoint use,
      // then run a SECOND executeSync() with the tool result injected as a
      // system message so the model can produce a final reply. The
      // per-tool system-message prefix is preserved verbatim from the
      // pre-refactor sync blocks so the LLM's view of "what just happened"
      // is unchanged (and downstream frontend regex matchers continue to
      // recognise them).
      if (result.toolCall) {
        const dispatchResult = await dispatchTool(
          result.toolCall.name,
          result.toolCall.args,
          toolHandlerCtx,
          // No SSE in sync path — drop progress events
        );
        // Old break-on-failure: if missing args or operation failed, do NOT
        // run the second LLM pass. The first-pass result.content (often a
        // chatty preamble) becomes the final answer, matching pre-refactor
        // behavior where each `if (...args missing) finalContent break;` block
        // just dropped through.
        if (!dispatchResult.meta?.terminateLoop) {
          capabilityFired = true;
          const syncPrefix = SYNC_TOOL_PREFIX[result.toolCall.name] ?? `[Tool: ${result.toolCall.name}]`;
          // handleHttpRequest already prefixes its content with [HTTP Response];
          // avoid double-prefixing by detecting the existing prefix.
          const wrappedContent = dispatchResult.content.startsWith(syncPrefix)
            ? dispatchResult.content
            : `${syncPrefix}\n${dispatchResult.content}`;
          const followupMessages: ChatMessage[] = [
            ...messages,
            { role: 'system', content: wrappedContent },
          ];
          const secondResult = await agent.executeSync(followupMessages, chatOpts);
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
              const secondResult = await agent.executeSync(secondMsgs, chatOpts).catch(() => null);
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
        model: chatModel,
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
