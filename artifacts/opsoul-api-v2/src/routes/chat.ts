import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
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
} from '@workspace/db-v2';
import { eq, and, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { resolveScope } from '../utils/scopeResolver.js';
import { embed } from '@workspace/opsoul-utils/ai';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import { streamChat, CHAT_MODEL } from '../utils/openrouter.js';
import type { ChatMessage, ToolDefinition, ContentPart } from '../utils/openrouter.js';
import { chatCompletion } from '../utils/openrouter.js';
import { buildSystemPrompt, buildBirthSystemPrompt } from '../utils/systemPrompt.js';
import type { ActiveSkill, SelfAwarenessSnapshot, BuildSystemPromptOpts, LiveStationData } from '../utils/systemPrompt.js';
import { searchMemory } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { distillMemoriesFromConversations, storeMemory } from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { kbIngestOperator, verifyAndStore } from '../utils/kbIntake.js';
import type { Layer2Soul } from '../utils/systemPrompt.js';
import { detectSkillTrigger } from '../utils/skillTriggerEngine.js';
import type { InstalledSkill } from '../utils/skillTriggerEngine.js';
import { executeSkill } from '../utils/skillExecutor.js';
import { loadArchetypeSkills } from '../utils/archetypeSkills.js';
import { scrapeUrl } from '../utils/urlScraper.js';
import { searchBothKbs, buildRagContext } from '../utils/vectorSearch.js';
import { isWebSearchAvailable } from '../utils/capabilityEngine.js';

const router = Router({ mergeParams: true });

// ── Schemas ──────────────────────────────────────────────────────────────────

const AttachmentSchema = z.object({
  type: z.enum(['image', 'text', 'url']),
  content: z.string(),
  mimeType: z.string().optional(),
  name: z.string().optional(),
});

const SendMessageSchema = z.object({
  message:         z.string().min(1, 'message is required').max(8000),
  kbSearch:        z.boolean().default(true),
  kbTopN:          z.number().int().min(1).max(20).default(8),
  kbMinConfidence: z.number().int().min(0).max(100).default(30),
  attachments:     z.array(AttachmentSchema).optional(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveOperatorAndConv(
  req: Request,
  res: Response,
): Promise<{ operator: typeof operatorsTable.$inferSelect; conv: typeof conversationsTable.$inferSelect } | null> {
  const [operator] = await db.select().from(operatorsTable).where(
    and(eq(operatorsTable.id, req.params.operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)),
  );
  if (!operator) { res.status(404).json({ error: 'Operator not found' }); return null; }

  const expectedScope = resolveScope({ operatorId: operator.id, source: 'owner', callerId: req.owner!.ownerId });
  const [conv] = await db.select().from(conversationsTable).where(
    and(
      eq(conversationsTable.id, req.params.convId),
      eq(conversationsTable.operatorId, operator.id),
      eq(conversationsTable.scopeId, expectedScope.scopeId),
    ),
  );
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return null; }
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

async function loadActiveSkills(operatorId: string): Promise<InstalledSkill[]> {
  const installs = await db
    .select({
      id:                 operatorSkillsTable.id,
      skillId:            operatorSkillsTable.skillId,
      name:               platformSkillsTable.name,
      instructions:       platformSkillsTable.instructions,
      outputFormat:       platformSkillsTable.outputFormat,
      triggerDescription: platformSkillsTable.triggerDescription,
      customInstructions: operatorSkillsTable.customInstructions,
      integrationType:    platformSkillsTable.integrationType,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(and(eq(operatorSkillsTable.operatorId, operatorId), eq(operatorSkillsTable.isActive, true)));

  return installs.map(s => ({
    installId:          s.id,
    skillId:            s.skillId,
    name:               s.name,
    instructions:       s.instructions ?? '',
    outputFormat:       s.outputFormat ?? null,
    triggerDescription: s.triggerDescription ?? '',
    customInstructions: s.customInstructions ?? null,
    integrationType:    s.integrationType ?? null,
  }));
}

function buildAgencySkills(
  installed: InstalledSkill[],
  archetypeDefaults: InstalledSkill[],
  operator: typeof operatorsTable.$inferSelect,
): InstalledSkill[] {
  const installedNames = new Set(installed.map(s => s.name));
  let list: InstalledSkill[] = [
    ...installed,
    ...archetypeDefaults.filter(a => !installedNames.has(a.name)),
  ];

  if (operator.freeRoaming && operator.toolUsePolicy) {
    const rawPolicy = operator.toolUsePolicy;
    if (rawPolicy !== 'auto' && typeof rawPolicy === 'object' && rawPolicy !== null) {
      const allowedNames = new Set(Object.keys(rawPolicy as Record<string, unknown>));
      if (allowedNames.size > 0) {
        const before = list.length;
        list = list.filter(s => allowedNames.has(s.name));
        console.log(`[policy] free roaming — filtered skills ${before} → ${list.length} for operator ${operator.id}`);
      }
    }
  }
  return list;
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) ?? [];
  return [...new Set(matches)].slice(0, 2);
}

function extractNarratedSearchQuery(content: string, userMessageFallback: string): string | null {
  const explicit = content.match(/Searching(?:\s+now)?(?:\s+for)?:\s*(.+?)(?:\n|$)/i);
  if (explicit) return explicit[1].trim().slice(0, 200);
  const movingTo = content.match(/Moving to topic [a-z\s]+[—\-–]+\s*(.+?)(?:\.|$)/im);
  if (movingTo) return movingTo[1].trim().slice(0, 200);
  const nowSearching = content.match(/Now (?:searching|looking at|researching)\s+(.+?)(?:\.|$)/im);
  if (nowSearching) return nowSearching[1].trim().slice(0, 200);
  if (/\bSearching\s+now\.?\s*$/im.test(content)) return userMessageFallback.slice(0, 200);
  return null;
}

async function persistUrlScrapedResult(
  operatorId: string, ownerId: string, convId: string, url: string, content: string,
): Promise<void> {
  let domain = url;
  try { domain = new URL(url).hostname; } catch { /* use full url */ }
  await db.insert(messagesTable).values({
    id: crypto.randomUUID(), operatorId, conversationId: convId,
    role: 'system', content: `[URL Content] ${url}\n${content}`, isInternal: true,
  });
  storeMemory(operatorId, ownerId, `Operator read URL "${domain}". Summary: ${content.slice(0, 400)}`, 'fact', 'ai_distilled', 0.6).catch(() => {});
}

async function persistWebSearchResult(
  operatorId: string, ownerId: string, convId: string, searchQuery: string,
  capResult: { output: string }, mandate: string,
): Promise<void> {
  await db.insert(messagesTable).values({
    id: crypto.randomUUID(), operatorId, conversationId: convId,
    role: 'system', content: `[Web Search] ${searchQuery}\n${capResult.output}`, isInternal: true,
  });
  verifyAndStore(operatorId, ownerId, capResult.output, `web_search:${searchQuery}`, searchQuery, mandate).catch(() => {});
  storeMemory(operatorId, ownerId, `Web search performed: "${searchQuery}". Key findings: ${capResult.output.slice(0, 600)}`, 'fact', 'ai_distilled', 0.65).catch(() => {});
}

async function persistSkillResult(
  operatorId: string, ownerId: string, convId: string,
  skillTrigger: { name: string; skillId: string },
  skillResult: { skillName: string; output: string },
): Promise<void> {
  await db.insert(messagesTable).values({
    id: crypto.randomUUID(), operatorId, conversationId: convId,
    role: 'system', content: `[Skill: ${skillResult.skillName}] Result:\n${skillResult.output}`, isInternal: true,
  });
  await db.insert(tasksTable).values({
    id: crypto.randomUUID(), operatorId, conversationId: convId,
    contextName: skillTrigger.name, taskType: 'skill_execution',
    integrationLabel: 'platform_skill',
    payload: { skillId: skillTrigger.skillId, result: skillResult.output },
    status: 'completed', summary: `Executed ${skillTrigger.name}`, completedAt: new Date(),
  });
  console.log(`[agency] skill ${skillTrigger.name} executed and logged`);
  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
  storeMemory(operatorId, ownerId, `Skill executed: ${skillTrigger.name}. Result: ${skillResult.output.slice(0, 500)}`, 'pattern', 'ai_distilled', 0.6).catch(() => {});
}

function buildSkillSecondPassMessages(
  messages: ChatMessage[], firstResponse: string, skillOutput: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: firstResponse },
    { role: 'system', content: `[Task completed — findings below]\n${skillOutput}` },
    { role: 'user', content: `You just completed a task. Report back to the owner directly — as if you did the work yourself and are now sharing what you found.\n\nBe specific. Highlight what matters. Be conversational.\n\nNever mention tool names, skill names, raw JSON, raw URLs, or API responses. Never say "the result" or "the skill". Just speak naturally as their operator who got something done.` },
  ];
}

async function extractBirthIdentity(operatorId: string, conversationId: string): Promise<void> {
  const msgs = await db
    .select({ role: messagesTable.role, content: messagesTable.content })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt));

  const transcript = msgs
    .map(m => `${m.role === 'user' ? 'Owner' : 'Operator'}: ${m.content}`)
    .join('\n');

  const result = await chatCompletion(
    [
      { role: 'system', content: 'You extract structured identity data from conversations. Return only valid JSON.' },
      { role: 'user', content: `You are extracting the founding identity of an AI Operator from a birth conversation.\n\nConversation:\n${transcript}\n\nExtract exactly:\n- name: what the owner said to call the operator (just the name)\n- rawIdentity: a 200-400 word first-person story written as the operator speaking, based on what the owner described\n- archetype: 1 or 2 values only from: ["Executor","Advisor","Expert","Connector","Creator","Guardian","Builder","Catalyst","Analyst"]\n- mandate: one sentence starting with a verb, stating the operator's core purpose\n\nReturn ONLY valid JSON, no markdown:\n{"name":"...","rawIdentity":"...","archetype":["..."],"mandate":"..."}` },
    ],
    { model: CHAT_MODEL },
  );

  let extracted: { name: string; rawIdentity: string; archetype: string[]; mandate: string };
  try {
    const raw = typeof result.content === 'string' ? result.content : '';
    extracted = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  } catch { return; }

  if (!extracted.name || !extracted.rawIdentity || !extracted.archetype?.length || !extracted.mandate) return;

  const [current] = await db.select({ rawIdentity: operatorsTable.rawIdentity }).from(operatorsTable).where(eq(operatorsTable.id, operatorId));
  if (current?.rawIdentity) return;

  await db.update(operatorsTable).set({
    name: extracted.name,
    rawIdentity: extracted.rawIdentity,
    archetype: extracted.archetype,
    mandate: extracted.mandate,
  }).where(eq(operatorsTable.id, operatorId));
}

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
          verifyAndStore(operator.id, operator.ownerId, text, 'self_learn', 'operator_self_learn', operator.mandate ?? '').catch(() => {});
        }
      }
    }
  }

  if (isBirthMode) {
    db.select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(eq(messagesTable.conversationId, conv.id), eq(messagesTable.role, 'user')))
      .then(userMessages => {
        if (userMessages.length >= 2) {
          extractBirthIdentity(operator.id, conv.id).catch((err) => console.error('[BIRTH EXTRACT ERROR]', (err as Error).message ?? err));
        }
      })
      .catch((err) => console.error('[BIRTH QUERY ERROR]', (err as Error).message ?? err));
  }

  if (!operator.safeMode) {
    triggerSelfAwareness(operator.id, 'conversation_end');
    const shouldDistill = ((conv.messageCount ?? 0) % 10 === 0);
    if (shouldDistill) {
      distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch(() => {});
    }
  }
}

