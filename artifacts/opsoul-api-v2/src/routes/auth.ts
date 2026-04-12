import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { ownersTable, sessionsTable } from '@workspace/db-v2';
import { eq, and, gt } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = '15m';
const REFRESH_EXPIRY_DAYS = 30;
const BCRYPT_ROUNDS = 12;

function signAccess(ownerId: string, email: string): string {
  return jwt.sign({ ownerId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function hashRefresh(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const { email, password, name } = parsed.data;
  const [existing] = await db.select({ id: ownersTable.id }).from(ownersTable).where(eq(ownersTable.email, email));
  if (existing) { res.status(409).json({ error: 'Email already registered' }); return; }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const id = crypto.randomUUID();
  await db.insert(ownersTable).values({ id, email, passwordHash, name: name ?? null });

  const access = signAccess(id, email);
  const refresh = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86400 * 1000);
  await db.insert(sessionsTable).values({ id: crypto.randomUUID(), ownerId: id, refreshTokenHash: hashRefresh(refresh), expiresAt });

  res.json({ accessToken: access, refreshToken: refresh, owner: { id, email, name: name ?? null } });
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid input' }); return; }

  const { email, password } = parsed.data;
  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.email, email));
  if (!owner || !owner.passwordHash) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const ok = await bcrypt.compare(password, owner.passwordHash);
  if (!ok) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const access = signAccess(owner.id, owner.email);
  const refresh = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86400 * 1000);
  await db.insert(sessionsTable).values({ id: crypto.randomUUID(), ownerId: owner.id, refreshTokenHash: hashRefresh(refresh), expiresAt });

  res.json({ accessToken: access, refreshToken: refresh, owner: { id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin } });
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) { res.status(400).json({ error: 'refreshToken required' }); return; }

  const hash = hashRefresh(refreshToken);
  const now = new Date();
  const [session] = await db.select().from(sessionsTable)
    .where(and(eq(sessionsTable.refreshTokenHash, hash), gt(sessionsTable.expiresAt, now)));
  if (!session || session.revokedAt) { res.status(401).json({ error: 'Invalid or expired refresh token' }); return; }

  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, session.ownerId));
  if (!owner) { res.status(401).json({ error: 'Owner not found' }); return; }

  const access = signAccess(owner.id, owner.email);
  res.json({ accessToken: access });
});

router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    const hash = hashRefresh(refreshToken);
    await db.update(sessionsTable).set({ revokedAt: new Date() }).where(eq(sessionsTable.refreshTokenHash, hash));
  }
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, req.owner!.ownerId));
  if (!owner) { res.status(404).json({ error: 'Owner not found' }); return; }
  res.json({ id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin });
});

router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'currentPassword and newPassword (min 8 chars) required' }); return;
  }

  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, req.owner!.ownerId));
  if (!owner?.passwordHash) { res.status(400).json({ error: 'Password login not set up' }); return; }

  const ok = await bcrypt.compare(currentPassword, owner.passwordHash);
  if (!ok) { res.status(401).json({ error: 'Current password incorrect' }); return; }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(ownersTable).set({ passwordHash: newHash }).where(eq(ownersTable.id, owner.id));
  res.json({ ok: true });
});

export default router;
