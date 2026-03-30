import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, agentsTable, agentGrowthLogTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/agents/:agentId/growth", async (req, res): Promise<void> => {
  const agentId = parseInt(Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId, 10);
  const rows = await db
    .select()
    .from(agentGrowthLogTable)
    .where(eq(agentGrowthLogTable.agentId, agentId))
    .orderBy(asc(agentGrowthLogTable.appliedAt));
  res.json(rows.map(r => ({ ...r, appliedAt: r.appliedAt.toISOString() })));
});

router.post("/agents/:agentId/growth/:id/revert", async (req, res): Promise<void> => {
  const agentId = parseInt(Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId, 10);
  const entryId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [entry] = await db
    .select()
    .from(agentGrowthLogTable)
    .where(eq(agentGrowthLogTable.id, entryId));

  if (!entry || entry.agentId !== agentId) {
    res.status(404).json({ error: "Growth entry not found" });
    return;
  }

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const fieldMap: Record<string, keyof typeof agent> = {
    backstory: "backstory",
    personality: "personality",
  };

  const col = fieldMap[entry.field];
  if (!col) {
    res.status(400).json({ error: "Invalid field" });
    return;
  }

  const currentValue = agent[col] as string | null;
  await db.update(agentsTable).set({ [col]: entry.oldValue ?? null }).where(eq(agentsTable.id, agentId));

  await db.insert(agentGrowthLogTable).values({
    agentId,
    field: entry.field,
    oldValue: currentValue,
    newValue: entry.oldValue ?? "",
  });

  res.json({ success: true });
});

export default router;
