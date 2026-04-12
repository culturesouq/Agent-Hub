import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { tasksTable } from '@workspace/db-v2';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const tasks = await db.select().from(tasksTable)
    .where(eq(tasksTable.operatorId, operatorId))
    .orderBy(desc(tasksTable.createdAt));
  res.json(tasks);
});

export default router;
