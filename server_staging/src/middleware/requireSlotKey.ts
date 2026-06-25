import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { operatorDeploymentSlotsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

export interface SlotContext {
  slotId: string;
  operatorId: string;
  ownerId: string;
  surfaceType: string;
  scopeTrust: string;
  allowedOrigins: string[] | null;
}

declare global {
  namespace Express {
    interface Request {
      slot?: SlotContext;
    }
  }
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function requireSlotKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const raw = authHeader?.startsWith('Bearer opsk_') ? authHeader.slice(7) : null;

  if (!raw) {
    res.status(401).json({ error: 'Slot API key required — Authorization: Bearer opsk_...' });
    return;
  }

  const hashed = hashKey(raw);

  const [slot] = await db
    .select()
    .from(operatorDeploymentSlotsTable)
    .where(eq(operatorDeploymentSlotsTable.apiKey, hashed));

  if (!slot) {
    res.status(401).json({ error: 'Invalid slot API key' });
    return;
  }

  if (!slot.isActive || slot.revokedAt) {
    res.status(403).json({ error: 'This deployment slot has been revoked' });
    return;
  }

  if (slot.allowedOrigins && slot.allowedOrigins.length > 0) {
    const origin = req.headers.origin;
    if (origin && !slot.allowedOrigins.includes(origin)) {
      res.status(403).json({ error: `Origin '${origin}' is not allowed for this slot` });
      return;
    }
  }

  req.slot = {
    slotId:         slot.id,
    operatorId:     slot.operatorId,
    ownerId:        slot.ownerId,
    surfaceType:    slot.surfaceType,
    scopeTrust:     slot.scopeTrust,
    allowedOrigins: slot.allowedOrigins ?? null,
  };

  next();
}
