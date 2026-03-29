import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, agentsTable, chatMessagesTable, knowledgeTable, instructionsTable, agentMemoriesTable, agentToolsTable, activityTable } from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { requireAuth } from "../middlewares/auth";
import { braveWebSearch, formatSearchResultsForPrompt, type SearchResult } from "../services/search";
import { buildOpenAITools, callToolWebhook, type OpenAITool } from "../services/tools";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents/:agentId/chat", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.agentId, agentId))
    .orderBy(asc(chatMessagesTable.createdAt));

  res.json(messages.map(m => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/agents/:agentId/chat", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const body = req.body as { message: string; imageUrl?: string };
  if (!body.message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }
  const imageUrl = body.imageUrl || null;

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [knowledge, instructions, memories, agentTools] = await Promise.all([
    db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agentId)),
    db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agentId)),
    db.select().from(agentMemoriesTable).where(eq(agentMemoriesTable.agentId, agentId)).orderBy(asc(agentMemoriesTable.createdAt)),
    db.select().from(agentToolsTable).where(eq(agentToolsTable.agentId, agentId)).orderBy(asc(agentToolsTable.createdAt)),
  ]);

  const systemPrompt = buildSystemPrompt(
    { ...agent, searchAvailable: !!process.env.BRAVE_SEARCH_API_KEY },
    knowledge, instructions, memories
  );

  const history = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.agentId, agentId))
    .orderBy(asc(chatMessagesTable.createdAt));

  const chatHistory = history.slice(-20).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  await db.insert(chatMessagesTable).values({
    agentId,
    role: "user",
    content: body.message,
  });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders();

  const model = agent.model || "openai/gpt-4.1-mini";
  const webSearchEnabled = agent.webSearchEnabled;
  const hasBraveKey = !!process.env.BRAVE_SEARCH_API_KEY;

  const openAITools = buildOpenAITools(agentTools);

  if (webSearchEnabled && hasBraveKey) {
    openAITools.push({
      type: "function",
      function: {
        name: "web_search",
        description: "Search the internet for information. USE THIS SPARINGLY — only when the user explicitly asks to search the web, or when the question is about live/real-time data (today's news, live prices, current weather, very recent events) that you genuinely cannot answer from your training. Do NOT use this for general questions, advice, historical facts, coding, or anything your training covers. Prefer answering from your own knowledge first.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The specific search query" },
          },
          required: ["query"],
        },
      },
    });
  }

  type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string | unknown[]; tool_call_id?: string; tool_calls?: unknown[] };

  const userContent: string | unknown[] = imageUrl
    ? [
        { type: "text", text: body.message },
        { type: "image_url", image_url: { url: imageUrl } },
      ]
    : body.message;

  const messages: Msg[] = [
    { role: "system", content: systemPrompt },
    ...chatHistory,
    { role: "user", content: userContent },
  ];

  const allSources: SearchResult[] = [];
  const finalMessages: Msg[] = messages;

  const usedTools: string[] = [];
  const MAX_TOOL_ITERATIONS = 5;
  let toolIterations = 0;

  const callParams: Parameters<typeof openrouter.chat.completions.create>[0] = {
    model,
    max_tokens: 8192,
    messages: finalMessages as Parameters<typeof openrouter.chat.completions.create>[0]["messages"],
    stream: true,
    ...(openAITools.length > 0 ? { tools: openAITools as Parameters<typeof openrouter.chat.completions.create>[0]["tools"], tool_choice: "auto" as const } : {}),
  };

  let fullResponse = "";

  const runStream = async (callMessages: Parameters<typeof openrouter.chat.completions.create>[0]["messages"]): Promise<void> => {
    const stream = await openrouter.chat.completions.create({
      ...callParams,
      messages: callMessages,
    });

    let streamBuffer = "";
    let finishReason: string | null | undefined = null;
    const pendingToolCalls: { id: string; name: string; argsRaw: string }[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      finishReason = chunk.choices[0]?.finish_reason;

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!pendingToolCalls[idx]) {
            pendingToolCalls[idx] = { id: tc.id ?? "", name: tc.function?.name ?? "", argsRaw: "" };
          }
          if (tc.function?.arguments) {
            pendingToolCalls[idx].argsRaw += tc.function.arguments;
          }
          if (tc.id) pendingToolCalls[idx].id = tc.id;
          if (tc.function?.name) pendingToolCalls[idx].name = tc.function.name;
        }
      }

      if (delta?.content) {
        fullResponse += delta.content;
        streamBuffer += delta.content;

        const { safe, remaining } = extractSafeContent(streamBuffer);
        streamBuffer = remaining;

        if (safe) {
          res.write(`data: ${JSON.stringify({ content: safe })}\n\n`);
        }
      }
    }

    if (streamBuffer) {
      const cleaned = streamBuffer
        .replace(/\[MEMORY:[^\]]*\]/gi, "")
        .replace(/\[SEARCH:[^\]]*\]/gi, "")
        .trim();
      if (cleaned) {
        res.write(`data: ${JSON.stringify({ content: cleaned })}\n\n`);
      }
    }

    if (finishReason === "tool_calls" && pendingToolCalls.length > 0 && toolIterations < MAX_TOOL_ITERATIONS) {
      toolIterations++;
      const toolCallObjects = pendingToolCalls.map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.argsRaw },
      }));

      const assistantMsg: Parameters<typeof openrouter.chat.completions.create>[0]["messages"][number] = {
        role: "assistant" as const,
        content: null,
        tool_calls: toolCallObjects,
      };

      const toolResultMsgs: Parameters<typeof openrouter.chat.completions.create>[0]["messages"] = [];

      const hasWebSearch = pendingToolCalls.some(tc => tc.name === "web_search");
      const userTools = pendingToolCalls.filter(tc => tc.name !== "web_search");
      if (hasWebSearch) {
        res.write(`data: ${JSON.stringify({ searching: true })}\n\n`);
      }
      if (userTools.length > 0) {
        res.write(`data: ${JSON.stringify({ toolCalls: userTools.map(tc => tc.name) })}\n\n`);
      }

      for (const tc of pendingToolCalls) {
        const toolDef = agentTools.find(t => t.name === tc.name);
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.argsRaw); } catch { args = {}; }

        let result: string;

        if (tc.name === "web_search") {
          const query = (args.query as string) || "";
          if (query) {
            try {
              const searchResults = await braveWebSearch(query);
              allSources.push(...searchResults);
              result = formatSearchResultsForPrompt(query, searchResults);
            } catch {
              result = JSON.stringify({ error: "Search failed" });
            }
          } else {
            result = JSON.stringify({ error: "No query provided" });
          }
        } else if (toolDef) {
          result = await callToolWebhook(toolDef.webhookUrl, tc.name, args);
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${tc.name}` });
        }

        usedTools.push(tc.name);

        await db.insert(activityTable).values({
          agentId,
          userMessage: `[TOOL_CALL] ${tc.name} args:${JSON.stringify(args).slice(0, 500)}`,
          agentResponse: result.slice(0, 2000),
        });

        toolResultMsgs.push({
          role: "tool" as const,
          tool_call_id: tc.id,
          content: result,
        });
      }

      const nextMessages = [...callMessages, assistantMsg, ...toolResultMsgs];
      await runStream(nextMessages as Parameters<typeof openrouter.chat.completions.create>[0]["messages"]);
    }
  };

  await runStream(finalMessages as Parameters<typeof openrouter.chat.completions.create>[0]["messages"]);

  const memoryRegex = /\[MEMORY:\s*([^\]]+)\]/gi;
  const memoryMatches = [...fullResponse.matchAll(memoryRegex)];
  const cleanedResponse = fullResponse
    .replace(/\[MEMORY:[^\]]*\]/gi, "")
    .replace(/\[SEARCH:[^\]]*\]/gi, "")
    .trim();

  for (const match of memoryMatches) {
    const memContent = match[1]?.trim();
    if (memContent) {
      await db.insert(agentMemoriesTable).values({ agentId, content: memContent });
    }
  }

  await db.insert(chatMessagesTable).values({
    agentId,
    role: "assistant",
    content: cleanedResponse,
  });

  await db.update(agentsTable).set({ lastActivity: new Date() }).where(eq(agentsTable.id, agentId));

  const seenUrls = new Set<string>();
  const sources = allSources
    .map(s => ({ title: s.title, url: s.url }))
    .filter(s => { if (seenUrls.has(s.url)) return false; seenUrls.add(s.url); return true; });
  const uniqueUsedTools = [...new Set(usedTools)].filter(t => t !== "web_search");
  res.write(`data: ${JSON.stringify({ done: true, sources, usedTools: uniqueUsedTools })}\n\n`);
  res.end();
});

router.delete("/agents/:agentId/chat", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.agentId, agentId));
  res.sendStatus(204);
});

const STRIP_TAGS_REGEX = /\[(?:MEMORY|SEARCH):[^\]]*\]/gi;

function looksLikeTagStart(str: string): boolean {
  const upper = str.toUpperCase();
  return (
    "[MEMORY:".startsWith(upper) ||
    upper.startsWith("[MEMORY:") ||
    "[SEARCH:".startsWith(upper) ||
    upper.startsWith("[SEARCH:")
  );
}

function extractSafeContent(buffer: string): { safe: string; remaining: string } {
  const bracketIdx = buffer.lastIndexOf("[");
  if (bracketIdx === -1) {
    return { safe: buffer.replace(STRIP_TAGS_REGEX, ""), remaining: "" };
  }

  const fromBracket = buffer.slice(bracketIdx);

  if (!looksLikeTagStart(fromBracket)) {
    return { safe: buffer.replace(STRIP_TAGS_REGEX, ""), remaining: "" };
  }

  const completeTagMatch = fromBracket.match(/^\[(?:MEMORY|SEARCH):[^\]]*\]/i);
  if (completeTagMatch) {
    const safePrefix = buffer.slice(0, bracketIdx).replace(STRIP_TAGS_REGEX, "");
    const after = buffer.slice(bracketIdx + completeTagMatch[0].length);
    const { safe: restSafe, remaining: restRemaining } = extractSafeContent(after);
    return { safe: safePrefix + restSafe, remaining: restRemaining };
  }

  const safePrefix = buffer.slice(0, bracketIdx).replace(STRIP_TAGS_REGEX, "");
  return { safe: safePrefix, remaining: fromBracket };
}

export function buildSystemPrompt(
  agent: {
    name: string;
    backstory?: string | null;
    personality?: string | null;
    coreValues?: string | null;
    expertiseAreas?: string | null;
    communicationStyle?: string | null;
    emotionalIntelligence?: string | null;
    language: string;
    webSearchEnabled?: boolean;
    searchAvailable?: boolean;
  },
  knowledge: { type: string; title?: string | null; content: string }[],
  instructions: { content: string }[],
  memories?: { content: string }[]
): string {
  let prompt = `You are ${agent.name}, an AI agent.`;

  if (agent.backstory) prompt += `\n\nBackstory and Origin:\n${agent.backstory}`;
  if (agent.personality) prompt += `\n\nPersonality:\n${agent.personality}`;
  if (agent.coreValues) prompt += `\n\nCore Values:\n${agent.coreValues}`;
  if (agent.expertiseAreas) prompt += `\n\nExpertise Areas:\n${agent.expertiseAreas}`;
  if (agent.communicationStyle) prompt += `\n\nCommunication Style:\n${agent.communicationStyle}`;
  if (agent.emotionalIntelligence) prompt += `\n\nEmotional Intelligence Guidelines:\n${agent.emotionalIntelligence}`;

  if (agent.language === "arabic") {
    prompt += "\n\nAlways respond in Arabic.";
  } else if (agent.language === "both") {
    prompt += "\n\nYou can respond in both English and Arabic. Match the language the user uses.";
  }

  if (instructions.length > 0) {
    prompt += "\n\nPermanent Instructions (always follow these):\n";
    instructions.forEach((inst, i) => {
      prompt += `${i + 1}. ${inst.content}\n`;
    });
  }

  if (knowledge.length > 0) {
    prompt += "\n\nKnowledge Base:\n";
    knowledge.forEach(k => {
      if (k.title) prompt += `\n[${k.title}]\n${k.content}\n`;
      else prompt += `\n${k.content}\n`;
    });
  }

  if (memories && memories.length > 0) {
    prompt += "\n\nYour memories (facts you've remembered from past conversations):\n";
    memories.forEach((m, i) => {
      prompt += `${i + 1}. ${m.content}\n`;
    });
  }

  prompt += "\n\nNote: You are currently in a private conversation with the owner of this system. The owner is testing and refining your behavior.";

  if (agent.webSearchEnabled && agent.searchAvailable !== false) {
    prompt += "\n\nWeb search capability: You have a web_search tool available, but use it SPARINGLY — only as a last resort. Default to answering from your own knowledge. Only call web_search when ALL of the following are true: (1) the user is explicitly asking about something current/real-time (today's news, live prices, current weather, recent events), OR the user explicitly asks you to search the web, AND (2) you genuinely cannot give a useful answer from your training data. Do NOT search for: general knowledge, historical facts, how-to questions, advice, opinions, creative tasks, math, coding, or anything your training covers well. When you do search, do not mention to the user that you are doing so — just use the results naturally.";
  }

  prompt += "\n\nMemory instructions: If you learn something important about the user or context that you want to remember for future conversations, include it in your response using this exact format: [MEMORY: the fact to remember]. You can include multiple memory tags. Keep memories concise and factual. Do not mention that you are saving a memory to the user.";

  return prompt;
}

export default router;
