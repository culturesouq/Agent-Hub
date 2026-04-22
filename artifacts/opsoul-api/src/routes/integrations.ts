import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '@workspace/db';
import { operatorIntegrationsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';
import { chatCompletion } from '../utils/openrouter.js';
import { autoRemoveIntegrationSkills } from '../utils/autoInstallIntegrationSkills.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

const CreateIntegrationSchema = z.object({
  integrationType: z.string().min(1).max(100),
  integrationLabel: z.string().min(1).max(200),
  token: z.string().min(1).max(4000).optional(),
  scopes: z.array(z.string().max(100)).max(50).optional(),
  contextsAssigned: z.array(z.string()).max(20).optional(),
  appSchema: z.record(z.unknown()).optional().refine(
    (v) => !v || JSON.stringify(v).length <= 4000,
    { message: 'appSchema too large (max 4000 chars)' }
  ),
});

const UpdateIntegrationSchema = z.object({
  integrationLabel: z.string().min(1).max(200).optional(),
  token: z.string().min(1).max(4000).optional(),
  scopes: z.array(z.string().max(100)).max(50).optional(),
  status: z.enum(['connected', 'disconnected', 'error']).optional(),
  contextsAssigned: z.array(z.string()).max(20).optional(),
  scopeUpdatePending: z.boolean().optional(),
  scopeUpdateSummary: z.string().max(500).optional(),
});

function safeSerialize(integration: typeof operatorIntegrationsTable.$inferSelect) {
  const { tokenEncrypted: _t, refreshTokenEncrypted: _r, ...safe } = integration;
  return { ...safe, hasToken: !!_t };
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = CreateIntegrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const tokenEncrypted = parsed.data.token
    ? encryptToken(parsed.data.token)
    : null;

  const [integration] = await db.insert(operatorIntegrationsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    integrationType: parsed.data.integrationType,
    integrationLabel: parsed.data.integrationLabel,
    tokenEncrypted,
    scopes: parsed.data.scopes ?? [],
    status: 'connected',
    scopeUpdatePending: false,
    contextsAssigned: parsed.data.contextsAssigned ?? [],
    appSchema: parsed.data.appSchema ?? null,
  }).returning();

  res.status(201).json(safeSerialize(integration));

  if (parsed.data.integrationType === 'telegram' && tokenEncrypted) {
    if (!process.env.API_BASE_URL) {
      console.warn('[integrations] API_BASE_URL not set — Telegram webhook not auto-registered');
    } else {
      const botToken = decryptToken(tokenEncrypted);
      const webhookUrl = `${process.env.API_BASE_URL}/webhooks/telegram/${operatorId}`;
      const webhookSecretToken = crypto.randomBytes(32).toString('hex');
      fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecretToken }),
      }).then(r => r.json()).then(async (data: unknown) => {
        const result = data as { ok?: boolean };
        if (!result.ok) {
          console.error(`[integrations] Telegram setWebhook failed for operator ${operatorId}:`, data);
          return;
        }
        console.log(`[integrations] Telegram webhook set for operator ${operatorId}:`, data);
        const existing = integration.appSchema as Record<string, unknown> | null;
        await db.update(operatorIntegrationsTable)
          .set({ appSchema: { ...(existing ?? {}), webhookSecretToken } })
          .where(eq(operatorIntegrationsTable.id, integration.id));
      }).catch((err: unknown) => {
        console.error(`[integrations] Telegram webhook registration failed for operator ${operatorId}:`, err);
      });
    }
  }

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const integrations = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.operatorId, operatorId),
        eq(operatorIntegrationsTable.ownerId, req.owner!.ownerId),
      ),
    );

  res.json({
    operatorId,
    count: integrations.length,
    integrations: integrations.map(safeSerialize),
  });
});

