import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db-v2';
import { operatorIntegrationsTable } from '@workspace/db-v2';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { operatorId } = req.params as { operatorId: string };
  const integrations = await db.select({
    id: operatorIntegrationsTable.id,
    integrationType: operatorIntegrationsTable.integrationType,
    integrationLabel: operatorIntegrationsTable.integrationLabel,
    status: operatorIntegrationsTable.status,
    scopes: operatorIntegrationsTable.scopes,
    createdAt: operatorIntegrationsTable.createdAt,
  }).from(operatorIntegrationsTable).where(eq(operatorIntegrationsTable.operatorId, operatorId));
  res.json(integrations);
});

export default router;
