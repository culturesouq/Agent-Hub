import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, agentsTable, connectionsTable, knowledgeTable, instructionsTable, activityTable } from "@workspace/db";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { buildSystemPrompt } from "./chat";

const router: IRouter = Router();

router.post("/public/chat", async (req, res): Promise<void> => {
  const body = req.body as {
    apiKey: string;
    message: string;
    conversationHistory?: { role: "user" | "assistant"; content: string }[];
    userId?: string | null;
  };

  if (!body.apiKey || !body.message) {
    res.status(400).json({ error: "apiKey and message are required" });
    return;
  }

  const [connection] = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.apiKey, body.apiKey));

  if (!connection) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, connection.agentId));
  if (!agent || !agent.isActive) {
    res.status(404).json({ error: "Agent not found or inactive" });
    return;
  }

  const knowledge = await db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agent.id));
  const instructions = await db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agent.id));

  const systemPrompt = buildSystemPrompt(agent, knowledge, instructions);

  const history = (body.conversationHistory || []).slice(-20).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const model = agent.model || "openai/gpt-4.1-mini";

  const completion = await openrouter.chat.completions.create({
    model,
    max_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: body.message },
    ],
  });

  const responseText = completion.choices[0]?.message?.content || "";

  await db.update(connectionsTable)
    .set({
      requestCount: sql`${connectionsTable.requestCount} + 1`,
      lastUsed: new Date(),
    })
    .where(eq(connectionsTable.id, connection.id));

  await db.update(agentsTable).set({ lastActivity: new Date() }).where(eq(agentsTable.id, agent.id));

  await db.insert(activityTable).values({
    agentId: agent.id,
    connectionId: connection.id,
    appName: connection.appName,
    userMessage: body.message,
    agentResponse: responseText,
  });

  res.json({ response: responseText, agentName: agent.name });
});

export default router;
