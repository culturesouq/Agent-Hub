import { Router, type Request, type Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getVaelRunState, runVaelFullSweep, runVaelValidationOnly } from '../cron/vaelCron.js';
import { validateEntry, runDiscoverySweep } from '../utils/vaelEngine.js';

const router = Router();

router.get('/status', requireAuth, requireAdmin, (_req: Request, res: Response): void => {
  res.json(getVaelRunState());
});

router.post('/sweep', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  res.json({ ok: true, message: 'Full sweep triggered — running in background' });
  runVaelFullSweep().catch((err: Error) => console.error('[VAEL] sweep error:', err.message));
});

router.post('/validate-cycle', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  res.json({ ok: true, message: 'Validation-only cycle triggered — running in background' });
  runVaelValidationOnly().catch((err: Error) => console.error('[VAEL] validation error:', err.message));
});

router.post('/validate', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { title, content, layer, archetype, tags, sourceName, confidence } = req.body as {
    title: string;
    content: string;
    layer: string;
    archetype?: string;
    tags?: string[];
    sourceName?: string;
    confidence?: number;
  };

  if (!title || !content || !layer) {
    res.status(400).json({ error: 'title, content, layer are required' });
    return;
  }

  try {
    const result = await validateEntry({ title, content, layer, archetype, tags: tags ?? [], sourceName, confidence });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Validation failed', detail: (err as Error).message });
  }
});

router.post('/discover', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await runDiscoverySweep();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Discovery sweep failed', detail: (err as Error).message });
  }
});

export default router;
