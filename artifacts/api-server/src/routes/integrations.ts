import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentIntegrationsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  INTEGRATION_CATALOG,
  isIntegrationAvailable,
  testIntegrationConnection,
} from "../services/integrations-catalog.js";
import { isReplitConnectorAvailable } from "../services/connector-token.js";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/agents/:agentId/integrations/catalog", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);

  const enabled = await db
    .select()
    .from(agentIntegrationsTable)
    .where(and(eq(agentIntegrationsTable.agentId, agentId), eq(agentIntegrationsTable.isEnabled, true)));

  const enabledSet = new Set(enabled.map(e => e.serviceId));

  const catalog = await Promise.all(INTEGRATION_CATALOG.map(async def => ({
    id: def.id,
    displayName: def.displayName,
    category: def.category,
    description: def.description,
    icon: def.icon,
    authType: def.authType,
    replitConnectorId: def.replitConnectorId,
    envVar: def.envVar,
    envVarLabel: def.envVarLabel,
    setupNote: def.setupNote,
    toolNames: def.tools.map(t => t.name),
    toolCount: def.tools.length,
    available: await isIntegrationAvailable(def.id),
    enabled: enabledSet.has(def.id),
    replitConnectorInfraAvailable: isReplitConnectorAvailable(),
  })));

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
    .values({
      agentId,
      serviceId,
      isEnabled: true,
      connectorConfigId: def.replitConnectorId ?? null,
      authType: def.authType,
      credentialKey: def.envVar ?? null,
    })
    .onConflictDoUpdate({
      target: [agentIntegrationsTable.agentId, agentIntegrationsTable.serviceId],
      set: {
        isEnabled: true,
        connectorConfigId: def.replitConnectorId ?? null,
        authType: def.authType,
        credentialKey: def.envVar ?? null,
      },
    });

  res.json({ enabled: true, serviceId, authType: def.authType, connectorConfigId: def.replitConnectorId });
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

  const result = await testIntegrationConnection(serviceId);
  res.json({ ok: result.success, message: result.message });
});

export default router;