// ── Connect custom app ── must be before /:integrationId to avoid Express catching it as an ID
router.post('/connect-app', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const { baseUrl: rawBaseUrl, apiKey, label } = req.body as {
    baseUrl?: string;
    apiKey?: string;
    label?: string;
  };

  if (!rawBaseUrl || !apiKey) {
    res.status(400).json({ error: 'baseUrl and apiKey are required' });
    return;
  }

  const baseUrl = rawBaseUrl.trim().replace(/\/$/, '');

  let appSchema: Record<string, unknown> | null = null;
  const schemaPaths = ['/api/schema', '/api/entities', '/openapi.json', '/schema.json'];

  for (const path of schemaPaths) {
    try {
      const schemaRes = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (schemaRes.ok) {
        const raw = await schemaRes.json();
        const normalized = await chatCompletion(
          [
            {
              role: 'system',
              content: 'Normalize the following API schema into a JSON object with this shape: { "appName": string, "entities": [{ "name": string, "description": string, "fields": string[], "actions": string[] }] }. Return ONLY valid JSON, no markdown.',
            },
            { role: 'user', content: JSON.stringify(raw).slice(0, 4000) },
          ],
          'anthropic/claude-haiku-4-5',
        );
        try {
          appSchema = JSON.parse(normalized.content.trim().replace(/```json\n?|\n?```/g, ''));
        } catch { /* normalization failed */ }
        break;
      }
    } catch { /* try next path */ }
  }

  const tokenEncrypted = encryptToken(apiKey);

  let integrationLabel = label?.trim() || '';
  if (!integrationLabel) {
    try {
      integrationLabel = (appSchema as any)?.appName || new URL(baseUrl).hostname;
    } catch {
      integrationLabel = baseUrl;
    }
  }

  const [integration] = await db.insert(operatorIntegrationsTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    integrationType: 'custom_app',
    integrationLabel,
    tokenEncrypted,
    isCustomApp: true,
    baseUrl,
    appSchema: appSchema ?? null,
    status: 'connected',
    scopes: [],
    scopeUpdatePending: false,
    contextsAssigned: [],
  }).returning();

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});

  res.status(201).json({
    integration: safeSerialize(integration),
    schema: appSchema,
    message: appSchema
      ? `Connected to ${integrationLabel}. Schema found — I know what actions are available.`
      : `Connected to ${integrationLabel}. No schema found — I'll reason based on common API patterns.`,
  });
});

router.get('/:integrationId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [integration] = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.id, req.params.integrationId),
        eq(operatorIntegrationsTable.operatorId, operatorId),
      ),
    );

  if (!integration) { res.status(404).json({ error: 'Integration not found' }); return; }
  res.json(safeSerialize(integration));
});

router.patch('/:integrationId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const parsed = UpdateIntegrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select({ id: operatorIntegrationsTable.id })
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.id, req.params.integrationId),
        eq(operatorIntegrationsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }

  const { token, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (token) updates.tokenEncrypted = encryptToken(token);

  const [updated] = await db
    .update(operatorIntegrationsTable)
    .set(updates)
    .where(eq(operatorIntegrationsTable.id, req.params.integrationId))
    .returning();

  res.json(safeSerialize(updated));

  if (updated.integrationType === 'telegram' && updated.tokenEncrypted) {
    if (!process.env.API_BASE_URL) {
      console.warn('[integrations] API_BASE_URL not set — Telegram webhook not re-registered');
    } else {
      const botToken = decryptToken(updated.tokenEncrypted);
      const webhookUrl = `${process.env.API_BASE_URL}/webhooks/telegram/${operatorId}`;
      const webhookSecretToken = crypto.randomBytes(32).toString('hex');
      fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecretToken }),
      }).then(r => r.json()).then(async (data: unknown) => {
        const result = data as { ok?: boolean };
        if (!result.ok) {
          console.error(`[integrations] Telegram setWebhook re-registration failed for operator ${operatorId}:`, data);
          return;
        }
        console.log(`[integrations] Telegram webhook re-registered for operator ${operatorId}:`, data);
        const existing = updated.appSchema as Record<string, unknown> | null;
        await db.update(operatorIntegrationsTable)
          .set({ appSchema: { ...(existing ?? {}), webhookSecretToken } })
          .where(eq(operatorIntegrationsTable.id, updated.id));
      }).catch((err: unknown) => {
        console.error(`[integrations] Telegram webhook re-registration failed for operator ${operatorId}:`, err);
      });
    }
  }

  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
});

router.delete('/:integrationId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  const [existing] = await db
    .select({ id: operatorIntegrationsTable.id, integrationType: operatorIntegrationsTable.integrationType })
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.id, req.params.integrationId),
        eq(operatorIntegrationsTable.operatorId, operatorId),
      ),
    );

  if (!existing) { res.status(404).json({ error: 'Integration not found' }); return; }

  await db.delete(operatorIntegrationsTable)
    .where(eq(operatorIntegrationsTable.id, req.params.integrationId));

  res.json({ ok: true, deleted: req.params.integrationId });

  autoRemoveIntegrationSkills(operatorId, existing.integrationType).catch(() => {});
  triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});
});

export { decryptToken };
export default router;
