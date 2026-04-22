import { backfillTelegramWebhookSecrets } from '../utils/backfillTelegramSecrets.js';

async function main() {
  console.log('[runBackfillTelegramSecrets] Starting Telegram webhook secret backfill...');

  try {
    const result = await backfillTelegramWebhookSecrets();
    console.log('[runBackfillTelegramSecrets] Backfill complete:');
    console.log(`  total:     ${result.total}`);
    console.log(`  succeeded: ${result.succeeded}`);
    console.log(`  failed:    ${result.failed}`);
    console.log(`  skipped:   ${result.skipped}`);

    if (result.details.length > 0) {
      console.log('\n  Details:');
      for (const d of result.details) {
        const reason = d.reason ? ` — ${d.reason}` : '';
        console.log(`    [${d.status}] integration=${d.integrationId} operator=${d.operatorId}${reason}`);
      }
    }

    if (result.failed > 0) {
      console.error(`\n[runBackfillTelegramSecrets] ERROR: ${result.failed} integration(s) failed to backfill.`);
      process.exit(1);
    }

    console.log('\n[runBackfillTelegramSecrets] Success — 0 failures.');
    process.exit(0);
  } catch (err) {
    console.error('[runBackfillTelegramSecrets] Fatal error:', err);
    process.exit(1);
  }
}

main();
