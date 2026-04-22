import { db } from '@workspace/db';
import { operatorIntegrationsTable } from '@workspace/db';
import { encryptToken } from '@workspace/opsoul-utils/crypto';
import { eq, and, sql } from 'drizzle-orm';

export interface BackfillResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  details: Array<{ integrationId: string; operatorId: string; status: 'ok' | 'failed' | 'skipped'; reason?: string }>;
}

export async function backfillWhatsAppAppSecrets(): Promise<BackfillResult> {
  const integrations = await db
    .select()
    .from(operatorIntegrationsTable)
    .where(
      and(
        eq(operatorIntegrationsTable.integrationType, 'whatsapp'),
        sql`${operatorIntegrationsTable.appSchema}->>'appSecret' is not null`,
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
    const { id: integrationId, operatorId, appSchema } = integration;
    const schema = appSchema as Record<string, unknown> | null;
    const plainSecret = typeof schema?.appSecret === 'string' ? schema.appSecret : null;

    if (!plainSecret) {
      result.skipped++;
      result.details.push({ integrationId, operatorId, status: 'skipped', reason: 'appSecret is not a non-empty string' });
      continue;
    }

    if (integration.refreshTokenEncrypted) {
      result.skipped++;
      result.details.push({ integrationId, operatorId, status: 'skipped', reason: 'refreshTokenEncrypted already set' });
      continue;
    }

    try {
      const encrypted = encryptToken(plainSecret);

      const { appSecret: _removed, ...schemaWithoutSecret } = schema ?? {};
      const updatedSchema = schemaWithoutSecret;

      await db
        .update(operatorIntegrationsTable)
        .set({
          refreshTokenEncrypted: encrypted,
          appSchema: updatedSchema,
        })
        .where(eq(operatorIntegrationsTable.id, integrationId));

      console.log(`[backfillWhatsAppSecrets] encrypted appSecret for integration ${integrationId} (operator ${operatorId})`);
      result.succeeded++;
      result.details.push({ integrationId, operatorId, status: 'ok' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[backfillWhatsAppSecrets] error processing integration ${integrationId}:`, err);
      result.failed++;
      result.details.push({ integrationId, operatorId, status: 'failed', reason: message });
    }
  }

  console.log(`[backfillWhatsAppSecrets] done — total=${result.total} succeeded=${result.succeeded} failed=${result.failed} skipped=${result.skipped}`);
  return result;
}
