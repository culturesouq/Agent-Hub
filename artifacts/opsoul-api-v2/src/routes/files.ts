import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db-v2';
import { operatorFilesTable } from '@workspace/db-v2';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const files = await db.select({
    id: operatorFilesTable.id,
    filename: operatorFilesTable.filename,
    content: operatorFilesTable.content,
    createdAt: operatorFilesTable.createdAt,
    updatedAt: operatorFilesTable.updatedAt,
  }).from(operatorFilesTable).where(and(eq(operatorFilesTable.operatorId, operatorId), eq(operatorFilesTable.ownerId, req.owner!.ownerId)));
  res.json(files);
});

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const { filename, content } = req.body as { filename?: string; content?: string };
  if (!filename?.trim()) { res.status(400).json({ error: 'filename required' }); return; }

  const [file] = await db.insert(operatorFilesTable).values({
    id: crypto.randomUUID(),
    operatorId,
    ownerId: req.owner!.ownerId,
    filename,
    content: content ?? '',
  }).returning();
  res.status(201).json(file);
});

router.get('/:fileId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, fileId } = req.params as { operatorId: string; fileId: string };
  const [file] = await db.select().from(operatorFilesTable)
    .where(and(eq(operatorFilesTable.id, fileId), eq(operatorFilesTable.operatorId, operatorId)));
  if (!file) { res.status(404).json({ error: 'File not found' }); return; }
  res.json(file);
});

router.put('/:fileId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, fileId } = req.params as { operatorId: string; fileId: string };
  const { filename, content } = req.body as { filename?: string; content?: string };

  const [file] = await db.update(operatorFilesTable)
    .set({ ...(filename ? { filename } : {}), ...(content !== undefined ? { content } : {}), updatedAt: new Date() })
    .where(and(eq(operatorFilesTable.id, fileId), eq(operatorFilesTable.operatorId, operatorId), eq(operatorFilesTable.ownerId, req.owner!.ownerId)))
    .returning();
  if (!file) { res.status(404).json({ error: 'File not found' }); return; }
  res.json(file);
});

router.patch('/:fileId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, fileId } = req.params as { operatorId: string; fileId: string };
  const { filename, content } = req.body as { filename?: string; content?: string };

  const [file] = await db.update(operatorFilesTable)
    .set({ ...(filename ? { filename } : {}), ...(content !== undefined ? { content } : {}), updatedAt: new Date() })
    .where(and(eq(operatorFilesTable.id, fileId), eq(operatorFilesTable.operatorId, operatorId), eq(operatorFilesTable.ownerId, req.owner!.ownerId)))
    .returning();
  if (!file) { res.status(404).json({ error: 'File not found' }); return; }
  res.json(file);
});

router.delete('/:fileId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, fileId } = req.params as { operatorId: string; fileId: string };
  await db.delete(operatorFilesTable)
    .where(and(eq(operatorFilesTable.id, fileId), eq(operatorFilesTable.operatorId, operatorId)));
  res.json({ ok: true });
});

export default router;
