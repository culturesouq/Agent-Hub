import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, connectionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents/:agentId/connections", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const connections = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.agentId, agentId))
    .orderBy(connectionsTable.createdAt);

  res.json(connections.map(c => ({
    ...c,
    lastUsed: c.lastUsed?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/agents/:agentId/connections", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const body = req.body as { appName: string };
  if (!body.appName) {
    res.status(400).json({ error: "App name is required" });
    return;
  }

  const apiKey = `ahub_${randomBytes(24).toString("hex")}`;

  const [connection] = await db
    .insert(connectionsTable)
    .values({
      agentId,
      appName: body.appName,
      apiKey,
      requestCount: 0,
    })
    .returning();

  res.status(201).json({
    ...connection,
    lastUsed: connection.lastUsed?.toISOString() ?? null,
    createdAt: connection.createdAt.toISOString(),
  });
});

router.delete("/agents/:agentId/connections/:id", async (req, res): Promise<void> => {
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(rawAgentId, 10);
  const id = parseInt(rawId, 10);

  await db
    .delete(connectionsTable)
    .where(and(eq(connectionsTable.id, id), eq(connectionsTable.agentId, agentId)));

  res.sendStatus(204);
});

export default router;
