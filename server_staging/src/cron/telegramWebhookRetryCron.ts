import cron from 'node-cron';
import { backfillTelegramWebhookSecrets } from '../utils/backfillTelegramSecrets.js';

export function startTelegramWebhookRetryCron(): void {
  cron.schedule(
    '0 */4 * * *',
    async () => {
      console.log('[telegram-webhook-retry] Running periodic retry for failed Telegram webhook registrations...');
      try {
        const result = await backfillTelegramWebhookSecrets();
        if (result.succeeded > 0) {
          console.log(`[telegram-webhook-retry] Healed ${result.succeeded} integration(s) — total=${result.total} failed=${result.failed} skipped=${result.skipped}`);
        } else if (result.failed > 0) {
          console.warn(`[telegram-webhook-retry] ${result.failed} integration(s) still failing — total=${result.total} skipped=${result.skipped}`);
        }
      } catch (err) {
        console.error('[telegram-webhook-retry] Unexpected error during retry run:', err);
      }
    },
    { timezone: 'UTC' },
  );

  console.log('[telegram-webhook-retry] Telegram webhook retry cron scheduled: every 4 hours (UTC)');
}
