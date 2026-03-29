import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, agentIntegrationsTable, agentsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  INTEGRATION_CATALOG,
  testIntegrationConnection,
} from "../services/integrations-catalog.js";
import { isServiceConnected, OAUTH_SERVICE_MAP, API_KEY_SERVICES } from "../services/token-resolver.js";
import { OAUTH_PROVIDERS } from "../services/oauth-providers.js";

const router: IRouter = Router();

router.use(requireAuth);

async function verifyAgentAccess(agentId: number): Promise<boolean> {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  return !!agent;
}

router.get("/agents/:agentId/integrations/catalog", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  if (isNaN(agentId) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const enabled = await db
    .select()
    .from(agentIntegrationsTable)
    .where(and(eq(agentIntegrationsTable.agentId, agentId), eq(agentIntegrationsTable.isEnabled, true)));

  const enabledSet = new Set(enabled.map(e => e.serviceId));

  const catalog = await Promise.all(
    INTEGRATION_CATALOG.map(async def => {
      const { connected, accountLabel } = await isServiceConnected(def.id);
      const oauthProviderId = OAUTH_SERVICE_MAP[def.id];
      const oauthProvider = oauthProviderId ? OAUTH_PROVIDERS[oauthProviderId] : undefined;
      const oauthReady = oauthProviderId
        ? !!(process.env[oauthProvider?.clientIdEnvVar || ""])
        : false;

      return {
        id: def.id,
        displayName: def.displayName,
        category: def.category,
        description: def.description,
        icon: def.icon,
        authType: def.authType,
        oauthProvider: oauthProviderId ?? null,
        oauthReady,
        envVar: def.envVar,
        envVarLabel: def.envVarLabel,
        apiKeyLabel: def.apiKeyLabel ?? null,
        setupNote: def.setupNote,
        toolNames: def.tools.map(t => t.name),
        toolCount: def.tools.length,
        available: connected,
        connected,
        accountLabel: accountLabel ?? null,
        enabled: enabledSet.has(def.id),
      };
    })
  );

  res.json(catalog);
});

router.post("/agents/:agentId/integrations/:serviceId/enable", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const serviceId = req.params.serviceId;

  if (isNaN(agentId) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

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

  if (isNaN(agentId) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  await db
    .update(agentIntegrationsTable)
    .set({ isEnabled: false })
    .where(and(eq(agentIntegrationsTable.agentId, agentId), eq(agentIntegrationsTable.serviceId, serviceId)));

  res.json({ enabled: false, serviceId });
});

router.post("/agents/:agentId/integrations/:serviceId/test", async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const serviceId = req.params.serviceId;

  if (isNaN(agentId) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const result = await testIntegrationConnection(serviceId);
  res.json({ ok: result.success, message: result.message });
});

export default router;
