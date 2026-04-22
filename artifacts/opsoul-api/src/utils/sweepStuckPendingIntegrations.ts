import { db } from '@workspace/db';
import { operatorIntegrationsTable } from '@workspace/db';
import { eq, and, lt } from 'drizzle-orm';

const STUCK_THRESHOLD_MINUTES = 5;

export async function sweepStuckPendingIntegrations(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60 * 1000);

  try {
    const stuck = await db
      .select({ id: operatorIntegrationsTable.id, appSchema: operatorIntegrationsTable.appSchema })
      .from(operatorIntegrationsTable)
      .where(
        and(
          eq(operatorIntegrationsTable.integrationType, 'telegram'),
          eq(operatorIntegrationsTable.status, 'pending'),
          lt(operatorIntegrationsTable.createdAt, cutoff),
        ),
      );

    if (stuck.length === 0) {
      console.log('[sweep-pending] No stuck Telegram integrations found.');
      return;
    }

    console.warn(`[sweep-pending] Found ${stuck.length} Telegram integration(s) stuck in 'pending' — marking as error.`);

    for (const row of stuck) {
      const existing = (row.appSchema as Record<string, unknown> | null) ?? {};
      await db
        .update(operatorIntegrationsTable)
        .set({
          status: 'error',
          appSchema: {
            ...existing,
            webhookError:
              'Webhook registration did not complete (server may have restarted). Please retry.',
          },
        })
        .where(
          and(
            eq(operatorIntegrationsTable.id, row.id),
            eq(operatorIntegrationsTable.status, 'pending'),
          ),
        );
    }

    console.log(`[sweep-pending] Marked ${stuck.length} stuck integration(s) as 'error'.`);
  } catch (err) {
    console.error('[sweep-pending] Failed to sweep stuck pending integrations:', (err as Error).message);
  }
}
