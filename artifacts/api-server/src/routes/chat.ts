import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, agentsTable, chatMessagesTable, knowledgeTable, instructionsTable, agentMemoriesTable } from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { requireAuth } from "../middlewares/auth";

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

  const systemPrompt = buildSystemPrompt(agent, knowledge, instructions, memories);

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

  let fullResponse = "";

  const model = agent.model || "openai/gpt-4.1-mini";

  const stream = await openrouter.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      { role: "user", content: body.message },
    ],
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
    const cleaned = streamBuffer.replace(/\[MEMORY:[^\]]*\]/gi, "").trim();
    if (cleaned) {
      res.write(`data: ${JSON.stringify({ content: cleaned })}\n\n`);
    }
  }

  const memoryRegex = /\[MEMORY:\s*([^\]]+)\]/gi;
  const memoryMatches = [...fullResponse.matchAll(memoryRegex)];
  const cleanedResponse = fullResponse.replace(/\[MEMORY:[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();

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

  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

router.delete("/agents/:agentId/chat", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.agentId, agentId));
  res.sendStatus(204);
});

function extractSafeContent(buffer: string): { safe: string; remaining: string } {
  const memoryRegex = /\[MEMORY:[^\]]*\]/gi;

  const bracketIdx = buffer.lastIndexOf("[");
  if (bracketIdx === -1) {
    return { safe: buffer.replace(memoryRegex, ""), remaining: "" };
  }

  const fromBracket = buffer.slice(bracketIdx);

  const looksLikeMemoryStart = "[MEMORY:".startsWith(fromBracket.toUpperCase()) || fromBracket.toUpperCase().startsWith("[MEMORY:");

  if (!looksLikeMemoryStart) {
    return { safe: buffer.replace(memoryRegex, ""), remaining: "" };
  }

  const completeTagMatch = fromBracket.match(/^\[MEMORY:[^\]]*\]/i);
  if (completeTagMatch) {
    const safePrefix = buffer.slice(0, bracketIdx).replace(memoryRegex, "");
    const after = buffer.slice(bracketIdx + completeTagMatch[0].length);
    const { safe: restSafe, remaining: restRemaining } = extractSafeContent(after);
    return { safe: safePrefix + restSafe, remaining: restRemaining };
  }

  const safePrefix = buffer.slice(0, bracketIdx).replace(memoryRegex, "");
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

  prompt += "\n\nMemory instructions: If you learn something important about the user or context that you want to remember for future conversations, include it in your response using this exact format: [MEMORY: the fact to remember]. You can include multiple memory tags. Keep memories concise and factual. Do not mention that you are saving a memory to the user.";

  return prompt;
}

export default router;
