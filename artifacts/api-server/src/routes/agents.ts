import { Router, type IRouter } from "express";
import { eq, sql, count, asc } from "drizzle-orm";
import { db, agentsTable, connectionsTable, agentMemoriesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents", async (req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(agentsTable.createdAt);

  const result = await Promise.all(
    agents.map(async (agent) => {
      const [{ count: connectionsCount }] = await db
        .select({ count: count() })
        .from(connectionsTable)
        .where(eq(connectionsTable.agentId, agent.id));
      return {
        ...agent,
        avatarUrl: agent.avatarUrl ?? null,
        backstory: agent.backstory ?? null,
        personality: agent.personality ?? null,
        coreValues: agent.coreValues ?? null,
        expertiseAreas: agent.expertiseAreas ?? null,
        communicationStyle: agent.communicationStyle ?? null,
        emotionalIntelligence: agent.emotionalIntelligence ?? null,
        lastActivity: agent.lastActivity?.toISOString() ?? null,
        connectionsCount: Number(connectionsCount),
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.post("/agents", async (req, res): Promise<void> => {
  const body = req.body as {
    name: string;
    avatarUrl?: string | null;
    backstory?: string | null;
    personality?: string | null;
    coreValues?: string | null;
    expertiseAreas?: string | null;
    communicationStyle?: string | null;
    emotionalIntelligence?: string | null;
    language?: string;
    model?: string;
  };

  if (!body.name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const [agent] = await db
    .insert(agentsTable)
    .values({
      name: body.name,
      avatarUrl: body.avatarUrl ?? null,
      backstory: body.backstory ?? null,
      personality: body.personality ?? null,
      coreValues: body.coreValues ?? null,
      expertiseAreas: body.expertiseAreas ?? null,
      communicationStyle: body.communicationStyle ?? null,
      emotionalIntelligence: body.emotionalIntelligence ?? null,
      language: body.language ?? "english",
      model: body.model ?? "openai/gpt-4.1-mini",
    })
    .returning();

  res.status(201).json({
    ...agent,
    avatarUrl: agent.avatarUrl ?? null,
    backstory: agent.backstory ?? null,
    personality: agent.personality ?? null,
    coreValues: agent.coreValues ?? null,
    expertiseAreas: agent.expertiseAreas ?? null,
    communicationStyle: agent.communicationStyle ?? null,
    emotionalIntelligence: agent.emotionalIntelligence ?? null,
    lastActivity: agent.lastActivity?.toISOString() ?? null,
    connectionsCount: 0,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  });
});

router.get("/agents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [{ count: connectionsCount }] = await db
    .select({ count: count() })
    .from(connectionsTable)
    .where(eq(connectionsTable.agentId, id));

  res.json({
    ...agent,
    avatarUrl: agent.avatarUrl ?? null,
    backstory: agent.backstory ?? null,
    personality: agent.personality ?? null,
    coreValues: agent.coreValues ?? null,
    expertiseAreas: agent.expertiseAreas ?? null,
    communicationStyle: agent.communicationStyle ?? null,
    emotionalIntelligence: agent.emotionalIntelligence ?? null,
    lastActivity: agent.lastActivity?.toISOString() ?? null,
    connectionsCount: Number(connectionsCount),
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  });
});

router.patch("/agents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const body = req.body as Partial<{
    name: string;
    avatarUrl: string | null;
    backstory: string | null;
    personality: string | null;
    coreValues: string | null;
    expertiseAreas: string | null;
    communicationStyle: string | null;
    emotionalIntelligence: string | null;
    language: string;
    model: string;
    webSearchEnabled: boolean;
    voice: string;
    voiceSpeed: number;
    isActive: boolean;
  }>;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
  if (body.backstory !== undefined) updateData.backstory = body.backstory;
  if (body.personality !== undefined) updateData.personality = body.personality;
  if (body.coreValues !== undefined) updateData.coreValues = body.coreValues;
  if (body.expertiseAreas !== undefined) updateData.expertiseAreas = body.expertiseAreas;
  if (body.communicationStyle !== undefined) updateData.communicationStyle = body.communicationStyle;
  if (body.emotionalIntelligence !== undefined) updateData.emotionalIntelligence = body.emotionalIntelligence;
  if (body.language !== undefined) updateData.language = body.language;
  if (body.model !== undefined) updateData.model = body.model;
  if (body.webSearchEnabled !== undefined) updateData.webSearchEnabled = body.webSearchEnabled;
  if (body.voice !== undefined) updateData.voice = body.voice;
  if (body.voiceSpeed !== undefined) updateData.voiceSpeed = body.voiceSpeed;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const [agent] = await db
    .update(agentsTable)
    .set(updateData)
    .where(eq(agentsTable.id, id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [{ count: connectionsCount }] = await db
    .select({ count: count() })
    .from(connectionsTable)
    .where(eq(connectionsTable.agentId, id));

  res.json({
    ...agent,
    avatarUrl: agent.avatarUrl ?? null,
    backstory: agent.backstory ?? null,
    personality: agent.personality ?? null,
    coreValues: agent.coreValues ?? null,
    expertiseAreas: agent.expertiseAreas ?? null,
    communicationStyle: agent.communicationStyle ?? null,
    emotionalIntelligence: agent.emotionalIntelligence ?? null,
    lastActivity: agent.lastActivity?.toISOString() ?? null,
    connectionsCount: Number(connectionsCount),
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  });
});

router.delete("/agents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  await db.delete(agentsTable).where(eq(agentsTable.id, id));
  res.sendStatus(204);
});

router.post("/agents/:id/toggle-status", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [existing] = await db.select().from(agentsTable).where(eq(agentsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const [agent] = await db
    .update(agentsTable)
    .set({ isActive: !existing.isActive })
    .where(eq(agentsTable.id, id))
    .returning();

  const [{ count: connectionsCount }] = await db
    .select({ count: count() })
    .from(connectionsTable)
    .where(eq(connectionsTable.agentId, id));

  res.json({
    ...agent,
    avatarUrl: agent.avatarUrl ?? null,
    backstory: agent.backstory ?? null,
    personality: agent.personality ?? null,
    coreValues: agent.coreValues ?? null,
    expertiseAreas: agent.expertiseAreas ?? null,
    communicationStyle: agent.communicationStyle ?? null,
    emotionalIntelligence: agent.emotionalIntelligence ?? null,
    lastActivity: agent.lastActivity?.toISOString() ?? null,
    connectionsCount: Number(connectionsCount),
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  });
});

router.get("/agents/:id/memories", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(raw, 10);

  const memories = await db
    .select()
    .from(agentMemoriesTable)
    .where(eq(agentMemoriesTable.agentId, agentId))
    .orderBy(asc(agentMemoriesTable.createdAt));

  res.json(memories.map(m => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.delete("/memories/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  await db.delete(agentMemoriesTable).where(eq(agentMemoriesTable.id, id));
  res.sendStatus(204);
});

export default router;
