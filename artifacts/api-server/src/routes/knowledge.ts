import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, knowledgeTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router({ mergeParams: true });

router.use(requireAuth);

router.get("/agents/:agentId/knowledge", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const entries = await db
    .select()
    .from(knowledgeTable)
    .where(eq(knowledgeTable.agentId, agentId))
    .orderBy(knowledgeTable.createdAt);

  res.json(entries.map(e => ({
    ...e,
    title: e.title ?? null,
    sourceUrl: e.sourceUrl ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  })));
});

router.post("/agents/:agentId/knowledge", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const body = req.body as { type: string; title?: string | null; content: string; sourceUrl?: string | null };

  if (!body.content) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const [entry] = await db
    .insert(knowledgeTable)
    .values({
      agentId,
      type: body.type || "text",
      title: body.title ?? null,
      content: body.content,
      sourceUrl: body.sourceUrl ?? null,
    })
    .returning();

  res.status(201).json({
    ...entry,
    title: entry.title ?? null,
    sourceUrl: entry.sourceUrl ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
});

router.patch("/agents/:agentId/knowledge/:id", async (req, res): Promise<void> => {
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(rawAgentId, 10);
  const id = parseInt(rawId, 10);

  const body = req.body as { title?: string | null; content?: string; sourceUrl?: string | null };
  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.sourceUrl !== undefined) updateData.sourceUrl = body.sourceUrl;

  const [entry] = await db
    .update(knowledgeTable)
    .set(updateData)
    .where(and(eq(knowledgeTable.id, id), eq(knowledgeTable.agentId, agentId)))
    .returning();

  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }

  res.json({
    ...entry,
    title: entry.title ?? null,
    sourceUrl: entry.sourceUrl ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  });
});

router.delete("/agents/:agentId/knowledge/:id", async (req, res): Promise<void> => {
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(rawAgentId, 10);
  const id = parseInt(rawId, 10);

  await db
    .delete(knowledgeTable)
    .where(and(eq(knowledgeTable.id, id), eq(knowledgeTable.agentId, agentId)));

  res.sendStatus(204);
});

export default router;
