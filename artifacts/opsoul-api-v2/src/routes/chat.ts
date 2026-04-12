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
import {
  buildSystemPrompt,
  buildBirthSystemPrompt,
} from '../utils/systemPrompt.js';
import type { ActiveSkill, SelfAwarenessSnapshot, BuildSystemPromptOpts, LiveStationData } from '../utils/systemPrompt.js';
import { searchMemory } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { distillMemoriesFromConversations, storeMemory } from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { kbIngestOperator } from '../utils/kbIntake.js';
import type { Layer2Soul } from '../utils/systemPrompt.js';

const router = Router({ mergeParams: true });

// ── Schemas ──────────────────────────────────────────────────────────────────

const AttachmentSchema = z.object({
  type: z.enum(['image', 'text', 'url']),
  content: z.string(),
  mimeType: z.string().optional(),
  name: z.string().optional(),
});

const SendMessageSchema = z.object({
  message: z.string().min(1, 'message is required').max(8000),
  kbSearch: z.boolean().default(true),
  kbTopN: z.number().int().min(1).max(20).default(8),
  kbMinConfidence: z.number().int().min(0).max(100).default(30),
  attachments: z.array(AttachmentSchema).optional(),
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

async function loadActiveSkills(operatorId: string): Promise<ActiveSkill[]> {
  const installs = await db
    .select({
      name: platformSkillsTable.name,
      instructions: platformSkillsTable.instructions,
      outputFormat: platformSkillsTable.outputFormat,
      customInstructions: operatorSkillsTable.customInstructions,
    })
    .from(operatorSkillsTable)
    .innerJoin(platformSkillsTable, eq(operatorSkillsTable.skillId, platformSkillsTable.id))
    .where(and(eq(operatorSkillsTable.operatorId, operatorId), eq(operatorSkillsTable.isActive, true)));

  return installs as ActiveSkill[];
}

async function searchKbRaw(
  operatorId: string,
  embedding: number[],
  topN: number,
  minConfidence: number,
): Promise<{ content: string; confidence: number; sourceName: string | null }[]> {
  const { pool } = await import('@workspace/db-v2');
  const vecStr = `[${embedding.join(',')}]`;
  const result = await pool.query<{
    content: string;
    confidence_score: number;
    source_name: string | null;
    distance: number;
  }>(
    `SELECT content, confidence_score, source_name,
            (embedding <=> $1::vector) AS distance
     FROM opsoul_v3.operator_kb
     WHERE operator_id = $2
       AND embedding IS NOT NULL
       AND verification_status != 'rejected'
       AND confidence_score >= $3
     ORDER BY distance ASC
     LIMIT $4`,
    [vecStr, operatorId, minConfidence, topN],
  );
  return result.rows.map(r => ({
    content: r.content,
    confidence: r.confidence_score,
    sourceName: r.source_name,
  }));
}

function buildRagContext(hits: { content: string; confidence: number; sourceName: string | null }[]): string {
  if (hits.length === 0) return '';
  return hits
    .map(h => {
      const src = h.sourceName ? ` [${h.sourceName}, confidence ${h.confidence}%]` : ` [confidence ${h.confidence}%]`;
      return `${h.content}${src}`;
    })
    .join('\n\n---\n\n');
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

  const extractionPrompt = `You are extracting the founding identity of an AI Operator from a birth conversation.

Conversation:
${transcript}

Extract exactly:
- name: what the owner said to call the operator (just the name)
- rawIdentity: a 200-400 word first-person story written as the operator speaking, based on what the owner described
- archetype: 1 or 2 values only from: ["Executor","Advisor","Expert","Connector","Creator","Guardian","Builder","Catalyst","Analyst"]
- mandate: one sentence starting with a verb, stating the operator's core purpose

Return ONLY valid JSON, no markdown:
{"name":"...","rawIdentity":"...","archetype":["..."],"mandate":"..."}`;

  const result = await chatCompletion(
    [
      { role: 'system', content: 'You extract structured identity data from conversations. Return only valid JSON.' },
      { role: 'user', content: extractionPrompt },
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

  if (!operator.safeMode) {
    triggerSelfAwareness(operator.id, 'conversation_end');
    const shouldDistill = ((conv.messageCount ?? 0) % 10 === 0);
    if (shouldDistill) {
      distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch(() => {});
    }
  }
}

// ── SSE writer ────────────────────────────────────────────────────────────────

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

  // Resolve API key and model
  const chatApiKey = operator.openrouterApiKey
    ? (() => { try { return decryptToken(operator.openrouterApiKey!); } catch { return undefined; } })()
    : undefined;
  const chatModel = operator.defaultModel || CHAT_MODEL;
  const chatOpts = { apiKey: chatApiKey, model: chatModel };

  // ── Parallel data fetch ──────────────────────────────────────────────────
  const [skills, selfAwarenessRow, history, liveIntegrations, liveTasks, liveFiles] = await Promise.all([
    loadActiveSkills(operator.id),
    db.select().from(selfAwarenessStateTable).where(eq(selfAwarenessStateTable.operatorId, operator.id)).limit(1),
    buildMessageHistory(conv.id),
    db.select({ type: operatorIntegrationsTable.integrationType, label: operatorIntegrationsTable.integrationLabel, status: operatorIntegrationsTable.status, scopes: operatorIntegrationsTable.scopes }).from(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.operatorId, operator.id)),
    db.select({ name: tasksTable.contextName, status: tasksTable.status, payload: tasksTable.payload }).from(tasksTable).where(eq(tasksTable.operatorId, operator.id)),
    db.select({ filename: operatorFilesTable.filename }).from(operatorFilesTable).where(eq(operatorFilesTable.operatorId, operator.id)),
  ]);

  // ── Self-awareness snapshot ──────────────────────────────────────────────
  const selfAwarenessData = selfAwarenessRow[0] ?? null;
  const storedIdentity = selfAwarenessData?.identityState as Record<string, unknown> | null | undefined;
  const storedTaskHistory = selfAwarenessData?.taskHistory as { successRate?: number; last30Tasks?: { taskType: string }[] } | null | undefined;

  const selfAwareness: SelfAwarenessSnapshot | null = selfAwarenessData
    ? {
        healthScore: selfAwarenessData.healthScore as { score: number; label: string } | null,
        mandateGaps: selfAwarenessData.mandateGaps ?? null,
        lastUpdateTrigger: selfAwarenessData.lastUpdateTrigger ?? null,
        lastUpdated: selfAwarenessData.lastUpdated ?? null,
        growLockLevel: (storedIdentity?.growLockLevel as string | null) ?? null,
        soulState: selfAwarenessData.soulState as SelfAwarenessSnapshot['soulState'],
        capabilityState: selfAwarenessData.capabilityState as SelfAwarenessSnapshot['capabilityState'],
        workspaceManifest: selfAwarenessData.workspaceManifest as SelfAwarenessSnapshot['workspaceManifest'],
        taskSummary: storedTaskHistory
          ? {
              successRate: storedTaskHistory.successRate ?? 100,
              recentTypes: [...new Set((storedTaskHistory.last30Tasks ?? []).map(t => t.taskType).filter(Boolean))].slice(0, 5),
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
        const last = asstMsgs[asstMsgs.length - 1].content;
        if (typeof first === 'string' && typeof last === 'string') {
          sycophancyWarning = await semanticDistance(first, last) > 0.35;
        }
      } catch { /* non-critical */ }
    }
  }

  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(message);
  const languageInstruction = hasArabic ? 'The user is writing in Arabic. Respond in Arabic. Match their dialect if possible.' : undefined;
  const scopeLine = `[SCOPE: ${conv.scopeType} | ${conv.scopeId}]`;

  const promptOpts: BuildSystemPromptOpts = { sycophancyWarning, soulAnchorActive, languageInstruction, scopeLine, webSearchAvailable: true };

  // ── KB + Memory search ───────────────────────────────────────────────────
  let kbContext = '';
  let memoryHits: MemoryHit[] = [];

  if (kbSearch) {
    try {
      const queryEmbedding = await embed(message);
      const [kbHits, memHits] = await Promise.all([
        searchKbRaw(operator.id, queryEmbedding, kbTopN, kbMinConfidence),
        searchMemory(operator.id, queryEmbedding),
      ]);
      kbContext = buildRagContext(kbHits);
      memoryHits = memHits;
    } catch { /* non-critical — continue without */ }
  }

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
          name: operator.name,
          archetype: operator.archetype,
          rawIdentity: operator.rawIdentity ?? undefined,
          mandate: operator.mandate,
          coreValues: operator.coreValues,
          ethicalBoundaries: operator.ethicalBoundaries,
          layer2Soul: operator.layer2Soul as Layer2Soul,
        },
        kbContext,
        skills,
        memoryHits,
        selfAwareness,
        promptOpts,
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
      }
    }
    userContent = parts;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];

  // ── Persist user message ─────────────────────────────────────────────────
  await db.insert(messagesTable).values({
    id: crypto.randomUUID(),
    conversationId: conv.id,
    operatorId: operator.id,
    role: 'user',
    content: message,
    tokenCount: null,
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
      description: 'Search the web for current, live information. Call this tool directly and silently — never announce "I will search" in your text. Just call it. Your response will reflect what you found.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Concise search query, 3–8 words' } }, required: ['query'] },
    },
  };

  const kbSeedTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'kb_seed',
      description: 'Persist a validated knowledge entry into your knowledge base. Call AFTER researching and synthesizing a clear, durable insight. Do not use for ephemeral data, opinions, or uncertain facts.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Self-contained factual insight (100–400 words). No filler. Pure information.' },
          source: { type: 'string', description: 'Name of the source(s) this was derived from.' },
          confidence: { type: 'number', description: 'Your confidence 40–85. Use 80+ only if multiple independent sources agree.' },
        },
        required: ['content', 'source', 'confidence'],
      },
    },
  };

  const writeFileTool: ToolDefinition = {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or update a file in your workspace. Use when creating a document, report, notes, or to-do list would genuinely help the owner. Owner can see and download files from the Files tab.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename including extension (e.g. "report.md", "todo.txt", "plan.md")' },
          content: { type: 'string', description: 'Full file content. Well-formatted, ready to use.' },
          action: { type: 'string', enum: ['create', 'update'], description: 'Whether to create a new file or update an existing one.' },
        },
        required: ['filename', 'content', 'action'],
      },
    },
  };

  const tools: ToolDefinition[] = [webSearchTool, kbSeedTool, writeFileTool];

  // ── SSE headers ──────────────────────────────────────────────────────────
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

  // Keepalive ping every 15s
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
    // ── AGENT LOOP ────────────────────────────────────────────────────────
    const MAX_ITER = 8;
    const MAX_SEARCHES = 5;
    const loopMessages: ChatMessage[] = [...messages];
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
        if (chunk.toolCall) {
          iterToolCall = chunk.toolCall;
        }
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

          // Dynamic import of web search (same as v1)
          let capResult: { success: boolean; output: string };
          try {
            const { executeWebSearch } = await import('../utils/capabilityEngine.js');
            capResult = await executeWebSearch(searchQuery);
          } catch {
            capResult = { success: false, output: 'Web search not available' };
          }

          if (capResult.success) {
            webSearchCount++;
            // Store result in conversation
            await db.insert(messagesTable).values({
              id: crypto.randomUUID(),
              operatorId: operator.id,
              conversationId: conv.id,
              role: 'system',
              content: `[Web Search] ${searchQuery}\n${capResult.output}`,
              isInternal: true,
            });

            loopMessages.push(
              {
                role: 'assistant',
                content: iterContent || '',
                tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'web_search', arguments: iterToolCall.args } }],
              },
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
            ? `Entry stored. Confidence: ${Math.max(40, Math.min(85, Math.round(confidence)))}. Status: pending — queued for verification.`
            : `Entry not stored: ${seedResult.reason}`;

          loopMessages.push(
            {
              role: 'assistant',
              content: iterContent || '',
              tool_calls: [{ id: iterToolCall.id, type: 'function', function: { name: 'kb_seed', arguments: iterToolCall.args } }],
            },
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

          // Check for existing file with this name
          const existing = await db.select({ id: operatorFilesTable.id })
            .from(operatorFilesTable)
            .where(and(eq(operatorFilesTable.operatorId, operator.id), eq(operatorFilesTable.filename, fileArgs.filename)))
            .limit(1);

          let fileId: string;
          if (existing.length > 0 && fileArgs.action !== 'create') {
            fileId = existing[0].id;
            await db.update(operatorFilesTable)
              .set({ content: fileArgs.content, updatedAt: new Date() })
              .where(eq(operatorFilesTable.id, fileId));
          } else {
            fileId = crypto.randomUUID();
            await db.insert(operatorFilesTable).values({
              id: fileId,
              operatorId: operator.id,
              ownerId: operator.ownerId,
              filename: fileArgs.filename,
              content: fileArgs.content,
            });
          }

          send({ file_created: { id: fileId, filename: fileArgs.filename } });

          const toolResultText = `File "${fileArgs.filename}" ${existing.length > 0 && fileArgs.action !== 'create' ? 'updated' : 'created'} successfully. Owner can see and download it from the Files tab.`;

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

      // ── No tool call — clean final response ───────────────────────────
      finalContent = iterContent;
      break;
    }

    if (!finalContent) finalContent = fullContent;

    // ── Signal processing ─────────────────────────────────────────────────
    send({ processing: true });

    // ── Save assistant message ────────────────────────────────────────────
    messageSaved = true;
    const asstMsgId = crypto.randomUUID();
    await db.insert(messagesTable).values({
      id: asstMsgId,
      conversationId: conv.id,
      operatorId: operator.id,
      role: 'assistant',
      content: finalContent,
      tokenCount: completionTokens || null,
    });

    await db.update(conversationsTable)
      .set({ messageCount: (conv.messageCount ?? 0) + 2, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, conv.id));

    cleanup();
    send({
      done: true,
      messageId: asstMsgId,
      model: chatModel,
      usage: { promptTokens, completionTokens },
      kbSeedCount,
      webSearchCount,
      memoryCount: memoryHits.length,
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
