import { Router } from 'express';
import { db } from '@workspace/db';
import { operatorFilesTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  const id = (req.params as { id: string }).id;
  const ownerId = req.owner!.ownerId;
  try {
    const files = await db
      .select()
      .from(operatorFilesTable)
      .where(and(eq(operatorFilesTable.operatorId, id), eq(operatorFilesTable.ownerId, ownerId)))
      .orderBy(operatorFilesTable.updatedAt);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

router.post('/', async (req, res) => {
  const id = (req.params as { id: string }).id;
  const ownerId = req.owner!.ownerId;
  const { filename, content = '' } = req.body;
  if (!filename) { res.status(400).json({ error: 'filename required' }); return; }
  try {
    const [file] = await db.insert(operatorFilesTable).values({
      id: crypto.randomUUID(),
      operatorId: id,
      ownerId,
      filename,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    triggerSelfAwareness(id, 'kb_learn').catch(() => {});
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create file' });
  }
});

router.patch('/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const ownerId = req.owner!.ownerId;
  const { filename, content } = req.body;
  try {
    const [file] = await db
      .update(operatorFilesTable)
      .set({ ...(filename && { filename }), ...(content !== undefined && { content }), updatedAt: new Date() })
      .where(and(eq(operatorFilesTable.id, fileId), eq(operatorFilesTable.ownerId, ownerId)))
      .returning();
    if (!file) { res.status(404).json({ error: 'File not found' }); return; }
    triggerSelfAwareness((req.params as any).id, 'kb_learn').catch(() => {});
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update file' });
  }
});

router.delete('/:fileId', async (req, res) => {
  const { fileId } = req.params;
  const ownerId = req.owner!.ownerId;
  try {
    await db
      .delete(operatorFilesTable)
      .where(and(eq(operatorFilesTable.id, fileId), eq(operatorFilesTable.ownerId, ownerId)));
    triggerSelfAwareness((req.params as any).id, 'kb_learn').catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
