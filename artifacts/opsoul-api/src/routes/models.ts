/**
 * GET /api/models — returns the available LLM provider catalog so the
 * frontend SettingsSection model picker stays in sync with the backend
 * universal model adapter (utils/modelRegistry.ts) automatically.
 *
 * Public-readable (no requireAuth): model names are not sensitive — they
 * are visible in every chat response stream anyway via the `model` field.
 * The list is the same one returned by listAvailableModels() and powers
 * MODEL_OPTIONS used internally.
 *
 * Frontend usage:
 *   useQuery({ queryKey: ['models'], queryFn: () => apiFetch('/models') })
 *   -> [{ id, label, description, provider, contextWindow }]
 */

import { Router, type Request, type Response } from 'express';
import { listAvailableModels } from '../utils/modelRegistry.js';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  res.json({
    models: listAvailableModels(),
  });
});

export default router;