function makeSseWriter(res: Response) {
  return (event: Record<string, unknown>) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* connection closed */ }
  };
}

// ── Main route ────────────────────────────────────────────────────────────────

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const ctx = await resolveOperatorAndConv(req, res);
  if (!ctx) return;

  const { operator, conv } = ctx;

  const parsed = SendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const { message, kbSearch, kbTopN, kbMinConfidence, attachments } = parsed.data;

  const chatApiKey = operator.openrouterApiKey
    ? (() => { try { return decryptToken(operator.openrouterApiKey!); } catch { return undefined; } })()
    : undefined;

  const rawModel = operator.defaultModel || CHAT_MODEL;
  let chatModel = rawModel;
  const chatOpts = { apiKey: chatApiKey, get model() { return chatModel; } };

  // ── Parallel data fetch ──────────────────────────────────────────────────
  const [skills, archetypeDefaultSkills, selfAwarenessRow, history, liveIntegrations, liveTasks, liveFiles] = await Promise.all([
    loadActiveSkills(operator.id),
    loadArchetypeSkills((operator.archetype as string[]) ?? []),
    db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operator.id)).limit(1),
    buildMessageHistory(conv.id),
    db.select({ type: operatorIntegrationsTable.integrationType, label: operatorIntegrationsTable.integrationLabel, status: operatorIntegrationsTable.status, scopes: operatorIntegrationsTable.scopes }).from(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.operatorId, operator.id)),
    db.select({ name: tasksTable.contextName, status: tasksTable.status, payload: tasksTable.payload }).from(tasksTable).where(eq(tasksTable.operatorId, operator.id)),
    db.select({ filename: operatorFilesTable.filename }).from(operatorFilesTable).where(eq(operatorFilesTable.operatorId, operator.id)),
  ]);

  // ── Agency skills (installed + archetype defaults merged, policy applied) ─
  const agencySkills = buildAgencySkills(skills, archetypeDefaultSkills as InstalledSkill[], operator);

  // ── Self-awareness snapshot ──────────────────────────────────────────────
  const selfAwarenessData = selfAwarenessRow[0] ?? null;
  const storedIdentity = selfAwarenessData?.identityState as Record<string, unknown> | null | undefined;
  const storedTaskHistory = selfAwarenessData?.taskHistory as { successRate?: number; last30Tasks?: { taskType: string }[] } | null | undefined;

  const selfAwareness: SelfAwarenessSnapshot | null = selfAwarenessData
    ? {
        healthScore:        selfAwarenessData.healthScore as { score: number; label: string } | null,
        mandateGaps:        selfAwarenessData.mandateGaps ?? null,
        lastUpdateTrigger:  selfAwarenessData.lastUpdateTrigger ?? null,
        lastUpdated:        selfAwarenessData.lastUpdated ?? null,
        growLockLevel:      (storedIdentity?.growLockLevel as string | null) ?? null,
        soulState:          selfAwarenessData.soulState as SelfAwarenessSnapshot['soulState'],
        capabilityState:    selfAwarenessData.capabilityState as SelfAwarenessSnapshot['capabilityState'],
        workspaceManifest:  selfAwarenessData.workspaceManifest as SelfAwarenessSnapshot['workspaceManifest'],
        taskSummary: storedTaskHistory
          ? {
              successRate:  storedTaskHistory.successRate ?? 100,
              recentTypes:  [...new Set((storedTaskHistory.last30Tasks ?? []).map(t => t.taskType).filter(Boolean))].slice(0, 5),
            }
          : null,
      }
    : null;

  // ── Prompt options ───────────────────────────────────────────────────────
  const CONTEXT_WINDOW = 128_000;
  const historyTokenEstimate = history.reduce((sum, m) => sum + Math.ceil((typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).length / 4), 0);
  const soulAnchorActive = historyTokenEstimate > Math.floor(CONTEXT_WINDOW * 0.4);

  let sycophancyWarning = false;
  if (history.length >= 6) {
    const asstMsgs = history.filter(m => m.role === 'assistant');
    if (asstMsgs.length >= 2) {
      try {
        const { semanticDistance } = await import('@workspace/opsoul-utils/ai');
        const first = asstMsgs[0].content;
        const last  = asstMsgs[asstMsgs.length - 1].content;
        if (typeof first === 'string' && typeof last === 'string') {
          sycophancyWarning = await semanticDistance(first, last) > 0.35;
        }
      } catch { /* non-critical */ }
    }
  }

  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(message);
  const languageInstruction = hasArabic ? 'The user is writing in Arabic. Respond in Arabic. Match their dialect if possible.' : undefined;
  const scopeLine = `[SCOPE: ${conv.scopeType} | ${conv.scopeId}]`;

  // ── KB + Memory search ───────────────────────────────────────────────────
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
    } catch { /* non-critical */ }
  }

  // ── Auto model routing ───────────────────────────────────────────────────
  chatModel = (() => {
    if (rawModel !== 'opsoul/auto') return rawModel;
    const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
    const isShort = message.length < 200;
    const hasContext = kbContext.length > 0 || memoryHits.length > 0;
    const webSearchActive = isWebSearchAvailable();
    const resolved = hasAttachment
      ? 'google/gemini-flash-2.0'
      : isShort && !hasContext && !webSearchActive
        ? 'anthropic/claude-haiku-4-5'
        : 'anthropic/claude-sonnet-4-5';
    console.log(`[AUTO] routed → ${resolved} | short=${isShort} attachment=${hasAttachment} hasContext=${hasContext} webSearch=${webSearchActive}`);
    return resolved;
  })();

  // ── Birth mode ───────────────────────────────────────────────────────────
  const isBirthMode = !operator.rawIdentity;

  // ── Live station ─────────────────────────────────────────────────────────
  const liveStation: LiveStationData = {
    integrations: liveIntegrations.map(i => ({ type: i.type ?? '', label: i.label ?? '', status: i.status ?? 'unknown', scopes: i.scopes ?? null })),
    tasks: liveTasks.map(t => {
      const p = (t.payload ?? {}) as Record<string, unknown>;
      return { name: t.name ?? 'Unnamed task', status: t.status ?? 'active', payload: p, lastRunAt: (p.lastRunAt as string | null) ?? null, lastRunSummary: (p.lastRunSummary as string | null) ?? null };
    }),
    fileCount: liveFiles.length,
    fileNames: liveFiles.map(f => f.filename),
  };

  // ── System prompt ────────────────────────────────────────────────────────
  const systemPrompt = isBirthMode
    ? buildBirthSystemPrompt()
    : buildSystemPrompt(
        {
          name:              operator.name,
          archetype:         operator.archetype,
          rawIdentity:       operator.rawIdentity ?? undefined,
          mandate:           operator.mandate,
          coreValues:        operator.coreValues,
          ethicalBoundaries: operator.ethicalBoundaries,
          layer2Soul:        operator.layer2Soul as Layer2Soul,
        },
        kbContext,
        agencySkills as unknown as ActiveSkill[],
        memoryHits,
        selfAwareness,
        { sycophancyWarning, soulAnchorActive, languageInstruction, scopeLine, webSearchAvailable: true } satisfies BuildSystemPromptOpts,
        liveStation,
      );

  // ── Build user content (handles attachments) ─────────────────────────────
  let userContent: string | ContentPart[] = message;
  if (attachments && attachments.length > 0) {
    const parts: ContentPart[] = [{ type: 'text', text: message }];
    for (const att of attachments) {
      if (att.type === 'image') {
        parts.push({ type: 'image_url', image_url: { url: `data:${att.mimeType ?? 'image/jpeg'};base64,${att.content}` } });
      } else if (att.type === 'text') {
        parts.push({ type: 'text', text: `[Attached file: ${att.name ?? 'document'}]\n${att.content}` });
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

  // SENSES → KB PERSISTENCE (text + URL attachments persisted to KB; images are context-only)
  if (!operator.safeMode && attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.type === 'text' && att.content.length > 100) {
        verifyAndStore(operator.id, operator.ownerId, att.content, 'file_upload', att.name ?? 'uploaded_document', operator.mandate ?? '').catch(() => {});
      } else if (att.type === 'url') {
        try {
          const scraped = await scrapeUrl(att.content);
          if (scraped && scraped.length > 100) {
            verifyAndStore(operator.id, operator.ownerId, scraped, att.content, att.content, operator.mandate ?? '').catch(() => {});
          }
        } catch { /* scrape failed */ }
      }
    }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];

  // ── Persist user message ─────────────────────────────────────────────────
  await db.insert(messagesTable).values({
    id: crypto.randomUUID(), conversationId: conv.id,
    operatorId: operator.id, role: 'user', content: message, tokenCount: null,
  });

  // Lock Layer 1 silently after first message
  if (!operator.layer1LockedAt) {
    db.update(operatorsTable).set({ layer1LockedAt: new Date() }).where(eq(operatorsTable.id, operator.id)).catch(() => {});
  }

  // ── Tools ────────────────────────────────────────────────────────────────
  const webSearchTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current, live information. Call this tool directly and silently — never announce "I will search" in your text. Just call it.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Concise search query, 3–8 words' } }, required: ['query'] },
    },
  };

  const kbSeedTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'kb_seed',
      description: 'Persist a validated knowledge entry into your knowledge base. Call AFTER researching and synthesizing a clear, durable insight.',
      parameters: {
        type: 'object',
        properties: {
          content:    { type: 'string', description: 'Self-contained factual insight (100–400 words).' },
          source:     { type: 'string', description: 'Source name(s) this was derived from.' },
          confidence: { type: 'number', description: 'Confidence score 40–85.' },
        },
        required: ['content', 'source', 'confidence'],
      },
    },
  };

  const writeFileTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or update a file in your workspace. Use when a document, report, or plan would genuinely help the owner.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename including extension (e.g. "report.md")' },
          content:  { type: 'string', description: 'Full file content. Well-formatted and ready to use.' },
          action:   { type: 'string', enum: ['create', 'update'] },
        },
        required: ['filename', 'content', 'action'],
      },
    },
  };

  // ── SSE setup ────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Transfer-Encoding', 'chunked');
  (res.socket as unknown as { setNoDelay?: (v: boolean) => void })?.setNoDelay?.(true);
  res.flushHeaders();

  const send = makeSseWriter(res);
  let fullContent = '';
  let messageSaved = false;
  let promptTokens = 0;
  let completionTokens = 0;

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { /* connection gone */ }
  }, 15_000);
  const cleanup = () => clearInterval(keepalive);

  req.on('close', async () => {
    cleanup();
    if (!messageSaved && fullContent.length > 20) {
      try {
        await db.insert(messagesTable).values({ id: crypto.randomUUID(), conversationId: conv.id, operatorId: operator.id, role: 'assistant', content: fullContent, tokenCount: null });
        await db.update(conversationsTable).set({ messageCount: (conv.messageCount ?? 0) + 2, lastMessageAt: new Date() }).where(eq(conversationsTable.id, conv.id));
      } catch { /* best-effort */ }
    }
  });

  try {
    // ── URL auto-reading (scrape URLs in message before responding) ────────
    const loopMessages: ChatMessage[] = [...messages];

    for (const url of extractUrls(message)) {
      send({ reading: url });
      const scraped = await scrapeUrl(url).catch(() => null);
      if (scraped && scraped.length > 200) {
        loopMessages.push({ role: 'system', content: `[URL Content: ${url}]\n${scraped}` });
        await persistUrlScrapedResult(operator.id, operator.ownerId, conv.id, url, scraped);
      }
    }

    // ── AGENT LOOP ────────────────────────────────────────────────────────
    const MAX_ITER = 8;
    const MAX_SEARCHES = 5;
    let finalContent = '';
    let webSearchCount = 0;
    let kbSeedCount = 0;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      let iterContent = '';
      let iterToolCall: { id: string; name: string; args: string } | undefined;

      const iterTools: ToolDefinition[] = [];
      if (webSearchCount < MAX_SEARCHES) iterTools.push(webSearchTool);
      iterTools.push(kbSeedTool, writeFileTool);

      for await (const chunk of streamChat(loopMessages, { ...chatOpts, tools: iterTools })) {
        if (chunk.delta) {
          iterContent += chunk.delta;
          fullContent += chunk.delta;
          send({ delta: chunk.delta });
        }
        if (chunk.toolCall) iterToolCall = chunk.toolCall;
        if (chunk.done && chunk.usage) {
          promptTokens += chunk.usage.promptTokens;
          completionTokens += chunk.usage.completionTokens;
        }
      }

      // ── web_search ────────────────────────────────────────────────────
      if (iterToolCall?.name === 'web_search') {
        let searchQuery = '';
        try { searchQuery = JSON.parse(iterToolCall.args).query ?? ''; } catch { /* skip */ }

        if (searchQuery) {
          console.log(`[v3-chat] iter ${iter} — web_search: "${searchQuery}"`);
          send({ searching: searchQuery });

          let capResult: { success: boolean; output: string };
          try {
            const { executeWebSearch } = await import('../utils/capabilityEngine.js');
            capResult = await executeWebSearch(searchQuery);
          } catch {
            capResult = { success: false, output: 'Web search not available' };
          }

          if (capResult.success) {
            webSearchCount++;
            await persistWebSearchResult(operator.id, operator.ownerId, conv.id, searchQuery, capResult, operator.mandate ?? '');
            loopMessages.push(
              { role: 'assistant', content: iterContent || '', tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'web_search', arguments: iterToolCall.args } }] },
              { role: 'tool', content: capResult.output, tool_call_id: iterToolCall.id },
            );
            continue;
          }
        }
        finalContent = iterContent;
        break;
      }

      // ── kb_seed ───────────────────────────────────────────────────────
      if (iterToolCall?.name === 'kb_seed') {
        let seedArgs: { content?: string; source?: string; confidence?: number } = {};
        try { seedArgs = JSON.parse(iterToolCall.args); } catch { /* skip */ }

        if (seedArgs.content && seedArgs.source) {
          const confidence = typeof seedArgs.confidence === 'number' ? seedArgs.confidence : 65;
          console.log(`[v3-chat] iter ${iter} — kb_seed: "${seedArgs.source}" (confidence ${confidence})`);
          send({ seeding: seedArgs.source });
          kbSeedCount++;

          const seedResult = await kbIngestOperator(operator.id, operator.ownerId, seedArgs.content, seedArgs.source, confidence);
          if (seedResult.stored) {
            storeMemory(operator.id, operator.ownerId, `Knowledge entry seeded: "${seedArgs.source}". ${seedArgs.content!.slice(0, 300)}`, 'fact', 'ai_distilled', confidence / 100).catch(() => {});
          }

          const toolResultText = seedResult.stored
            ? `Entry stored. Confidence: ${Math.max(40, Math.min(85, Math.round(confidence)))}. Status: pending — queued for VAEL pipeline verification.`
            : `Entry not stored: ${seedResult.reason}`;

          loopMessages.push(
            { role: 'assistant', content: iterContent || '', tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'kb_seed', arguments: iterToolCall.args } }] },
            { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
          );
          continue;
        }
        finalContent = iterContent;
        break;
      }

      // ── write_file ────────────────────────────────────────────────────
      if (iterToolCall?.name === 'write_file') {
        let fileArgs: { filename?: string; content?: string; action?: string } = {};
        try { fileArgs = JSON.parse(iterToolCall.args); } catch { /* skip */ }

        if (fileArgs.filename && fileArgs.content) {
          console.log(`[v3-chat] iter ${iter} — write_file: "${fileArgs.filename}"`);
          send({ writing: fileArgs.filename });

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

          send({ file_created: { id: fileId, filename: fileArgs.filename } });
          const toolResultText = `File "${fileArgs.filename}" ${existing.length > 0 && fileArgs.action !== 'create' ? 'updated' : 'created'}. Owner can see and download it from the Files tab.`;

          loopMessages.push(
            { role: 'assistant', content: iterContent || '', tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'write_file', arguments: iterToolCall.args } }] },
            { role: 'tool', content: toolResultText, tool_call_id: iterToolCall.id },
          );
          continue;
        }
        finalContent = iterContent;
        break;
      }

      // ── Narration fallback — operator described a search in text ──────
      if (!iterToolCall && webSearchCount < MAX_SEARCHES) {
        const narratedQuery = extractNarratedSearchQuery(iterContent, message);
        if (narratedQuery) {
          console.log(`[agency] narration fallback iter ${iter} — firing real search: "${narratedQuery}"`);
          send({ searching: narratedQuery });
          let capResult: { success: boolean; output: string };
          try {
            const { executeWebSearch } = await import('../utils/capabilityEngine.js');
            capResult = await executeWebSearch(narratedQuery);
          } catch {
            capResult = { success: false, output: '' };
          }
          if (capResult.success) {
            webSearchCount++;
            await persistWebSearchResult(operator.id, operator.ownerId, conv.id, narratedQuery, capResult, operator.mandate ?? '');
            loopMessages.push(
              { role: 'assistant', content: iterContent },
              { role: 'system', content: `[Web Search: ${narratedQuery}]\n${capResult.output}` },
            );
            continue;
          }
        }
      }

      // ── No tool call — clean final response ───────────────────────────
      finalContent = iterContent;
      break;
    }

    if (!finalContent) finalContent = fullContent;

    // ── SKILL TRIGGER (post-loop, only if no web searches ran) ────────────
    let capabilityFired = webSearchCount > 0;
    if (!capabilityFired) {
      const skillTrigger = await detectSkillTrigger(message, agencySkills, finalContent);
      if (skillTrigger) {
        skillTrigger.operatorId = operator.id;
        console.log(`[agency] skill triggered: ${skillTrigger.name}`);
        send({ running: skillTrigger.name });
        const skillResult = await executeSkill(skillTrigger, chatModel);
        if (skillResult.success) {
          await persistSkillResult(operator.id, operator.ownerId, conv.id, skillTrigger, skillResult);
          const skillMessages = buildSkillSecondPassMessages(messages, finalContent, skillResult.output);
          let skillContent = '';
          let skillTokens = 0;
          for await (const chunk of streamChat(skillMessages, chatOpts)) {
            if (chunk.delta) {
              skillContent += chunk.delta;
              send({ delta: chunk.delta });
            }
            if (chunk.done && chunk.usage) {
              promptTokens += chunk.usage.promptTokens;
              skillTokens = chunk.usage.completionTokens;
            }
          }
          if (skillContent) {
            finalContent = skillContent;
            completionTokens = skillTokens;
            capabilityFired = true;
          }
        }
      }
    }

    // ── Signal processing ─────────────────────────────────────────────────
    send({ processing: true });

    // ── Save assistant message ────────────────────────────────────────────
    messageSaved = true;
    const asstMsgId = crypto.randomUUID();
    await db.insert(messagesTable).values({
      id: asstMsgId, conversationId: conv.id,
      operatorId: operator.id, role: 'assistant',
      content: finalContent, tokenCount: completionTokens || null,
    });

    await db.update(conversationsTable)
      .set({ messageCount: (conv.messageCount ?? 0) + 2, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));

    cleanup();
    send({
      done: true, messageId: asstMsgId, model: chatModel,
      usage: { promptTokens, completionTokens },
      activeSkillCount: agencySkills.length,
      kbSeedCount, webSearchCount, memoryCount: memoryHits.length,
    });
    res.end();

    runPostResponseTasks(operator, conv, finalContent, isBirthMode);

  } catch (err) {
    cleanup();
    send({ error: (err as Error).message });
    res.end();
  }
});

export default router;
