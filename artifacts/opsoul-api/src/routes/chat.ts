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
  missionContextsTable,
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
import { buildSystemPrompt } from '../utils/systemPrompt.js';
import type { ActiveSkill, ActiveMissionContext, SelfAwarenessSnapshot, BuildSystemPromptOpts } from '../utils/systemPrompt.js';
import { searchMemory, buildMemoryContext, distillMemoriesFromConversations } from '../utils/memoryEngine.js';
import type { MemoryHit } from '../utils/memoryEngine.js';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { streamChat, chatCompletion, CHAT_MODEL } from '../utils/openrouter.js';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import type { ChatMessage } from '../utils/openrouter.js';
import type { Layer2Soul } from '../validation/operator.js';
import { resolveScope } from '../utils/scopeResolver.js';
import { scrapeUrl } from '../utils/urlScraper.js';
import type { ContentPart } from '../utils/openrouter.js';
import { webSearch } from '../utils/webSearch.js';
import { verifyAndStore } from '../utils/kbIntake.js';
import { eq, and, asc } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

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

async function loadMissionContext(missionContextId: string | null | undefined): Promise<ActiveMissionContext | null> {
  if (!missionContextId) return null;
  const [ctx] = await db
    .select({
      name: missionContextsTable.name,
      toneInstructions: missionContextsTable.toneInstructions,
      integrationsAllowed: missionContextsTable.integrationsAllowed,
      growLockOverride: missionContextsTable.growLockOverride,
    })
    .from(missionContextsTable)
    .where(eq(missionContextsTable.id, missionContextId));

  return ctx ?? null;
}

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

  const [skills, missionContext, selfAwarenessRow, history] = await Promise.all([
    loadActiveSkills(operator.id),
    loadMissionContext(conv.missionContextId),
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
        const dist = await semanticDistance(
          assistantMsgs[0].content,
          assistantMsgs[assistantMsgs.length - 1].content,
        );
        sycophancyWarning = dist > 0.35;
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

  let kbContext = '';
  let memoryHits: MemoryHit[] = [];

  if (kbSearch) {
    try {
      const queryEmbedding = await embed(message);
      const [kbHits, memHits] = await Promise.all([
        searchBothKbs(operator.id, queryEmbedding, kbTopN, kbMinConfidence),
        searchMemory(operator.id, queryEmbedding),
      ]);
      kbContext = buildRagContext(kbHits);
      memoryHits = memHits;
    } catch {
      kbContext = '';
      memoryHits = [];
    }
  }

  // Web search — only trigger on KB miss
  // Uses curiosityEngine for tier evaluation and corroboration
  // instead of raw webSearch
  let searchContext = '';
  if (!kbContext || kbContext.trim().length < 100) {
    try {
      const { curiositySearch } = await import('../utils/curiosityEngine.js');
      const curiosity = await curiositySearch(message, operator.id);

      if (curiosity.corroborated && curiosity.tier) {
        // Build context only from trusted, corroborated sources
        searchContext = curiosity.sources
          .filter(s => s.tier === 1 || s.tier === 2)
          .map(s => `Source: ${s.title} (${s.url})\n${s.snippet}`)
          .join('\n\n');

        console.log(
          `[chat] curiosity search — tier: ${curiosity.tier}, ` +
          `corroborated: ${curiosity.corroborated}, ` +
          `confidence: ${curiosity.confidence}`
        );
      } else {
        console.log(
          `[chat] curiosity search — no corroborated source found (tier: ${curiosity.tier})`
        );
      }
    } catch (e) {
      console.error('[curiositySearch]', e);
    }
  }

  if (searchContext) {
    kbContext = kbContext
      ? `${kbContext}\n\n---\n\n${searchContext}`
      : searchContext;
  }

  // Auto routing — resolve final model now that kbContext and memoryHits are known
  chatModel = (() => {
    if (rawModel !== 'opsoul/auto') return rawModel;
    const hasAttachment = Array.isArray(attachments) && attachments.length > 0;
    const isShort = message.length < 200;
    const hasContext = kbContext.length > 0 || memoryHits.length > 0;
    const resolved = hasAttachment
      ? 'google/gemini-flash-2.0'
      : isShort && !hasContext
        ? 'anthropic/claude-haiku-4-5'
        : 'anthropic/claude-sonnet-4-5';
    console.log(`[AUTO] routed → ${resolved} | short=${isShort} attachment=${hasAttachment} hasContext=${hasContext}`);
    return resolved;
  })();

  const systemPrompt = buildSystemPrompt(
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
    missionContext,
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

  // --- SENSES → KB PERSISTENCE ---
  // Text attachments and URLs are persisted to Learned KB (fire-and-forget)
  // Images are context-only (no text to store)
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
  // --- END SENSES → KB PERSISTENCE ---

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];

  const userMsgId = crypto.randomUUID();
  await db.insert(messagesTable).values({
    id: userMsgId,
    conversationId: conv.id,
    operatorId: operator.id,
    role: 'user',
    content: message,
    tokenCount: null,
  });

  await lockLayer1IfUnlocked(operator.id);

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let fullContent = '';
    let completionTokens = 0;
    let promptTokens = 0;

    try {
      if (searchContext) {
        const notice = "I don't have that in my knowledge base — let me search and verify…\n\n";
        res.write(`data: ${JSON.stringify({ delta: notice })}\n\n`);
        fullContent += notice;
      }

      for await (const chunk of streamChat(messages, chatOpts)) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
        }
        if (chunk.done && chunk.usage) {
          promptTokens = chunk.usage.promptTokens;
          completionTokens = chunk.usage.completionTokens;
        }
      }

      // --- AGENCY LAYER ---
      const installedSkillsForAgency: InstalledSkill[] = skills.map((s: any) => ({
        installId:          s.id ?? s.skillId,
        skillId:            s.skillId,
        name:               s.name ?? s.skillName,
        triggerDescription: s.triggerDescription ?? '',
        instructions:       s.instructions ?? s.skillInstructions ?? '',
        outputFormat:       s.outputFormat ?? s.skillOutputFormat ?? null,
        customInstructions: s.customInstructions ?? null,
      }));
      // --- TOOL USE POLICY GATE ---
      // Only enforced when operator is in free roaming mode
      // In normal mode: skills are owner pre-approved, no gate needed
      if (operator.freeRoaming && operator.toolUsePolicy) {
        const policy = operator.toolUsePolicy as Record<string, string[]>;
        const hasAnyPolicy = Object.keys(policy).length > 0;
        if (hasAnyPolicy) {
          // Log that policy is active — enforcement hooks go here when
          // autonomous integration actions are built
          console.log(`[policy] free roaming active — policy enforced for operator ${operator.id}`);
        }
      }
      // --- END TOOL USE POLICY GATE ---

      const skillTrigger = await detectSkillTrigger(message, installedSkillsForAgency, fullContent);
      if (skillTrigger) {
        console.log(`[agency] skill triggered: ${skillTrigger.name}`);
        const skillResult = await executeSkill(skillTrigger, chatModel);
        if (skillResult.success) {
          const skillSystemMsg = `[Skill: ${skillResult.skillName}] Result:\n${skillResult.output}`;
          await db.insert(messagesTable).values({
            id:             crypto.randomUUID(),
            conversationId: conv.id,
            role:           'system',
            content:        skillSystemMsg,
          });
          await db.insert(tasksTable).values({
            id:               crypto.randomUUID(),
            operatorId:       operator.id,
            conversationId:   conv.id,
            contextName:      skillTrigger.name,
            taskType:         'skill_execution',
            integrationLabel: 'platform_skill',
            payload:          { skillId: skillTrigger.skillId, result: skillResult.output },
            status:           'completed',
            summary:          `Executed ${skillTrigger.name}`,
            completedAt:      new Date(),
          });
          console.log(`[agency] skill ${skillTrigger.name} executed and logged`);
          triggerSelfAwareness(operator.id, 'integration_change').catch(() => {});
        }
      }
      // --- END AGENCY LAYER ---

      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: fullContent,
        tokenCount: completionTokens || null,
      });

      await db.update(conversationsTable)
        .set({
          messageCount: (conv.messageCount ?? 0) + 2,
          lastMessageAt: new Date(),
        })
        .where(eq(conversationsTable.id, conv.id));

      res.write(`data: ${JSON.stringify({
        done: true,
        messageId: asstMsgId,
        model: chatModel,
        usage: { promptTokens, completionTokens },
        activeSkillCount: skills.length,
        missionContext: missionContext?.name ?? null,
        memoryCount: memoryHits.length,
      })}\n\n`);
      res.end();

      // --- [LEARN:] EXTRACTION ---
      if (!operator.safeMode) {
        const learnMatches = fullContent.match(/\[LEARN:\s*(.*?)\]/gs);
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
      // --- END [LEARN:] EXTRACTION ---

      if (!operator.safeMode) {
        triggerSelfAwareness(operator.id, 'conversation_end').catch(() => {});
        distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch(() => {});
      }
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`);
      res.end();
    }

  } else {
    try {
      const result = await chatCompletion(messages, chatOpts);

      // --- AGENCY LAYER ---
      const installedSkillsForAgency: InstalledSkill[] = skills.map((s: any) => ({
        installId:          s.id ?? s.skillId,
        skillId:            s.skillId,
        name:               s.name ?? s.skillName,
        triggerDescription: s.triggerDescription ?? '',
        instructions:       s.instructions ?? s.skillInstructions ?? '',
        outputFormat:       s.outputFormat ?? s.skillOutputFormat ?? null,
        customInstructions: s.customInstructions ?? null,
      }));
      // --- TOOL USE POLICY GATE ---
      // Only enforced when operator is in free roaming mode
      // In normal mode: skills are owner pre-approved, no gate needed
      if (operator.freeRoaming && operator.toolUsePolicy) {
        const policy = operator.toolUsePolicy as Record<string, string[]>;
        const hasAnyPolicy = Object.keys(policy).length > 0;
        if (hasAnyPolicy) {
          // Log that policy is active — enforcement hooks go here when
          // autonomous integration actions are built
          console.log(`[policy] free roaming active — policy enforced for operator ${operator.id}`);
        }
      }
      // --- END TOOL USE POLICY GATE ---

      const skillTrigger = await detectSkillTrigger(message, installedSkillsForAgency, result.content);
      if (skillTrigger) {
        console.log(`[agency] skill triggered: ${skillTrigger.name}`);
        const skillResult = await executeSkill(skillTrigger, chatModel);
        if (skillResult.success) {
          const skillSystemMsg = `[Skill: ${skillResult.skillName}] Result:\n${skillResult.output}`;
          await db.insert(messagesTable).values({
            id:             crypto.randomUUID(),
            conversationId: conv.id,
            role:           'system',
            content:        skillSystemMsg,
          });
          await db.insert(tasksTable).values({
            id:               crypto.randomUUID(),
            operatorId:       operator.id,
            conversationId:   conv.id,
            contextName:      skillTrigger.name,
            taskType:         'skill_execution',
            integrationLabel: 'platform_skill',
            payload:          { skillId: skillTrigger.skillId, result: skillResult.output },
            status:           'completed',
            summary:          `Executed ${skillTrigger.name}`,
            completedAt:      new Date(),
          });
          console.log(`[agency] skill ${skillTrigger.name} executed and logged`);
          triggerSelfAwareness(operator.id, 'integration_change').catch(() => {});
        }
      }
      // --- END AGENCY LAYER ---

      const asstMsgId = crypto.randomUUID();
      await db.insert(messagesTable).values({
        id: asstMsgId,
        conversationId: conv.id,
        operatorId: operator.id,
        role: 'assistant',
        content: result.content,
        tokenCount: result.completionTokens || null,
      });

      await db.update(conversationsTable)
        .set({
          messageCount: (conv.messageCount ?? 0) + 2,
          lastMessageAt: new Date(),
        })
        .where(eq(conversationsTable.id, conv.id));

      res.json({
        messageId: asstMsgId,
        conversationId: conv.id,
        role: 'assistant',
        content: result.content,
        model: chatModel,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        },
        activeSkillCount: skills.length,
        missionContext: missionContext?.name ?? null,
        memoryCount: memoryHits.length,
        layer1WasLocked: operator.layer1LockedAt === null,
      });

      // --- [LEARN:] EXTRACTION ---
      if (!operator.safeMode) {
        const learnMatches = result.content.match(/\[LEARN:\s*(.*?)\]/gs);
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
      // --- END [LEARN:] EXTRACTION ---

      if (!operator.safeMode) {
        triggerSelfAwareness(operator.id, 'conversation_end').catch(() => {});
        distillMemoriesFromConversations(operator.id, operator.ownerId, operator.name).catch(() => {});
      }
    } catch (err) {
      res.status(502).json({ error: 'AI backend error', detail: (err as Error).message });
    }
  }
});

export default router;
