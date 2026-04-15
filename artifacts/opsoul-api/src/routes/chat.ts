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
} from '@workspace/db';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { executeHttpRequest } from '../utils/httpExecutor.js';
import { embed, semanticDistance } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { lockLayer1IfUnlocked } from '../utils/lockLayer1.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { computeCoverageScore, resolveKbGap } from '../utils/curiosityEngine.js';
import { buildSystemPrompt, buildBirthSystemPrompt } from '../utils/systemPrompt.js';
import type { SelfAwarenessSnapshot, BuildSystemPromptOpts } from '../utils/systemPrompt.js';
import { searchMemory, buildMemoryContext, distillMemoriesFromConversations, storeMemory } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import type { ChatMessage, ToolDefinition } from '../utils/openrouter.js';
import type { Layer2Soul } from '../validation/operator.js';
import { resolveScope } from '../utils/scopeResolver.js';
import { scrapeUrl } from '../utils/urlScraper.js';
import type { ContentPart } from '../utils/openrouter.js';
import { verifyAndStore, persistKbSeedEntry } from '../utils/kbIntake.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { isWebSearchAvailable, executeWebSearch } from '../utils/capabilityEngine.js';

interface ActiveSkill {
  name: string;
  instructions: string;
  customInstructions?: string | null;
  outputFormat?: string | null;
}

export interface LiveStationData {
  integrations: { type: string; label: string; status: string; scopes?: string[] | null }[];
  tasks: { name: string; status: string; lastRunAt?: string | null; lastRunSummary?: string | null; payload?: Record<string, unknown> | null }[];
  fileCount: number;
  fileNames?: string[];
  deploymentSlots?: { name: string; surfaceType: string; apiKeyPreview: string; isActive: boolean; allowedOrigins?: string[] | null }[];
  secretLabels?: string[];
}

const SKILL_HOW_TO: Record<string, string> = {
  web_search: `Trigger when the user asks for current info, recent events, or real-time data.
Run a live web search. Provide a precise search query.
Result: titles, snippets, and URLs. Cite sources when using web results.`,

  http_request: `Call external APIs directly. Provide: method (GET/POST/PUT/DELETE), url, optional headers and body.
Reference stored secrets with {{SECRET_NAME}} syntax — substituted server-side before the request.
Result: raw API response. Parse JSON if needed. Report HTTP errors clearly.`,

  write_file: `Persist content to the operator file workspace.
Provide: filename (with extension) and content (text, JSON, CSV, etc.).
Result: file saved and available in the file list. Use for reports, exports, structured output.`,

  kb_seed: `Add verified knowledge to your own knowledge base.
Provide: content (the fact or knowledge) and source (where it came from).
Entry is stored at appropriate confidence and available in future KB searches.`,
};

const INTEGRATION_HOW_TO: Record<string, string> = {
  gmail: `Base URL: https://gmail.googleapis.com/gmail/v1/users/me
Auth: Authorization: Bearer {token} (injected automatically)
GET /messages (q, maxResults, pageToken) | GET /messages/{id} | POST /messages/send (raw: base64url)
Pagination: use nextPageToken. Decode message bodies from base64url before reading.`,

  github: `Base URL: https://api.github.com
Auth: Authorization: Bearer {token} (injected automatically)
GET /user | GET /repos/{owner}/{repo}/issues (state, per_page, page) | POST /repos/{owner}/{repo}/issues | GET /repos/{owner}/{repo}/pulls
Pagination: page param (per_page max 100) or Link header.`,

  notion: `Base URL: https://api.notion.com/v1
Auth: Authorization: Bearer {token}, Notion-Version: 2022-06-28 (both injected automatically)
POST /search ({query}) | GET /pages/{id} | PATCH /pages/{id} | POST /pages | POST /databases/{id}/query
Pagination: use start_cursor from response.`,

  slack: `Base URL: https://slack.com/api
Auth: Authorization: Bearer {token} (injected automatically)
POST /chat.postMessage (channel, text) | GET /conversations.list (limit, cursor) | GET /conversations.history (channel, limit, cursor)
Pagination: use response_metadata.next_cursor.`,

  google_calendar: `Base URL: https://www.googleapis.com/calendar/v3/calendars/primary
Auth: Authorization: Bearer {token} (injected automatically)
GET /events (timeMin, timeMax, maxResults, pageToken) | POST /events (summary, start, end) | PATCH /events/{id} | DELETE /events/{id}
Pagination: use nextPageToken.`,

  linear: `Base URL: https://api.linear.app/graphql (GraphQL — all calls are POST)
Auth: Authorization: Bearer {token} (injected automatically)
Query: {issues(filter:{state:{name:{eq:"Todo"}}}){nodes{id title}}} | Mutations: issueCreate, issueUpdate
Pagination: use pageInfo.endCursor in after param.`,

  airtable: `Base URL: https://api.airtable.com/v0/{baseId}/{tableId}
Auth: Authorization: Bearer {token} (injected automatically)
GET / (filterByFormula, maxRecords, pageSize, offset) | POST / ({fields:{...}}) | PATCH /{recordId} | DELETE /{recordId}
Pagination: use offset from response.`,
};

