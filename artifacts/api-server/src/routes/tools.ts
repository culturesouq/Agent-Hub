import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, agentToolsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents/:agentId/tools", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const tools = await db
    .select()
    .from(agentToolsTable)
    .where(eq(agentToolsTable.agentId, agentId))
    .orderBy(asc(agentToolsTable.createdAt));

  res.json(tools.map(t => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  })));
});

router.post("/agents/:agentId/tools", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const body = req.body as {
    name: string;
    description: string;
    parametersSchema?: string;
    webhookUrl: string;
  };

  if (!body.name || !body.description || !body.webhookUrl) {
    res.status(400).json({ error: "name, description, and webhookUrl are required" });
    return;
  }

  const [tool] = await db
    .insert(agentToolsTable)
    .values({
      agentId,
      name: body.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, ""),
      description: body.description,
      parametersSchema: body.parametersSchema ?? "[]",
      webhookUrl: body.webhookUrl,
    })
    .returning();

  res.status(201).json({
    ...tool,
    createdAt: tool.createdAt.toISOString(),
    updatedAt: tool.updatedAt.toISOString(),
  });
});

router.patch("/agents/:agentId/tools/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const body = req.body as Partial<{
    name: string;
    description: string;
    parametersSchema: string;
    webhookUrl: string;
  }>;

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  if (body.description !== undefined) updateData.description = body.description;
  if (body.parametersSchema !== undefined) updateData.parametersSchema = body.parametersSchema;
  if (body.webhookUrl !== undefined) updateData.webhookUrl = body.webhookUrl;

  const [tool] = await db
    .update(agentToolsTable)
    .set(updateData)
    .where(eq(agentToolsTable.id, id))
    .returning();

  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }

  res.json({
    ...tool,
    createdAt: tool.createdAt.toISOString(),
    updatedAt: tool.updatedAt.toISOString(),
  });
});

router.delete("/agents/:agentId/tools/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  await db.delete(agentToolsTable).where(eq(agentToolsTable.id, id));
  res.sendStatus(204);
});

export default router;
