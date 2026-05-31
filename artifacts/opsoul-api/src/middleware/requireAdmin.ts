import type { Request, Response, NextFunction } from 'express';
import { db } from '@workspace/db';
import { ownersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ownerId = req.owner?.ownerId;
  if (!ownerId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const [owner] = await db.select({ isSovereignAdmin: ownersTable.isSovereignAdmin })
    .from(ownersTable)
    .where(eq(ownersTable.id, ownerId));

  if (!owner?.isSovereignAdmin) {
    // Generic phrasing — do not leak platform-internal vocabulary
    // ("Sovereign") to non-admin callers per architecture-as-secret.
    res.status(403).json({ error: 'Administrator access required' });
    return;
  }

  next();
}