function buildStationContext(data: LiveStationData): string {
  const lines: string[] = ['[STATION]'];

  const activeIntegrations = data.integrations.filter(
    (i) => i.status === 'connected' || i.status === 'active',
  );
  if (activeIntegrations.length > 0) {
    lines.push(`Active integrations (${activeIntegrations.length}):`);
    for (const int of activeIntegrations) {
      lines.push(`- ${int.label} [${int.type}]`);
      const howTo = INTEGRATION_HOW_TO[int.type];
      if (howTo) lines.push(howTo);
    }
  }

  const activeTasks = data.tasks.filter((t) => t.status === 'active');
  if (activeTasks.length > 0) {
    lines.push(`Active tasks (${activeTasks.length}):`);
    for (const task of activeTasks) {
      const summary = task.lastRunSummary ? ` — last run: ${task.lastRunSummary}` : '';
      lines.push(`- ${task.name}${summary}`);
    }
  }

  if (data.fileCount > 0) {
    const names = (data.fileNames ?? []).slice(0, 5).join(', ');
    lines.push(`Files: ${data.fileCount} available${names ? ` (${names}${data.fileCount > 5 ? '...' : ''})` : ''}`);
  }

  if (data.secretLabels && data.secretLabels.length > 0) {
    lines.push(`Stored secrets (use as {{SECRET_NAME}} in http_request): ${data.secretLabels.join(', ')}`);
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

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
): Promise<{ operator: typeof operatorsTable.$inferSelect; conv: typeof conversationsTable.$inferSelect } | null> {
  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!operator) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }

  const expectedScope = resolveScope({ operatorId: operator.id, source: 'owner', callerId: req.owner!.ownerId });

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, req.params.convId),
        eq(conversationsTable.operatorId, operator.id),
        eq(conversationsTable.scopeId, expectedScope.scopeId),
      ),
    );
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return null;
  }

  return { operator, conv };
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
- archetype: 1 or 2 values only from this exact list: ["Executor", "Advisor", "Expert", "Connector", "Creator", "Guardian", "Builder", "Catalyst", "Analyst"] — choose what best fits the described purpose
- mandate: one sentence starting with a verb, stating the operator's core purpose

