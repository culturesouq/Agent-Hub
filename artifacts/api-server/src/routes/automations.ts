import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, agentsTable, agentAutomationsTable, activityTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { buildSystemPrompt } from "./chat";
import { openrouter } from "@workspace/integrations-openrouter-ai";
import { knowledgeTable, instructionsTable, agentMemoriesTable } from "@workspace/db";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/agents/:agentId/automations", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const automations = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.agentId, agentId))
    .orderBy(asc(agentAutomationsTable.createdAt));
  res.json(automations);
});

router.post("/agents/:agentId/automations", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const { name, description, triggerMessage, cronExpression } = req.body as {
    name: string;
    description?: string;
    triggerMessage: string;
    cronExpression: string;
  };

  if (!name || !triggerMessage || !cronExpression) {
    res.status(400).json({ error: "name, triggerMessage and cronExpression are required" });
    return;
  }

  const [automation] = await db
    .insert(agentAutomationsTable)
    .values({ agentId, name, description: description ?? null, triggerMessage, cronExpression })
    .returning();

  res.status(201).json(automation);
});

router.patch("/agents/:agentId/automations/:id", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const id = parseInt(req.params.id, 10);

  const [existing] = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.id, id));

  if (!existing || existing.agentId !== agentId) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }

  const { name, description, triggerMessage, cronExpression, isActive } = req.body as Partial<{
    name: string;
    description: string;
    triggerMessage: string;
    cronExpression: string;
    isActive: boolean;
  }>;

  const updates: Partial<typeof agentAutomationsTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (triggerMessage !== undefined) updates.triggerMessage = triggerMessage;
  if (cronExpression !== undefined) updates.cronExpression = cronExpression;
  if (isActive !== undefined) updates.isActive = isActive;

  const [updated] = await db
    .update(agentAutomationsTable)
    .set(updates)
    .where(eq(agentAutomationsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/agents/:agentId/automations/:id", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const id = parseInt(req.params.id, 10);

  const [existing] = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.id, id));

  if (!existing || existing.agentId !== agentId) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }

  await db.delete(agentAutomationsTable).where(eq(agentAutomationsTable.id, id));
  res.sendStatus(204);
});

router.post("/agents/:agentId/automations/:id/run", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const id = parseInt(req.params.id, 10);

  const [automation] = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.id, id));

  if (!automation || automation.agentId !== agentId) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

  const [knowledge, instructions, memories] = await Promise.all([
    db.select().from(knowledgeTable).where(eq(knowledgeTable.agentId, agentId)),
    db.select().from(instructionsTable).where(eq(instructionsTable.agentId, agentId)),
    db.select().from(agentMemoriesTable).where(eq(agentMemoriesTable.agentId, agentId)).orderBy(asc(agentMemoriesTable.createdAt)),
  ]);

  const systemPrompt = buildSystemPrompt({ ...agent, searchAvailable: false }, knowledge, instructions, memories);

  const completion = await openrouter.chat.completions.create({
    model: agent.model || "openai/gpt-4.1-mini",
    max_tokens: 2048,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: automation.triggerMessage },
    ],
  });

  const response = completion.choices[0]?.message?.content ?? "";

  await db.insert(activityTable).values({
    agentId,
    userMessage: `[AUTOMATION] ${automation.name}: ${automation.triggerMessage}`,
    agentResponse: response.slice(0, 2000),
  });

  await db
    .update(agentAutomationsTable)
    .set({ lastRunAt: new Date() })
    .where(eq(agentAutomationsTable.id, id));

  res.json({ response, ranAt: new Date().toISOString() });
});

export default router;
