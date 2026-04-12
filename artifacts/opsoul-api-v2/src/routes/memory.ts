import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { operatorMemoryTable } from '@workspace/db-v2';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const memories = await db.select({
    id: operatorMemoryTable.id,
    content: operatorMemoryTable.content,
    memoryType: operatorMemoryTable.memoryType,
    sourceTrustLevel: operatorMemoryTable.sourceTrustLevel,
    weight: operatorMemoryTable.weight,
    createdAt: operatorMemoryTable.createdAt,
  }).from(operatorMemoryTable)
    .where(and(eq(operatorMemoryTable.operatorId, operatorId), isNull(operatorMemoryTable.archivedAt)))
    .orderBy(desc(operatorMemoryTable.createdAt));
  res.json(memories);
});

router.delete('/:memoryId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId, memoryId } = req.params as { operatorId: string; memoryId: string };
  await db.update(operatorMemoryTable)
    .set({ archivedAt: new Date() })
    .where(and(eq(operatorMemoryTable.id, memoryId), eq(operatorMemoryTable.operatorId, operatorId)));
  res.json({ ok: true });
});

export default router;
