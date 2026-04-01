import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { ownersTable, sessionsTable } from '@workspace/db';
import { hashToken } from '@workspace/opsoul-utils/crypto';
import { signAccessToken, refreshTokenExpiresAt } from '../utils/jwt.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, isNull } from 'drizzle-orm';

const router = Router();

const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = 'opsoul_refresh';

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password, name } = req.body as { email: string; password: string; name?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  if (password.length < 12) {
    res.status(400).json({ error: 'password must be at least 12 characters' });
    return;
  }

  const [existing] = await db.select().from(ownersTable).where(eq(ownersTable.email, email.toLowerCase()));
  if (existing) {
    res.status(409).json({ error: 'email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const id = crypto.randomUUID();

  const [owner] = await db.insert(ownersTable).values({
    id,
    email: email.toLowerCase(),
    passwordHash,
    name: name ?? null,
  }).returning();

  const accessToken = signAccessToken({ ownerId: owner.id, email: owner.email });
  const rawRefresh = crypto.randomBytes(32).toString('hex');
  const refreshHash = hashToken(rawRefresh);
  const expiresAt = refreshTokenExpiresAt();

  await db.insert(sessionsTable).values({
    id: crypto.randomUUID(),
    ownerId: owner.id,
    refreshTokenHash: refreshHash,
    expiresAt,
  });

  res.cookie(COOKIE_NAME, rawRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/',
  });

  res.status(201).json({
    accessToken,
    owner: { id: owner.id, email: owner.email, name: owner.name },
  });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.email, email.toLowerCase()));
  if (!owner) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, owner.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const accessToken = signAccessToken({ ownerId: owner.id, email: owner.email });
  const rawRefresh = crypto.randomBytes(32).toString('hex');
  const refreshHash = hashToken(rawRefresh);
  const expiresAt = refreshTokenExpiresAt();

  await db.insert(sessionsTable).values({
    id: crypto.randomUUID(),
    ownerId: owner.id,
    refreshTokenHash: refreshHash,
    expiresAt,
  });

  res.cookie(COOKIE_NAME, rawRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires: expiresAt,
    path: '/',
  });

  res.json({
    accessToken,
    owner: { id: owner.id, email: owner.email, name: owner.name },
  });
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;

  if (!rawToken) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  const hash = hashToken(rawToken);
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.refreshTokenHash, hash), isNull(sessionsTable.revokedAt)));

  if (!session || new Date() > session.expiresAt) {
    res.status(401).json({ error: 'Refresh token expired or revoked' });
    return;
  }

  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, session.ownerId));
  if (!owner) {
    res.status(401).json({ error: 'Owner not found' });
    return;
  }

  const accessToken = signAccessToken({ ownerId: owner.id, email: owner.email });

  res.json({
    accessToken,
    owner: { id: owner.id, email: owner.email, name: owner.name },
  });
});

router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;

  if (rawToken) {
    const hash = hashToken(rawToken);
    await db
      .update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(sessionsTable.refreshTokenHash, hash));
  }

  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const ownerId = req.owner!.ownerId;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required' });
    return;
  }
  if (newPassword.length < 12) {
    res.status(400).json({ error: 'newPassword must be at least 12 characters' });
    return;
  }

  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, ownerId));
  if (!owner) {
    res.status(404).json({ error: 'Owner not found' });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, owner.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.update(ownersTable).set({ passwordHash: newHash }).where(eq(ownersTable.id, ownerId));

  await db.delete(sessionsTable).where(eq(sessionsTable.ownerId, ownerId));

  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true, message: 'Password changed. All sessions invalidated.' });
});

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, req.owner!.ownerId));
  if (!owner) {
    res.status(404).json({ error: 'Owner not found' });
    return;
  }
  res.json({ id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin });
});

export default router;
