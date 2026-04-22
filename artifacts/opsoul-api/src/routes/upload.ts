import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/json',
  'application/octet-stream',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.yaml', '.yml', '.toml', '.ini', '.env']);

function isTextExtension(filename: string): boolean {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || isTextExtension(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const { mimetype, originalname, buffer } = req.file;

  try {
    // Images — return base64
    if (mimetype.startsWith('image/')) {
      const base64 = buffer.toString('base64');
      res.json({ type: 'image', base64, mimeType: mimetype, name: originalname });
      return;
    }

    // PDF — extract text via pdf-parse
    if (mimetype === 'application/pdf') {
      const pdfModule = await import('pdf-parse');
      const raw = (pdfModule as any).default ?? pdfModule;
      const pdfParse: (buf: Buffer) => Promise<{ text: string }> =
        typeof raw === 'function' ? raw : (raw as any).default;
      const data = await pdfParse(buffer);
      const content = data.text.slice(0, 12000);
      res.json({ type: 'text', content, name: originalname });
      return;
    }

    // Plain text and all text-like formats (.txt, .md, .csv, .json, .yaml, etc.)
    if (
      mimetype === 'text/plain' ||
      mimetype === 'text/markdown' ||
      mimetype === 'text/x-markdown' ||
      mimetype === 'text/csv' ||
      mimetype === 'application/json' ||
      mimetype.startsWith('text/') ||
      isTextExtension(originalname)
    ) {
      const content = buffer.toString('utf-8').slice(0, 12000);
      res.json({ type: 'text', content, name: originalname });
      return;
    }

    // Word docx — extract via mammoth
    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const content = result.value.slice(0, 12000);
      res.json({ type: 'text', content, name: originalname });
      return;
    }

    // Legacy .doc — return filename only (binary, no parser)
    if (mimetype === 'application/msword') {
      res.json({ type: 'text', content: `[Legacy .doc file: ${originalname} — please convert to .docx for full text extraction]`, name: originalname });
      return;
    }

    // Excel — extract first sheet as TSV via xlsx
    if (
      mimetype === 'application/vnd.ms-excel' ||
      mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const csv = XLSX.utils.sheet_to_csv(firstSheet);
      const content = csv.slice(0, 12000);
      res.json({ type: 'text', content, name: originalname });
      return;
    }

    res.status(400).json({ error: 'Unsupported file type' });
  } catch (err) {
    console.error('[upload] parse error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to process file', detail: (err as Error).message });
  }
});

export default router;
