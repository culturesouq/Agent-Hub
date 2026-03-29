import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, activityTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents/:agentId/activity", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const entries = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.agentId, agentId))
    .orderBy(desc(activityTable.createdAt))
    .limit(100);

  res.json(entries.map(e => ({
    ...e,
    connectionId: e.connectionId ?? null,
    appName: e.appName ?? null,
    createdAt: e.createdAt.toISOString(),
  })));
});

export default router;
