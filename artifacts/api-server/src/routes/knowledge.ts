import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db, knowledgeTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import multer, { MulterError } from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const router: IRouter = Router({ mergeParams: true });

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
};

const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"];

function serializeEntry(e: typeof knowledgeTable.$inferSelect) {
  return {
    ...e,
    title: e.title ?? null,
    sourceUrl: e.sourceUrl ?? null,
    sourceFilename: e.sourceFilename ?? null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

router.get("/agents/:agentId/knowledge", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const entries = await db
    .select()
    .from(knowledgeTable)
    .where(eq(knowledgeTable.agentId, agentId))
    .orderBy(knowledgeTable.createdAt);

  res.json(entries.map(serializeEntry));
});

router.post("/agents/:agentId/knowledge", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const agentId = parseInt(raw, 10);

  const body = req.body as { type: string; title?: string | null; content: string; sourceUrl?: string | null };

  if (!body.content) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const [entry] = await db
    .insert(knowledgeTable)
    .values({
      agentId,
      type: body.type || "text",
      title: body.title ?? null,
      content: body.content,
      sourceUrl: body.sourceUrl ?? null,
    })
    .returning();

  res.status(201).json(serializeEntry(entry));
});

function multerErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File is too large. Maximum allowed size is 10MB." });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }
  next(err);
}

router.post(
  "/agents/:agentId/knowledge/upload",
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        multerErrorHandler(err, req, res, next);
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const raw = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
    const agentId = parseInt(raw, 10);

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { originalname, mimetype, buffer } = req.file;

    const ext = originalname.split(".").pop()?.toLowerCase() ?? "";
    const mimeKey = ALLOWED_MIME_TYPES[mimetype];
    const extKey = ALLOWED_EXTENSIONS.includes(ext) ? ext : null;

    if (!mimeKey && !extKey) {
      res.status(400).json({
        error: `Unsupported file type. Allowed formats: PDF, .docx, .txt, .md`,
      });
      return;
    }

    const fileType = mimeKey ?? extKey;
    let extractedText = "";

    try {
      if (fileType === "pdf") {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        extractedText = result.text.trim();
      } else if (fileType === "docx") {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value.trim();
      } else {
        extractedText = buffer.toString("utf-8").trim();
      }
    } catch (err) {
      res.status(400).json({ error: `Failed to parse file: ${(err as Error).message}` });
      return;
    }

    if (!extractedText) {
      res.status(400).json({ error: "No text could be extracted from the file" });
      return;
    }

    const title = originalname.replace(/\.[^.]+$/, "");

    const [entry] = await db
      .insert(knowledgeTable)
      .values({
        agentId,
        type: "document",
        title,
        content: extractedText,
        sourceFilename: originalname,
      })
      .returning();

    res.status(201).json(serializeEntry(entry));
  }
);

router.patch("/agents/:agentId/knowledge/:id", async (req, res): Promise<void> => {
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(rawAgentId, 10);
  const id = parseInt(rawId, 10);

  const body = req.body as { title?: string | null; content?: string; sourceUrl?: string | null };
  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.sourceUrl !== undefined) updateData.sourceUrl = body.sourceUrl;

  const [entry] = await db
    .update(knowledgeTable)
    .set(updateData)
    .where(and(eq(knowledgeTable.id, id), eq(knowledgeTable.agentId, agentId)))
    .returning();

  if (!entry) {
    res.status(404).json({ error: "Knowledge entry not found" });
    return;
  }

  res.json(serializeEntry(entry));
});

router.delete("/agents/:agentId/knowledge/:id", async (req, res): Promise<void> => {
  const rawAgentId = Array.isArray(req.params.agentId) ? req.params.agentId[0] : req.params.agentId;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agentId = parseInt(rawAgentId, 10);
  const id = parseInt(rawId, 10);

  await db
    .delete(knowledgeTable)
    .where(and(eq(knowledgeTable.id, id), eq(knowledgeTable.agentId, agentId)));

  res.sendStatus(204);
});

export default router;
