import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface OwnerPayload {
  ownerId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      owner?: OwnerPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set');

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET!) as OwnerPayload;
    req.owner = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const SOVEREIGN_ADMINS = new Set([
    'mohamedhajeri887@gmail.com',
    'smoketest@opsoul.dev',
  ]);

  if (!req.owner || !SOVEREIGN_ADMINS.has(req.owner.email)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
