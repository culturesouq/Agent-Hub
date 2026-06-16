import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

// Voice transcription is not available — no Whisper deployment on Azure OpenAI.
// When a Whisper deployment is added to hajeri-data, restore this endpoint.
router.post('/', (_req: Request, res: Response): void => {
  res.status(501).json({ error: 'Voice transcription is not available. Please send text.' });
});

export default router;
