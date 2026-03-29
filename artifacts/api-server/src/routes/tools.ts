import { Router, type IRouter } from "express";
import { eq, asc, and } from "drizzle-orm";
import { db, agentToolsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAuth);

function validateWebhookUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "webhookUrl must use http or https protocol";
    }
    return null;
  } catch {
    return "webhookUrl must be a valid URL";
  }
}

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

  const sanitizedName = body.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
  if (!sanitizedName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sanitizedName)) {
    res.status(400).json({ error: "Tool name must start with a letter or underscore and contain only letters, numbers, or underscores" });
    return;
  }

  const urlError = validateWebhookUrl(body.webhookUrl);
  if (urlError) {
    res.status(400).json({ error: urlError });
    return;
  }

  if (body.parametersSchema !== undefined && body.parametersSchema !== null) {
    try {
      const parsed = JSON.parse(body.parametersSchema);
      if (!Array.isArray(parsed)) throw new Error("not an array");
    } catch {
      res.status(400).json({ error: "parametersSchema must be a valid JSON array" });
      return;
    }
  }

  const [tool] = await db
    .insert(agentToolsTable)
    .values({
      agentId,
      name: sanitizedName,
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
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(rawAgentId, 10);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const body = req.body as Partial<{
    name: string;
    description: string;
    parametersSchema: string;
    webhookUrl: string;
  }>;

  if (!body.name && !body.description && !body.parametersSchema && !body.webhookUrl) {
    res.status(400).json({ error: "At least one field must be provided for update" });
    return;
  }

  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const sanitized = body.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    if (!sanitized || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(sanitized)) {
      res.status(400).json({ error: "Tool name must start with a letter or underscore and contain only letters, numbers, or underscores" });
      return;
    }
    updateData.name = sanitized;
  }

  if (body.description !== undefined) updateData.description = body.description;

  if (body.parametersSchema !== undefined) {
    try {
      const parsed = JSON.parse(body.parametersSchema);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      updateData.parametersSchema = body.parametersSchema;
    } catch {
      res.status(400).json({ error: "parametersSchema must be a valid JSON array" });
      return;
    }
  }

  if (body.webhookUrl !== undefined) {
    const urlErr = validateWebhookUrl(body.webhookUrl);
    if (urlErr) {
      res.status(400).json({ error: urlErr });
      return;
    }
    updateData.webhookUrl = body.webhookUrl;
  }

  const [tool] = await db
    .update(agentToolsTable)
    .set(updateData)
    .where(and(eq(agentToolsTable.id, id), eq(agentToolsTable.agentId, agentId)))
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
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(rawAgentId, 10);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  await db.delete(agentToolsTable).where(and(eq(agentToolsTable.id, id), eq(agentToolsTable.agentId, agentId)));
  res.sendStatus(204);
});

export default router;