Return ONLY valid JSON, no markdown, no explanation:
{"name":"...","rawIdentity":"...","archetype":["..."],"mandate":"..."}`;

  const result = await chatCompletion(
    [
      { role: 'system', content: 'You extract structured identity data from conversations. Return only valid JSON, no markdown, no explanation.' },
      { role: 'user', content: extractionPrompt },
    ],
    { model: CHAT_MODEL },
  );

  let extracted: { name: string; rawIdentity: string; archetype: string[]; mandate: string };
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
      mandate: extracted.mandate,
    })
    .where(eq(operatorsTable.id, operatorId));
}

// ─── Search narration fallback ───────────────────────────────────────────────
// When the operator says "Searching now: X" in text instead of calling the tool,
// we extract the query and fire the real search. The operator is still deciding
// what to search — we're just enforcing the action it announced.
function extractNarratedSearchQuery(content: string, userMessageFallback: string): string | null {
  // "Searching now: X" or "Searching for: X" or "Searching: X"
  const explicit = content.match(/Searching(?:\s+now)?(?:\s+for)?:\s*(.+?)(?:\n|$)/i);
  if (explicit) return explicit[1].trim().slice(0, 200);
  // "Moving to topic X — Y patterns." — extract the topic description after the dash
  const movingTo = content.match(/Moving to topic [a-z\s]+[—\-–]+\s*(.+?)(?:\.|$)/im);
  if (movingTo) return movingTo[1].trim().slice(0, 200);
  // "Now searching X" or "Now looking at X"
  const nowSearching = content.match(/Now (?:searching|looking at|researching)\s+(.+?)(?:\.|$)/im);
  if (nowSearching) return nowSearching[1].trim().slice(0, 200);
  // "Searching now." or "Searching now\n" with no query — use the user's message
  if (/\bSearching\s+now\.?\s*$/im.test(content)) return userMessageFallback.slice(0, 200);
  return null;
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

async function persistUrlScrapedResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  url: string,
  content: string,
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
  storeMemory(
    operatorId,
    ownerId,
    `Operator read URL "${domain}". Summary: ${content.slice(0, 400)}`,
    'fact',
    'ai_distilled',
    0.6,
  ).catch(() => {});
}

async function persistWebSearchResult(
  operatorId: string,
  ownerId: string,
  convId: string,
  searchQuery: string,
  capResult: { output: string },
  mandate: string,
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

  storeMemory(
    operatorId,
    ownerId,
    `Web search performed: "${searchQuery}". Key findings: ${capResult.output.slice(0, 600)}`,
    'fact',
    'ai_distilled',
    0.65,
  ).catch(() => {});
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

  storeMemory(
    operatorId,
    ownerId,
    `Skill executed: ${skillTrigger.name}. Result: ${skillResult.output.slice(0, 500)}`,
    'pattern',
    'ai_distilled',
    0.6,
  ).catch(() => {});
}

// Runs all post-response fire-and-forget tasks — identical for both stream and sync.
function runPostResponseTasks(
  operator: typeof operatorsTable.$inferSelect,
  conv: typeof conversationsTable.$inferSelect,
  finalContent: string,
  isBirthMode: boolean,
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
      distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch((err) => console.warn('[runPostResponse] distill failed:', err?.message));
    }
  }
}

// Second-pass prompt used after a skill executes — same wording for both paths.
function buildSkillSecondPassMessages(
  messages: ChatMessage[],
  firstResponse: string,
  skillOutput: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: firstResponse },
    { role: 'system', content: `[Task completed — findings below]\n${skillOutput}` },
    { role: 'user', content: `You just ran a skill and received the output above. Report back to the owner directly and conversationally.\n\nIf the output says no live data was available or the connection failed — be honest. Tell the owner clearly what didn't work and what they need to set up. Do not pretend you completed work you couldn't do.\n\nIf the output has real findings — report them specifically. Highlight what matters. Be direct.\n\nNever mention tool names, skill names, raw JSON, raw URLs, or API field names. Just speak naturally as their operator.` },
  ];
}

// ─── Main route handler ──────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const ctx = await resolveOperatorAndConv(req, res);
  if (!ctx) return;

  const { operator, conv } = ctx;

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

  const [skills, archetypeDefaultSkills, selfAwarenessRow, history, liveIntegrations, liveTasks, liveFiles, liveSlots, liveSecrets] = await Promise.all([
    loadActiveSkills(operator.id),
    loadArchetypeSkills((operator.archetype as string[]) ?? []),
    db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operator.id)).limit(1),
    buildMessageHistory(conv.id),
    db.select({
      type: operatorIntegrationsTable.integrationType,
      label: operatorIntegrationsTable.integrationLabel,
      status: operatorIntegrationsTable.status,
      scopes: operatorIntegrationsTable.scopes,
    }).from(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.operatorId, operator.id)),
    db.select({
      name: tasksTable.contextName,
      status: tasksTable.status,
      payload: tasksTable.payload,
    }).from(tasksTable).where(eq(tasksTable.operatorId, operator.id)),
    db.select({ filename: operatorFilesTable.filename })
      .from(operatorFilesTable)
      .where(eq(operatorFilesTable.operatorId, operator.id)),
    db.select({
      name: operatorDeploymentSlotsTable.name,
      surfaceType: operatorDeploymentSlotsTable.surfaceType,
      apiKeyPreview: operatorDeploymentSlotsTable.apiKeyPreview,
      isActive: operatorDeploymentSlotsTable.isActive,
      allowedOrigins: operatorDeploymentSlotsTable.allowedOrigins,
    }).from(operatorDeploymentSlotsTable).where(eq(operatorDeploymentSlotsTable.operatorId, operator.id)),
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

  const scopeLine = `[SCOPE: ${conv.scopeType} | ${conv.scopeId}]`;
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
        searchMemory(operator.id, queryEmbedding),
      ]);
      kbContext = buildRagContext(kbHits);
      memoryHits = memHits;

      // Silent gap resolution — if KB coverage < 35%, fire a web search invisibly
      const coverageScore = computeCoverageScore(kbHits);
      if (coverageScore < 0.35) {
        const gapResult = await resolveKbGap(message, operator.id);
        if (gapResult) {
          const webContextBlock = `[WEB CONTEXT]\n${gapResult}`;
          kbContext = kbContext ? `${kbContext}\n\n${webContextBlock}` : webContextBlock;
        }
      }
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
    const resolved = hasAttachment
      ? 'google/gemini-flash-2.0'
      : isShort && !hasContext && !webSearchActive
        ? 'anthropic/claude-haiku-4-5'
        : 'anthropic/claude-sonnet-4-5';
    console.log(`[AUTO] routed → ${resolved} | short=${isShort} attachment=${hasAttachment} hasContext=${hasContext} webSearch=${webSearchActive}`);
    return resolved;
  })();

  // BIRTH MODE — operator has no identity yet; use birth system prompt instead of Layer 1
  const isBirthMode = !operator.rawIdentity;

  // Build live station data — fetched fresh every turn so the operator always knows their real state
  const liveStation = {
    integrations: liveIntegrations.map(i => ({
      type: i.type ?? '',
      label: i.label ?? '',
      status: i.status ?? 'unknown',
      scopes: i.scopes ?? null,
    })),
    tasks: liveTasks.map(t => {
      const p = (t.payload ?? {}) as Record<string, unknown>;
      return {
        name: t.name ?? 'Unnamed task',
        status: t.status ?? 'active',
        payload: p,
        lastRunAt: (p.lastRunAt as string | null) ?? null,
        lastRunSummary: (p.lastRunSummary as string | null) ?? null,
      };
    }),
    fileCount: liveFiles.length,
    fileNames: liveFiles.map(f => f.filename),
    deploymentSlots: liveSlots.map(s => ({
      name: s.name,
      surfaceType: s.surfaceType,
      apiKeyPreview: s.apiKeyPreview,
      isActive: s.isActive ?? false,
      allowedOrigins: s.allowedOrigins ?? null,
    })),
    secretLabels: liveSecrets.map(s => s.key),
  };

  const systemPrompt = isBirthMode
    ? buildBirthSystemPrompt()
    : buildSystemPrompt(
        {
          name: operator.name,
          archetype: operator.archetype,
          rawIdentity: operator.rawIdentity ?? undefined,
          mandate: operator.mandate,
          coreValues: operator.coreValues,
          ethicalBoundaries: operator.ethicalBoundaries,
          layer2Soul: operator.layer2Soul as Layer2Soul,
        },
        selfAwareness,
        promptOpts,
      );

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

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  if (kbContext && kbContext.trim()) {
    messages.push({
      role: 'user',
      content: `[CONTEXT]\nKnowledge retrieved for this conversation:\n${kbContext}`,
    });
  }

  if (memoryHits && memoryHits.length > 0) {
    const memLines = memoryHits.map((m: MemoryHit) => `[${m.memoryType}] ${m.content}`).join('\n');
    messages.push({
      role: 'user',
      content: `[CONTEXT]\nMemory recalled from past conversations:\n${memLines}`,
    });
  }

  // [STATION] — live integration state, active tasks, files, stored secrets
  if (liveStation) {
    const stationContext = buildStationContext(liveStation);
    if (stationContext) {
      messages.push({ role: 'user', content: stationContext });
    }
  }

  // [CAPABILITY] — KB state, memory count, per-skill how-to instructions
  const cap = selfAwareness?.capabilityState;
  const wm = selfAwareness?.workspaceManifest;
  if (cap) {
    const capLines: string[] = ['[CAPABILITY]'];

    const kbTotal = (cap.ownerKbChunks ?? 0) + (cap.operatorKbChunks ?? 0);
    if (kbTotal > 0 && wm?.kbByTier) {
      const { high = 0, medium = 0, low = 0 } = wm.kbByTier;
      capLines.push(`KB: ${kbTotal} entries (${high} high confidence, ${medium} medium, ${low} low)`);
    } else if (kbTotal > 0) {
      capLines.push(`KB: ${kbTotal} entries`);
    }

    if (wm?.totalMemoryActive && wm.totalMemoryActive > 0) {
      capLines.push(`Memory: ${wm.totalMemoryActive} active memories from past conversations`);
    }

    const activeSkills = (cap.skills ?? []).filter((s) => s.isActive);
    if (activeSkills.length > 0) {
      capLines.push(`Active skills:`);
      for (const skill of activeSkills) {
        const howTo = SKILL_HOW_TO[skill.integrationType ?? ''];
        capLines.push(`- ${skill.name}`);
        if (howTo) {
          capLines.push(howTo);
        } else if (skill.description) {
          capLines.push(`  ${skill.description}`);
        }
      }
      capLines.push('If a skill fails — report the failure clearly. Do not guess or fabricate results.');
    }

    if (capLines.length > 1) {
      messages.push({ role: 'user', content: capLines.join('\n') });
    }
  }

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
          description: 'Search the web for current, live information. Use only when you genuinely need it. Call this tool directly and silently — never announce "I will search" or "searching now" in your text response. Just call the tool. Your next response will reflect what you found.',
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
          description: 'Persist a validated knowledge entry into your knowledge base corpus. Call this AFTER you have researched and synthesized a clear, durable insight worth retaining permanently. Do not use for ephemeral data, opinions, or uncertain facts. Write a self-contained, factual entry of 100–400 words.',
          parameters: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The knowledge entry to store — a self-contained factual insight (100–400 words). No filler. No "I believe". Pure information.',
              },
              source: {
                type: 'string',
                description: 'Name of the source(s) this was derived from (e.g. "Google AI Blog 2024, MIT study on transformer efficiency").',
              },
              confidence: {
                type: 'number',
                description: 'Your confidence score 40–85 based on source quality and corroboration. Use 80+ only if multiple independent sources agree. Never claim 100.',
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
      description: 'Create or update a file in your workspace. Use when creating a document, report, notes, or to-do list would genuinely help the owner. Owner sees and downloads files from the Files tab.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename including extension (e.g. "report.md", "todo.txt")' },
          content: { type: 'string', description: 'Full file content. Well-formatted and ready to use.' },
          action: { type: 'string', enum: ['create', 'update'], description: 'Whether to create a new file or update an existing one.' },
        },
        required: ['filename', 'content', 'action'],
      },
    },
  };

  // Agency skills — built once, shared by both paths
  const agencySkills = buildAgencySkills(skills, archetypeDefaultSkills, installedNames, operator);

  // http_request tool — only offered when the operator has stored secrets
  const httpRequestTool: ToolDefinition | null = liveSecrets.length > 0 ? {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP request to an external API using your stored secrets. Use {{SECRET_NAME}} as a placeholder in headers or body to inject a stored secret by its label. CRITICAL RULE: when you decide to use this tool, the tool call must be your ENTIRE response — zero text before it, zero narration, zero announcement, zero "let me", zero "testing now", zero "calling". No words at all. The call IS your full response. Violating this means the call never happens.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
          url: { type: 'string', description: 'Full URL including query parameters' },
          headers: {
            type: 'object',
            description: 'HTTP headers as key-value pairs. Use {{SECRET_NAME}} to inject a stored secret by its label.',
            additionalProperties: { type: 'string' },
          },
          body: {
            type: 'string',
            description: 'Request body as a JSON string (for POST/PUT/PATCH). Use {{SECRET_NAME}} to inject stored secret values.',
          },
        },
        required: ['method', 'url'],
      },
    },
  } : null;

  // ─── STREAMING PATH ────────────────────────────────────────────────────────

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
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
          await persistUrlScrapedResult(operator.id, operator.ownerId, conv.id, url, scraped);
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
              await persistWebSearchResult(operator.id, operator.ownerId, conv.id, searchQuery, capResult, operator.mandate ?? '');
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
              toolResultText = await executeHttpRequest(operator.id, httpArgs);
            } catch (err: any) {
              toolResultText = `HTTP request failed: ${err.message}`;
            }
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

        // ── NARRATION FALLBACK (any iteration) ────────────────────────────
        // Operator described a search in text but didn't call the tool — honour it.
        // Runs on every iteration so multi-step narrated sweeps don't drop early.
        if (!iterToolCall && webSearchTool && webSearchCount < MAX_SEARCHES) {
          const narratedQuery = extractNarratedSearchQuery(iterContent, message);
          if (narratedQuery) {
            console.log(`[agency] narration fallback iter ${iter} — firing real search: "${narratedQuery}"`);
            res.write(`data: ${JSON.stringify({ searching: narratedQuery })}\n\n`);
            const capResult = await executeWebSearch(narratedQuery);
            if (capResult.success) {
              await persistWebSearchResult(operator.id, operator.ownerId, conv.id, narratedQuery, capResult, operator.mandate ?? '');
              webSearchCount++;
              loopMessages.push(
                { role: 'assistant', content: iterContent },
                { role: 'system', content: `[Web Search: ${narratedQuery}]\n${capResult.output}` },
              );
              continue;
            }
          }
        }

        // ── NO TOOL CALL — clean final response ────────────────────────────
        finalContent = iterContent;
        break;
      }

      // Hit max iterations without a clean final — use everything streamed
      if (!finalContent) finalContent = fullContent;
      finalTokens = completionTokens;

      // ── SKILL TRIGGER (post-loop, only if no web search or http_request ran) ─
      let capabilityFired = webSearchCount > 0 || httpRequestFired;
      if (!capabilityFired) {
        const skillTrigger = await detectSkillTrigger(message, agencySkills, finalContent);
        if (skillTrigger) {
          skillTrigger.operatorId = operator.id;
          skillTrigger.operatorOwnerId = operator.ownerId;
          console.log(`[agency] skill triggered: ${skillTrigger.name}`);
          res.write(`data: ${JSON.stringify({ running: skillTrigger.name })}\n\n`);
          res.write(`data: ${JSON.stringify({ clear: true })}\n\n`);
          const skillResult = await executeSkill(skillTrigger, chatModel);
          if (skillResult.success) {
            await persistSkillResult(operator.id, operator.ownerId, conv.id, skillTrigger, skillResult);
            const skillMessages = buildSkillSecondPassMessages(messages, finalContent, skillResult.output);
            let skillContent = '';
            let skillTokens = 0;
            for await (const chunk of streamChat(skillMessages, chatOpts)) {
              if (chunk.delta) {
                skillContent += chunk.delta;
                res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
              }
              if (chunk.done && chunk.usage) {
                promptTokens += chunk.usage.promptTokens;
                skillTokens = chunk.usage.completionTokens;
              }
            }
            if (skillContent) {
              finalContent = skillContent;
              finalTokens = skillTokens;
            }
          }
        }
      }

      // Signal to frontend that response is complete, DB write happening
      res.write(`data: ${JSON.stringify({ processing: true })}\n\n`);

      // Save assistant message and update conversation
      messageSaved = true;
      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: finalContent,
        tokenCount: finalTokens || null,
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

      runPostResponseTasks(operator, conv, finalContent, isBirthMode);

    } catch (err) {
      cleanupKeepalive();
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
          await persistUrlScrapedResult(operator.id, operator.ownerId, conv.id, url, scraped);
        }
      }

      const syncTools: ToolDefinition[] = [];
      if (webSearchTool) syncTools.push(webSearchTool);
      if (kbSeedTool) syncTools.push(kbSeedTool);
      syncTools.push(writeFileTool);
      if (httpRequestTool) syncTools.push(httpRequestTool);
      const syncOpts = { ...chatOpts, tools: syncTools.length > 0 ? syncTools : undefined };
      const result = await chatCompletion(messages, syncOpts);

      let finalContent = result.content;
      let finalPromptTokens = result.promptTokens;
      let finalCompletionTokens = result.completionTokens;
      let capabilityFired = false;

      // Narration fallback — operator said "Searching now: X" in text but didn't call the tool.
      if (!result.toolCall && webSearchTool) {
        const narratedQuery = extractNarratedSearchQuery(result.content, message);
        if (narratedQuery) {
          console.log(`[agency] narration fallback (sync) — firing real search: "${narratedQuery}"`);
          const capResult = await executeWebSearch(narratedQuery);
          if (capResult.success) {
            await persistWebSearchResult(operator.id, operator.ownerId, conv.id, narratedQuery, capResult, operator.mandate ?? '');
            capabilityFired = true;
            const searchMessages: ChatMessage[] = [
              ...messages,
              { role: 'system', content: `[Web Search: ${narratedQuery}]\n${capResult.output}` },
            ];
            const secondResult = await chatCompletion(searchMessages, chatOpts);
            finalContent = secondResult.content;
            finalPromptTokens = secondResult.promptTokens;
            finalCompletionTokens = secondResult.completionTokens;
          }
        }
      }

      // Web search — operator actually called the tool via function calling
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'web_search') {
        let searchQuery = '';
        try { searchQuery = JSON.parse(result.toolCall.args).query ?? ''; } catch { /* skip */ }
        if (searchQuery) {
          console.log(`[agency] operator-initiated web search (sync): "${searchQuery}"`);
          const capResult = await executeWebSearch(searchQuery);
          if (capResult.success) {
            await persistWebSearchResult(operator.id, operator.ownerId, conv.id, searchQuery, capResult, operator.mandate ?? '');
            capabilityFired = true;
            const toolResultMessages: ChatMessage[] = [
              ...messages,
              { role: 'system', content: `[Web Search: ${searchQuery}]\n${capResult.output}` },
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

      // HTTP request — operator called http_request tool (sync path)
      if (!capabilityFired && result.toolCall && result.toolCall.name === 'http_request') {
        let httpArgs: { method: string; url: string; headers?: Record<string, string>; body?: string } = { method: 'GET', url: '' };
        try { httpArgs = JSON.parse(result.toolCall.args); } catch { /* skip */ }
        if (httpArgs.url) {
          console.log(`[agency] http_request (sync): ${httpArgs.method} ${httpArgs.url}`);
          capabilityFired = true;
          let httpResult: string;
          try {
            httpResult = await executeHttpRequest(operator.id, httpArgs);
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

      // Skill trigger — only if no web search already fired
      if (!capabilityFired) {
        const skillTrigger = await detectSkillTrigger(message, agencySkills, result.content);
        if (skillTrigger) {
          skillTrigger.operatorId = operator.id;
          skillTrigger.operatorOwnerId = operator.ownerId;
          console.log(`[agency] skill triggered: ${skillTrigger.name}`);
          const skillResult = await executeSkill(skillTrigger, chatModel);
          if (skillResult.success) {
            await persistSkillResult(operator.id, operator.ownerId, conv.id, skillTrigger, skillResult);
            const secondMessages = buildSkillSecondPassMessages(messages, result.content, skillResult.output);
            const secondResult = await chatCompletion(secondMessages, chatOpts);
            finalContent = secondResult.content;
            finalPromptTokens = secondResult.promptTokens;
            finalCompletionTokens = secondResult.completionTokens;
          }
        }
      }

      // Save assistant message and update conversation
      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: finalContent,
        tokenCount: finalCompletionTokens || null,
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

      runPostResponseTasks(operator, conv, finalContent, isBirthMode);

    } catch (err) {
      res.status(502).json({ error: 'AI backend error', detail: (err as Error).message });
    }
  }
});

export default router;
