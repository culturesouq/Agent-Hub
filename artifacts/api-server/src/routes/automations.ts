import { Router, type IRouter } from "express";
import { eq, desc, and, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db, agentsTable, agentAutomationsTable, automationRunsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { executeAutomation } from "../services/agent-runner.js";

const router: IRouter = Router();

async function verifyAgentAccess(agentId: number): Promise<boolean> {
  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId));
  return !!agent;
}

function buildWebhookUrl(secret: string): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  const base = domain ? `https://${domain}` : "http://localhost:8080";
  return `${base}/api/webhooks/automation/${secret}`;
}

function serializeAutomation(a: typeof agentAutomationsTable.$inferSelect) {
  return {
    ...a,
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    webhookUrl: a.triggerType === "webhook" && a.webhookSecret
      ? buildWebhookUrl(a.webhookSecret)
      : null,
  };
}

router.get("/agents/:agentId/automations", requireAuth, async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  if (isNaN(agentId) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const automations = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.agentId, agentId))
    .orderBy(desc(agentAutomationsTable.createdAt));

  let lastRunStatusMap: Record<number, string> = {};
  if (automations.length > 0) {
    const ids = automations.map(a => a.id);
    const lastRuns = await db
      .select()
      .from(automationRunsTable)
      .where(inArray(automationRunsTable.automationId, ids))
      .orderBy(desc(automationRunsTable.triggeredAt));
    for (const run of lastRuns) {
      if (!(run.automationId in lastRunStatusMap)) {
        lastRunStatusMap[run.automationId] = run.status;
      }
    }
  }

  res.json(automations.map(a => ({
    ...serializeAutomation(a),
    lastRunStatus: lastRunStatusMap[a.id] ?? null,
  })));
});

router.post("/agents/:agentId/automations", requireAuth, async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  if (isNaN(agentId) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const body = req.body as {
    name: string;
    triggerType: "schedule" | "webhook";
    cronExpression?: string;
    prompt: string;
  };

  if (!body.name?.trim() || !body.prompt?.trim()) {
    res.status(400).json({ error: "name and prompt are required" });
    return;
  }

  const triggerType = body.triggerType || "schedule";

  if (triggerType === "schedule" && !body.cronExpression?.trim()) {
    res.status(400).json({ error: "cronExpression is required for schedule automations" });
    return;
  }

  const webhookSecret = triggerType === "webhook"
    ? randomBytes(24).toString("hex")
    : null;

  const [created] = await db
    .insert(agentAutomationsTable)
    .values({
      agentId,
      name: body.name.trim(),
      triggerType,
      cronExpression: triggerType === "schedule" ? (body.cronExpression?.trim() || null) : null,
      webhookSecret,
      prompt: body.prompt.trim(),
      isEnabled: true,
    })
    .returning();

  res.status(201).json(serializeAutomation(created));
});

router.patch("/agents/:agentId/automations/:id", requireAuth, async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const id = parseInt(req.params.id, 10);

  if (isNaN(agentId) || isNaN(id) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const body = req.body as {
    name?: string;
    cronExpression?: string;
    prompt?: string;
    isEnabled?: boolean;
  };

  const updates: Partial<typeof agentAutomationsTable.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.cronExpression !== undefined) updates.cronExpression = body.cronExpression;
  if (body.prompt !== undefined) updates.prompt = body.prompt.trim();
  if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled;

  const [updated] = await db
    .update(agentAutomationsTable)
    .set(updates)
    .where(and(eq(agentAutomationsTable.id, id), eq(agentAutomationsTable.agentId, agentId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }

  res.json(serializeAutomation(updated));
});

router.delete("/agents/:agentId/automations/:id", requireAuth, async (req, res): Promise<void> => {
  const agentId = parseInt(req.params.agentId, 10);
  const id = parseInt(req.params.id, 10);

  if (isNaN(agentId) || isNaN(id) || !(await verifyAgentAccess(agentId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(agentAutomationsTable)
    .where(and(eq(agentAutomationsTable.id, id), eq(agentAutomationsTable.agentId, agentId)));

  res.sendStatus(204);
});

router.get("/automations/:id/runs", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [automation] = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.id, id));

  if (!automation || !(await verifyAgentAccess(automation.agentId))) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }

  const runs = await db
    .select()
    .from(automationRunsTable)
    .where(eq(automationRunsTable.automationId, id))
    .orderBy(desc(automationRunsTable.triggeredAt))
    .limit(50);

  res.json(runs.map(r => ({ ...r, triggeredAt: r.triggeredAt.toISOString() })));
});

router.post("/automations/:id/run", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [automation] = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.id, id));

  if (!automation || !(await verifyAgentAccess(automation.agentId))) {
    res.status(404).json({ error: "Automation not found" });
    return;
  }

  res.json({ triggered: true, automationId: id });
  executeAutomation(id).catch(console.error);
});

router.post("/webhooks/automation/:webhookSecret", async (req, res): Promise<void> => {
  const { webhookSecret } = req.params;

  const [automation] = await db
    .select()
    .from(agentAutomationsTable)
    .where(eq(agentAutomationsTable.webhookSecret, webhookSecret));

  if (!automation || automation.triggerType !== "webhook") {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  if (!automation.isEnabled) {
    res.status(403).json({ error: "Automation is disabled" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const contextVars: Record<string, string> = {};
  flattenObject(body, "body", contextVars);
  const resolvedPrompt = interpolatePrompt(automation.prompt, contextVars);

  res.json({ triggered: true, automationId: automation.id });
  executeAutomation(automation.id, resolvedPrompt).catch(console.error);
});

function flattenObject(obj: Record<string, unknown>, prefix: string, out: Record<string, string>): void {
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}.${k}`;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenObject(v as Record<string, unknown>, key, out);
    } else {
      out[key] = String(v ?? "");
    }
  }
}

function interpolatePrompt(prompt: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (p, [k, v]) => p.replace(new RegExp(`\\{\\{${k.replace(/\./g, "\\.")}\\}\\}`, "g"), v),
    prompt
  );
}

export default router;
