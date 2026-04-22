import crypto from 'crypto';
import { db } from '@workspace/db';
import { operatorIntegrationsTable } from '@workspace/db';
import { decryptToken } from '@workspace/opsoul-utils/crypto';
import { eq, and, isNotNull } from 'drizzle-orm';

export interface BackfillResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  details: Array<{ integrationId: string; operatorId: string; status: 'ok' | 'failed' | 'skipped'; reason?: string }>;
}

async function callSetWebhook(
  botToken: string,
  webhookUrl: string,
  webhookSecretToken: string,
): Promise<{ ok: boolean; description?: string }> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecretToken }),
  });
  return response.json() as Promise<{ ok?: boolean; description?: string }> as Promise<{ ok: boolean; description?: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function backfillTelegramWebhookSecrets(): Promise<BackfillResult> {
  const integrations = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.integrationType, 'telegram'),
        eq(operatorIntegrationsTable.status, 'connected'),
        isNotNull(operatorIntegrationsTable.tokenEncrypted),
      ),
    );

  const result: BackfillResult = {
    total: integrations.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  for (const integration of integrations) {
    const { id: integrationId, operatorId, tokenEncrypted, appSchema } = integration;

    const schema = appSchema as Record<string, unknown> | null;
    if (typeof schema?.webhookSecretToken === 'string' && schema.webhookSecretToken.length > 0) {
      result.skipped++;
      result.details.push({ integrationId, operatorId, status: 'skipped', reason: 'already has webhookSecretToken' });
      continue;
    }

    try {
      const apiBaseUrl = process.env.API_BASE_URL;
      if (!apiBaseUrl) {
        result.failed++;
        result.details.push({ integrationId, operatorId, status: 'failed', reason: 'API_BASE_URL environment variable is not set' });
        continue;
      }
      const botToken = decryptToken(tokenEncrypted!);
      const webhookUrl = `${apiBaseUrl}/webhooks/telegram/${operatorId}`;
      const webhookSecretToken = crypto.randomBytes(32).toString('hex');

      let data = await callSetWebhook(botToken, webhookUrl, webhookSecretToken);

      if (!data.ok) {
        console.warn(`[backfillTelegramSecrets] setWebhook failed for ${integrationId}, retrying in 2s:`, data);
        await sleep(2000);
        data = await callSetWebhook(botToken, webhookUrl, webhookSecretToken);
      }

      if (!data.ok) {
        console.error(`[backfillTelegramSecrets] setWebhook failed after retry for integration ${integrationId}:`, data);
        result.failed++;
        result.details.push({ integrationId, operatorId, status: 'failed', reason: data.description ?? 'Telegram API returned ok=false' });
        continue;
      }

      await db
        .update(operatorIntegrationsTable)
        .set({ appSchema: { ...(schema ?? {}), webhookSecretToken } })
        .where(eq(operatorIntegrationsTable.id, integrationId));

      console.log(`[backfillTelegramSecrets] webhook secret registered for integration ${integrationId} (operator ${operatorId})`);
      result.succeeded++;
      result.details.push({ integrationId, operatorId, status: 'ok' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[backfillTelegramSecrets] error processing integration ${integrationId}:`, err);
      result.failed++;
      result.details.push({ integrationId, operatorId, status: 'failed', reason: message });
    }
  }

  console.log(`[backfillTelegramSecrets] done — total=${result.total} succeeded=${result.succeeded} failed=${result.failed} skipped=${result.skipped}`);
  return result;
}
