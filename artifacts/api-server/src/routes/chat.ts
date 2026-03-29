import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, agentsTable, chatMessagesTable, knowledgeTable, instructionsTable, agentMemoriesTable } from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { requireAuth } from "../middlewares/auth";
import { braveWebSearch, formatSearchResultsForPrompt, type SearchResult } from "../services/search";

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

  const body = req.body as { message: string };
  if (!body.message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [knowledge, instructions, memories] = await Promise.all([
    db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agentId)),
    db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agentId)),
    db.select().from(agentMemoriesTable).where(eq(agentMemoriesTable.agentId, agentId)).orderBy(asc(agentMemoriesTable.createdAt)),
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
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const model = agent.model || "openai/gpt-4.1-mini";
  const webSearchEnabled = agent.webSearchEnabled;
  const hasBraveKey = !!process.env.BRAVE_SEARCH_API_KEY;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...chatHistory,
    { role: "user", content: body.message },
  ];

  const allSources: SearchResult[] = [];
  let searchContextMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];

  if (webSearchEnabled && hasBraveKey) {
    const probeCompletion = await openrouter.chat.completions.create({
      model,
      max_tokens: 512,
      messages: [
        ...messages,
        {
          role: "system",
          content: "ONLY output [SEARCH: <query>] tags if you need real-time or current information to answer. Output NOTHING else. If you can answer from existing knowledge, output: NO_SEARCH",
        },
      ],
    });

    const probeResponse = probeCompletion.choices[0]?.message?.content ?? "";
    const searchMatches = [...probeResponse.matchAll(/\[SEARCH:\s*([^\]]+)\]/gi)];

    if (searchMatches.length > 0) {
      res.write(`data: ${JSON.stringify({ searching: true })}\n\n`);

      const searchResults = await Promise.all(
        searchMatches.map(async (match) => {
          const query = match[1]?.trim() ?? "";
          const results = await braveWebSearch(query);
          allSources.push(...results);
          return formatSearchResultsForPrompt(query, results);
        })
      );

      const searchContext = searchResults.join("\n\n");
      searchContextMessages = [
        {
          role: "system",
          content: `The following are current web search results to help you answer the user's question. Use them to give accurate, up-to-date information:\n\n${searchContext}\n\nIMPORTANT: You now have the search results above. Answer the user's question directly using these results. Do NOT output any [SEARCH: ...] tags in your response.`,
        },
      ];
    }
  }

  const finalMessages: { role: "system" | "user" | "assistant"; content: string }[] = searchContextMessages.length > 0
    ? [messages[0], ...searchContextMessages, ...messages.slice(1)]
    : messages;

  let fullResponse = "";

  const stream = await openrouter.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: finalMessages,
    stream: true,
  });

  let streamBuffer = "";

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      streamBuffer += content;

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
  res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
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
    prompt += "\n\nWeb search capability: You have access to real-time web search. When a question requires current information, recent news, live data, pricing, or anything that may have changed after your training, signal a search using this exact format: [SEARCH: your search query]. You may include multiple search tags if needed. Do not mention to the user that you are performing a search — just use the search results naturally in your response. Only search when truly necessary; for general knowledge questions you can answer directly.";
  }

  prompt += "\n\nMemory instructions: If you learn something important about the user or context that you want to remember for future conversations, include it in your response using this exact format: [MEMORY: the fact to remember]. You can include multiple memory tags. Keep memories concise and factual. Do not mention that you are saving a memory to the user.";

  return prompt;
}

export default router;
