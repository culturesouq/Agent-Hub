import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, agentsTable, chatMessagesTable, knowledgeTable, instructionsTable } from "@workspace/db";
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

  const knowledge = await db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agentId));
  const instructions = await db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agentId));

  const systemPrompt = buildSystemPrompt(agent, knowledge, instructions);

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

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }

  await db.insert(chatMessagesTable).values({
    agentId,
    role: "assistant",
    content: fullResponse,
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
  instructions: { content: string }[]
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

  prompt += "\n\nNote: You are currently in a private conversation with the owner of this system. The owner is testing and refining your behavior.";

  return prompt;
}

export default router;
