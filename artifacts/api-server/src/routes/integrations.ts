import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentIntegrationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { INTEGRATION_CATALOG, isIntegrationAvailable } from "../services/integrations-catalog";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents/:agentId/integrations/catalog", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);

  const enabled = await db
    .select()
    .from(agentIntegrationsTable)
    .where(and(eq(agentIntegrationsTable.agentId, agentId), eq(agentIntegrationsTable.isEnabled, true)));

  const enabledSet = new Set(enabled.map(e => e.serviceId));

  const catalog = INTEGRATION_CATALOG.map(def => ({
    id: def.id,
    displayName: def.displayName,
    category: def.category,
    description: def.description,
    icon: def.icon,
    envVar: def.envVar,
    envVarLabel: def.envVarLabel,
    setupNote: def.setupNote,
    toolNames: def.tools.map(t => t.name),
    toolCount: def.tools.length,
    available: isIntegrationAvailable(def.id),
    enabled: enabledSet.has(def.id),
  }));

  res.json(catalog);
});

router.post("/agents/:agentId/integrations/:serviceId/enable", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const serviceId = req.params.serviceId;

  const def = INTEGRATION_CATALOG.find(i => i.id === serviceId);
  if (!def) {
    res.status(404).json({ error: `Unknown integration: ${serviceId}` });
    return;
  }

  await db
    .insert(agentIntegrationsTable)
    .values({ agentId, serviceId, isEnabled: true })
    .onConflictDoUpdate({
      target: [agentIntegrationsTable.agentId, agentIntegrationsTable.serviceId],
      set: { isEnabled: true },
    });

  res.json({ enabled: true, serviceId });
});

router.post("/agents/:agentId/integrations/:serviceId/disable", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const serviceId = req.params.serviceId;

  await db
    .update(agentIntegrationsTable)
    .set({ isEnabled: false })
    .where(and(eq(agentIntegrationsTable.agentId, agentId), eq(agentIntegrationsTable.serviceId, serviceId)));

  res.json({ enabled: false, serviceId });
});

router.post("/agents/:agentId/integrations/:serviceId/test", async (req, res): Promise<void> => {
  const serviceId = req.params.serviceId;
  const def = INTEGRATION_CATALOG.find(i => i.id === serviceId);

  if (!def) {
    res.status(404).json({ ok: false, error: `Unknown integration: ${serviceId}` });
    return;
  }

  const available = isIntegrationAvailable(serviceId);
  if (!available) {
    res.json({ ok: false, error: `${def.envVar} environment variable is not set. ${def.setupNote}` });
    return;
  }

  res.json({ ok: true, message: `${def.displayName} credentials are configured and ready` });
});

export default router;
