/**
 * Firecrawl operator surface
 *
 * Owner-facing endpoints that wrap the Firecrawl REST library. Today the
 * only mounted endpoint is the Stop-Crawl panel that KbSection exposes —
 * when a chat-triggered crawl is burning through the monthly Free-tier
 * budget, the owner can paste the job id and abort. Per [[srag]] this is
 * one of the two critical pre-existing bugs the audit flagged.
 *
 * Mount path (set in index.ts):
 *   /api/operators/:operatorId/firecrawl
 *
 * Endpoint:
 *   POST   /crawl/:jobId/stop   — wraps firecrawl.crawlStop(jobId)
 *
 * Authentication: requireAuth (owner session). The route validates that
 * the operator id belongs to the calling owner before touching Firecrawl,
 * so one owner can't cancel another owner's job by guessing the operator
 * id in the URL. Job ids themselves are Firecrawl-side opaque — we don't
 * track them in our DB, so the only constraint we enforce is owner→
 * operator scope.
 */
import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import { operatorsTable } from '@workspace/db';
import { firecrawl, isFirecrawlAvailable } from '@workspace/integrations-firecrawl';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function resolveOperator(req: Request, res: Response): Promise<string | null> {
  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.id, req.params.operatorId as string),
        eq(operatorsTable.ownerId, req.owner!.ownerId),
      ),
    );
  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return null;
  }
  return op.id;
}

router.post('/crawl/:jobId/stop', async (req: Request, res: Response): Promise<void> => {
  if (!isFirecrawlAvailable()) {
    res.status(503).json({
      error: 'firecrawl_unavailable',
      detail: 'FIRECRAWL_API_KEY is not configured on this deployment.',
    });
    return;
  }
  const operatorId = await resolveOperator(req, res);
  if (!operatorId) return;

  // express types `req.params[key]` as `string | string[]` when the route
  // string contains a wildcard. This route has a single named param so the
  // value is always string at runtime, but we narrow it explicitly for TS.
  const rawJobId = req.params.jobId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (!jobId || jobId.length > 200) {
    res.status(400).json({ error: 'invalid_job_id' });
    return;
  }

  try {
    const result = await firecrawl.crawlStop(jobId, operatorId);
    res.json({ ok: true, jobId, status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface Firecrawl's error verbatim — owner needs the real signal
    // (job not found vs auth failed vs network) to know what to do next.
    // No fallback string, no synthetic operator voice. Structured payload
    // per [[no-fallbacks]] + [[errors-as-investigation]].
    console.error(`[firecrawl] stop failed for job=${jobId} operator=${operatorId}: ${message}`);
    res.status(502).json({
      error: 'firecrawl_stop_failed',
      jobId,
      detail: message,
    });
  }
});

export default router;
