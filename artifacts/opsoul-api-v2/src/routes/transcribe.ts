import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import OpenAI, { toFile } from 'openai';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error(`Expected audio, got ${file.mimetype}`));
    }
  },
});

function getOpenAI(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
}

router.post('/', upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided' });
    return;
  }

  const { buffer, mimetype, originalname } = req.file;

  try {
    const openai = getOpenAI();
    const audioFile = await toFile(
      buffer,
      originalname || 'recording.webm',
      { type: mimetype },
    );

    const result = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    res.json({ transcript: result.text });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[transcribe]', msg);
    res.status(500).json({ error: 'Transcription failed', detail: msg });
  }
});

export default router;
