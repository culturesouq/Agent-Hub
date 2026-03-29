import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, instructionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents/:agentId/instructions", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const instructions = await db
    .select()
    .from(instructionsTable)
    .where(eq(instructionsTable.agentId, agentId))
    .orderBy(instructionsTable.createdAt);

  res.json(instructions.map(i => ({
    ...i,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  })));
});

router.post("/agents/:agentId/instructions", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const body = req.body as { content: string };
  if (!body.content) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const [instruction] = await db
    .insert(instructionsTable)
    .values({ agentId, content: body.content })
    .returning();

  res.status(201).json({
    ...instruction,
    createdAt: instruction.createdAt.toISOString(),
    updatedAt: instruction.updatedAt.toISOString(),
  });
});

router.patch("/agents/:agentId/instructions/:id", async (req, res): Promise<void> => {
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(rawAgentId, 10);
  const id = parseInt(rawId, 10);

  const body = req.body as { content: string };

  const [instruction] = await db
    .update(instructionsTable)
    .set({ content: body.content })
    .where(and(eq(instructionsTable.id, id), eq(instructionsTable.agentId, agentId)))
    .returning();

  if (!instruction) {
    res.status(404).json({ error: "Instruction not found" });
    return;
  }

  res.json({
    ...instruction,
    createdAt: instruction.createdAt.toISOString(),
    updatedAt: instruction.updatedAt.toISOString(),
  });
});

router.delete("/agents/:agentId/instructions/:id", async (req, res): Promise<void> => {
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(rawAgentId, 10);
  const id = parseInt(rawId, 10);

  await db
    .delete(instructionsTable)
    .where(and(eq(instructionsTable.id, id), eq(instructionsTable.agentId, agentId)));

  res.sendStatus(204);
});

export default router;
