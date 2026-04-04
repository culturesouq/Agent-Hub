import cron from 'node-cron';
import { pool } from '@workspace/db';

export function startKeepAliveCron(): void {
  // Ping the database every 4 minutes to prevent Neon from suspending
  // its compute endpoint. Neon suspends after 5 min of inactivity.
  // With a VM deployment this runs 24/7 — the endpoint never suspends,
  // so redeployment diff checks always succeed.
  cron.schedule('*/4 * * * *', async () => {
    try {
      await pool.query('SELECT 1');
    } catch {
      // Non-fatal — log silently. The next tick will retry.
    }
  });

  console.log('[KEEPALIVE] DB keep-alive cron scheduled: every 4 minutes');
}
