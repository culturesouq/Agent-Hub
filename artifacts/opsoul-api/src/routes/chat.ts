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
} from '@workspace/db';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { embed, semanticDistance } from '@workspace/opsoul-utils/ai';
import { requireAuth } from '../middleware/requireAuth.js';
import { lockLayer1IfUnlocked } from '../utils/lockLayer1.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { buildSystemPrompt, buildBirthSystemPrompt } from '../utils/systemPrompt.js';
import type { ActiveSkill, SelfAwarenessSnapshot, BuildSystemPromptOpts } from '../utils/systemPrompt.js';
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
import { verifyAndStore } from '../utils/kbIntake.js';
import { eq, and, asc } from 'drizzle-orm';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { isWebSearchAvailable, executeWebSearch } from '../utils/capabilityEngine.js';

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

  return msgs as ChatMessage[];
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

  // DB-level guard — handles both stale in-memory state (Issue 1) and concurrent race (Issue 5).
  // Only the first successful extraction writes. All subsequent calls skip silently.
  const [current] = await db.select({ rawIdentity: operatorsTable.rawIdentity }).from(operatorsTable).where(eq(operatorsTable.id, operatorId));
  if (current?.rawIdentity) return;

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

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});

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
          extractBirthIdentity(operator.id, conv.id).catch(() => {});
        }
      })
      .catch(() => {});
  }

  // Self-awareness + periodic memory distillation
  if (!operator.safeMode) {
    triggerSelfAwareness(operator.id, 'conversation_end').catch(() => {});
    const shouldDistill = ((conv.messageCount ?? 0) % 10 === 0);
    if (shouldDistill) {
      distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch(() => {});
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
    { role: 'user', content: `You just completed a task. Report back to the owner directly — as if you did the work yourself and are now sharing what you found.\n\nBe specific. Highlight what matters. Be conversational.\n\nNever mention tool names, skill names, raw JSON, raw URLs, or API responses. Never say "the result" or "the skill". Just speak naturally as their operator who got something done.` },
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

  const [skills, archetypeDefaultSkills, selfAwarenessRow, history] = await Promise.all([
    loadActiveSkills(operator.id),
    loadArchetypeSkills((operator.archetype as string[]) ?? []),
    db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operator.id)).limit(1),
    buildMessageHistory(conv.id),
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
  const promptOpts: BuildSystemPromptOpts = { sycophancyWarning, soulAnchorActive, languageInstruction, scopeLine, webSearchAvailable: isWebSearchAvailable() };

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
        kbContext,
        mergedSkills,
        memoryHits,
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
    { role: 'user', content: userContent },
  ];

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

  // Agency skills — built once, shared by both paths
  const agencySkills = buildAgencySkills(skills, archetypeDefaultSkills, installedNames, operator);

  // ─── STREAMING PATH ────────────────────────────────────────────────────────

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let fullContent = '';
    let completionTokens = 0;
    let promptTokens = 0;
    let messageSaved = false;

    req.on('close', async () => {
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
            .set({ messageCount: (conv.messageCount ?? 0) + 2, lastMessageAt: new Date() })
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

      const streamOpts = { ...chatOpts, tools: webSearchTool ? [webSearchTool] : undefined };
      let operatorToolCall: { id: string; name: string; args: string } | undefined;

      for await (const chunk of streamChat(messages, streamOpts)) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
        }
        if (chunk.toolCall) {
          operatorToolCall = chunk.toolCall;
        }
        if (chunk.done && chunk.usage) {
          promptTokens = chunk.usage.promptTokens;
          completionTokens = chunk.usage.completionTokens;
        }
      }

      // Signal to the frontend that streaming is done but processing continues
      res.write(`data: ${JSON.stringify({ processing: true })}\n\n`);

      let finalContent = fullContent;
      let finalTokens = completionTokens;
      let capabilityFired = false;

      // Narration fallback — operator said "Searching now: X" in text but didn't call the tool.
      // We honour the operator's intent: fire the real search and replace the narration with real results.
      if (!operatorToolCall && webSearchTool) {
        const narratedQuery = extractNarratedSearchQuery(fullContent, message);
        if (narratedQuery) {
          console.log(`[agency] narration fallback — firing real search: "${narratedQuery}"`);
          res.write(`data: ${JSON.stringify({ searching: narratedQuery })}\n\n`);
          const capResult = await executeWebSearch(narratedQuery);
          if (capResult.success) {
            await persistWebSearchResult(operator.id, operator.ownerId, conv.id, narratedQuery, capResult, operator.mandate ?? '');
            capabilityFired = true;
            const searchMessages: ChatMessage[] = [
              ...messages,
              { role: 'system', content: `[Web Search: ${narratedQuery}]\n${capResult.output}` },
            ];
            let secondContent = '';
            let secondTokens = 0;
            for await (const chunk of streamChat(searchMessages, chatOpts)) {
              if (chunk.delta) {
                secondContent += chunk.delta;
                res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
              }
              if (chunk.done && chunk.usage) {
                promptTokens = chunk.usage.promptTokens;
                secondTokens = chunk.usage.completionTokens;
              }
            }
            finalContent = secondContent;
            finalTokens = secondTokens;
          }
        }
      }

      // Web search — operator actually called the tool via function calling
      if (operatorToolCall && operatorToolCall.name === 'web_search') {
        let searchQuery = '';
        try { searchQuery = JSON.parse(operatorToolCall.args).query ?? ''; } catch { /* skip */ }
        if (searchQuery) {
          console.log(`[agency] operator-initiated web search: "${searchQuery}"`);
          res.write(`data: ${JSON.stringify({ searching: searchQuery })}\n\n`);
          const capResult = await executeWebSearch(searchQuery);
          if (capResult.success) {
            await persistWebSearchResult(operator.id, operator.ownerId, conv.id, searchQuery, capResult, operator.mandate ?? '');
            capabilityFired = true;
            const toolResultMessages: ChatMessage[] = [
              ...messages,
              { role: 'system', content: `[Web Search: ${searchQuery}]\n${capResult.output}` },
            ];
            let secondContent = '';
            let secondTokens = 0;
            for await (const chunk of streamChat(toolResultMessages, chatOpts)) {
              if (chunk.delta) {
                secondContent += chunk.delta;
                res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
              }
              if (chunk.done && chunk.usage) {
                promptTokens = chunk.usage.promptTokens;
                secondTokens = chunk.usage.completionTokens;
              }
            }
            finalContent = secondContent;
            finalTokens = secondTokens;
          }
        }
      }

      // Skill trigger — only if no web search already fired
      if (!capabilityFired) {
        const skillTrigger = await detectSkillTrigger(message, agencySkills, fullContent);
        if (skillTrigger) {
          skillTrigger.operatorId = operator.id;
          console.log(`[agency] skill triggered: ${skillTrigger.name}`);
          res.write(`data: ${JSON.stringify({ running: skillTrigger.name })}\n\n`);
          const skillResult = await executeSkill(skillTrigger, chatModel);
          if (skillResult.success) {
            await persistSkillResult(operator.id, operator.ownerId, conv.id, skillTrigger, skillResult);
            const secondMessages = buildSkillSecondPassMessages(messages, fullContent, skillResult.output);
            let secondContent = '';
            let secondTokens = 0;
            for await (const chunk of streamChat(secondMessages, chatOpts)) {
              if (chunk.delta) {
                secondContent += chunk.delta;
                res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
              }
              if (chunk.done && chunk.usage) {
                promptTokens = chunk.usage.promptTokens;
                secondTokens = chunk.usage.completionTokens;
              }
            }
            finalContent = secondContent;
            finalTokens = secondTokens;
          }
        }
      }

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
        .set({ messageCount: (conv.messageCount ?? 0) + 2, lastMessageAt: new Date() })
        .where(eq(conversationsTable.id, conv.id));

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

      const syncOpts = { ...chatOpts, tools: webSearchTool ? [webSearchTool] : undefined };
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

      // Skill trigger — only if no web search already fired
      if (!capabilityFired) {
        const skillTrigger = await detectSkillTrigger(message, agencySkills, result.content);
        if (skillTrigger) {
          skillTrigger.operatorId = operator.id;
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
        .set({ messageCount: (conv.messageCount ?? 0) + 2, lastMessageAt: new Date() })
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
