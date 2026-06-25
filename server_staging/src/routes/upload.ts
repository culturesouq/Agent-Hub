import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

/**
 * File-extension allowlist. Used both for fileFilter fallback (when browser
 * reports a generic mimetype like application/octet-stream) AND for the
 * upload-route's own dispatch (which extractor to run). Broader than the
 * pre-fix allowlist — accepts every common doc/text/spreadsheet/image we
 * have a parser for.
 */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.log',
  '.yaml', '.yml', '.toml', '.ini', '.env',
  '.html', '.htm', '.xml', '.tsv',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const DOC_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const SHEET_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm']);

function getExt(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

function isImageExt(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getExt(filename));
}
function isTextExt(filename: string): boolean {
  return TEXT_EXTENSIONS.has(getExt(filename));
}
function isDocExt(filename: string): boolean {
  return DOC_EXTENSIONS.has(getExt(filename));
}
function isSheetExt(filename: string): boolean {
  return SHEET_EXTENSIONS.has(getExt(filename));
}

/**
 * Permissive file filter — accept by mimetype OR by extension. Browsers
 * sometimes report odd mimetypes (e.g., 'application/octet-stream' for
 * .md files on Windows). Falling back to the extension means owners can
 * upload anything we have a parser for, even when the browser is lying.
 *
 * Pure binary types we can't parse (.exe, .zip, .dmg, etc.) still fail —
 * but with a clear JSON error message, not a generic 500.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const fname = file.originalname || '';
    const mime = file.mimetype || '';
    const ok =
      mime.startsWith('image/') ||
      mime.startsWith('text/') ||
      mime === 'application/pdf' ||
      mime === 'application/json' ||
      mime === 'application/msword' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/octet-stream' || // browser couldn't sniff — trust extension
      isImageExt(fname) ||
      isTextExt(fname) ||
      isDocExt(fname) ||
      isSheetExt(fname);
    if (ok) {
      cb(null, true);
    } else {
      // Pass an Error — handled below by uploadErrorHandler which returns JSON.
      cb(new Error(`Unsupported file: ${fname || 'unnamed'} (mime: ${mime || 'unknown'})`));
    }
  },
});

/**
 * Multer error -> JSON. Without this, multer errors (file too big,
 * unsupported type, malformed multipart) fall through to Express's default
 * HTML error handler. The frontend then tries res.json() on HTML and throws
 * "Unexpected token <" — surfacing as the useless "Upload failed: ..." red
 * banner. With this handler, every error is structured JSON the frontend
 * can show clearly.
 */
function uploadErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (!err) return next();
  const message = err instanceof Error ? err.message : String(err);
  // Multer's own errors carry a `code` (e.g., LIMIT_FILE_SIZE)
  const code = (err as { code?: string }).code;
  let status = 400;
  let userMessage = message;
  if (code === 'LIMIT_FILE_SIZE') {
    status = 413;
    userMessage = 'File too large — max 10 MB. Try compressing it or splitting into smaller files.';
  } else if (code === 'LIMIT_UNEXPECTED_FILE') {
    userMessage = 'Form field name must be "file".';
  }
  console.error('[upload] error:', code ?? 'NO_CODE', '-', message);
  res.status(status).json({ error: userMessage, code: code ?? 'UPLOAD_REJECTED' });
}

router.post(
  '/',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) return uploadErrorHandler(err, req, res, next);
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use form field name "file".' });
      return;
    }

    const { mimetype, originalname, buffer } = req.file;

    try {
      // ── Images — return base64 (LLM consumes via image_url) ──
      if (mimetype.startsWith('image/') || isImageExt(originalname)) {
        const base64 = buffer.toString('base64');
        const effectiveMime = mimetype.startsWith('image/')
          ? mimetype
          : `image/${getExt(originalname).slice(1) || 'jpeg'}`;
        res.json({ type: 'image', base64, mimeType: effectiveMime, name: originalname });
        return;
      }

      // ── PDF — pdf-parse v2 text extraction ──
      // pdf-parse@2.x switched from a callable default export to a class API.
      // The old `await import('pdf-parse')` + default-function pattern returned
      // an object on v2, hence "pdfParse is not a function" at runtime.
      if (mimetype === 'application/pdf' || getExt(originalname) === '.pdf') {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        await parser.destroy();
        const content = result.text.slice(0, 12000);
        res.json({ type: 'text', content, name: originalname });
        return;
      }

      // ── Word .docx — mammoth ──
      if (
        mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        getExt(originalname) === '.docx'
      ) {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        const content = result.value.slice(0, 12000);
        res.json({ type: 'text', content, name: originalname });
        return;
      }

      // ── Legacy .doc — no parser, return filename note ──
      if (mimetype === 'application/msword' || getExt(originalname) === '.doc') {
        res.json({
          type: 'text',
          content: `[Legacy .doc file: ${originalname} — please convert to .docx for full text extraction]`,
          name: originalname,
        });
        return;
      }

      // ── Excel — first sheet to CSV ──
      if (
        mimetype === 'application/vnd.ms-excel' ||
        mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        isSheetExt(originalname)
      ) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(firstSheet);
        const content = csv.slice(0, 12000);
        res.json({ type: 'text', content, name: originalname });
        return;
      }

      // ── Any text-like content (last resort — covers JSON, YAML, MD, CSV, .env, etc.) ──
      if (
        mimetype.startsWith('text/') ||
        mimetype === 'application/json' ||
        isTextExt(originalname) ||
        mimetype === 'application/octet-stream' // trust ext when browser didn't sniff
      ) {
        const content = buffer.toString('utf-8').slice(0, 12000);
        res.json({ type: 'text', content, name: originalname });
        return;
      }

      // Shouldn't reach here — fileFilter should have rejected first.
      res.status(415).json({
        error: `Unsupported file type: ${mimetype || 'unknown'} (${originalname})`,
        code: 'UNSUPPORTED_MIME',
      });
    } catch (err) {
      console.error('[upload] parse error:', (err as Error).message);
      res.status(500).json({
        error: `Failed to process file: ${(err as Error).message}`,
        code: 'PARSE_FAILED',
      });
    }
  },
);

export default router;
