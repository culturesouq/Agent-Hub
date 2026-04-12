import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '@workspace/db-v2';
import { ownersTable, sessionsTable, passwordResetsTable } from '@workspace/db-v2';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { sendEmail, forgotPasswordEmail, welcomeEmail } from '../lib/email.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = '15m';
const REFRESH_EXPIRY_DAYS = 30;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

function signAccess(ownerId: string, email: string): string {
  return jwt.sign({ ownerId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.REPLIT_DOMAINS) return `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}`;
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers['host'] ?? 'opsoul.io';
  return `${proto}://${host}`;
}

async function issueTokens(ownerId: string, email: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccess(ownerId, email);
  const rawRefresh = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86400 * 1000);
  await db.insert(sessionsTable).values({ id: crypto.randomUUID(), ownerId, refreshTokenHash: hashToken(rawRefresh), expiresAt });
  return { accessToken, refreshToken: rawRefresh };
}

// ── Register ──────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  name: z.string().optional(),
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }); return; }

  const { email, password, name } = parsed.data;
  const normalized = email.toLowerCase();
  const [existing] = await db.select({ id: ownersTable.id }).from(ownersTable).where(eq(ownersTable.email, normalized));
  if (existing) { res.status(409).json({ error: 'Email already registered' }); return; }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const id = crypto.randomUUID();
  const [owner] = await db.insert(ownersTable).values({ id, email: normalized, passwordHash, name: name ?? null }).returning();
  const tokens = await issueTokens(owner.id, owner.email);

  void sendEmail(owner.email, 'Welcome to OpSoul', welcomeEmail(owner.name ?? ''));

  res.status(201).json({
    ...tokens,
    owner: { id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin ?? false },
  });
});

// ── Login ─────────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'email and password required' }); return; }

  const { email, password } = parsed.data;
  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.email, email.toLowerCase()));
  if (!owner) { res.status(401).json({ error: 'Invalid credentials' }); return; }
  if (!owner.passwordHash) { res.status(401).json({ error: 'This account uses Google sign-in. Please continue with Google.' }); return; }

  const valid = await bcrypt.compare(password, owner.passwordHash);
  if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const tokens = await issueTokens(owner.id, owner.email);
  res.json({ ...tokens, owner: { id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin ?? false } });
});

// ── Refresh ───────────────────────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) { res.status(400).json({ error: 'refreshToken required' }); return; }

  const hash = hashToken(refreshToken);
  const [session] = await db.select().from(sessionsTable)
    .where(and(eq(sessionsTable.refreshTokenHash, hash), gt(sessionsTable.expiresAt, new Date())));
  if (!session || session.revokedAt) { res.status(401).json({ error: 'Invalid or expired refresh token' }); return; }

  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, session.ownerId));
  if (!owner) { res.status(401).json({ error: 'Owner not found' }); return; }

  res.json({ accessToken: signAccess(owner.id, owner.email) });
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    await db.update(sessionsTable).set({ revokedAt: new Date() }).where(eq(sessionsTable.refreshTokenHash, hashToken(refreshToken)));
  }
  res.json({ ok: true });
});

// ── Me ────────────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, req.owner!.ownerId));
  if (!owner) { res.status(404).json({ error: 'Owner not found' }); return; }
  res.json({ id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin ?? false });
});

router.patch('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name?: string };
  if (name === undefined) { res.status(400).json({ error: 'name required' }); return; }
  const [owner] = await db.update(ownersTable).set({ name }).where(eq(ownersTable.id, req.owner!.ownerId)).returning();
  if (!owner) { res.status(404).json({ error: 'Owner not found' }); return; }
  res.json({ id: owner.id, email: owner.email, name: owner.name });
});

// ── Change password ───────────────────────────────────────────────────────────

router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 12) {
    res.status(400).json({ error: 'currentPassword and newPassword (min 12 chars) required' }); return;
  }
  const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, req.owner!.ownerId));
  if (!owner?.passwordHash) { res.status(400).json({ error: 'No password set on this account' }); return; }
  if (!await bcrypt.compare(currentPassword, owner.passwordHash)) { res.status(401).json({ error: 'Current password incorrect' }); return; }
  await db.update(ownersTable).set({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) }).where(eq(ownersTable.id, owner.id));
  res.json({ ok: true });
});

// ── Forgot password ───────────────────────────────────────────────────────────

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: 'email required' }); return; }

  const [owner] = await db.select({ id: ownersTable.id, email: ownersTable.email, passwordHash: ownersTable.passwordHash })
    .from(ownersTable).where(eq(ownersTable.email, email.toLowerCase()));

  const OK = { ok: true, message: 'If that email has a password-based account, a reset link has been sent.' };
  if (!owner || !owner.passwordHash) { res.json(OK); return; }

  const rawToken = crypto.randomBytes(32).toString('hex');
  await db.insert(passwordResetsTable).values({
    id: crypto.randomUUID(),
    ownerId: owner.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const resetUrl = `${getBaseUrl(req)}/reset-password?token=${rawToken}`;
  void sendEmail(owner.email, 'Reset your OpSoul password', forgotPasswordEmail(resetUrl));
  res.json(OK);
});

// ── Reset password ────────────────────────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token || !newPassword || newPassword.length < 12) {
    res.status(400).json({ error: 'token and newPassword (min 12 chars) required' }); return;
  }

  const [reset] = await db.select().from(passwordResetsTable)
    .where(and(eq(passwordResetsTable.tokenHash, hashToken(token)), isNull(passwordResetsTable.usedAt)));

  if (!reset || new Date() > reset.expiresAt) {
    res.status(400).json({ error: 'Reset link is invalid or has expired.' }); return;
  }

  await db.update(ownersTable).set({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) }).where(eq(ownersTable.id, reset.ownerId));
  await db.update(passwordResetsTable).set({ usedAt: new Date() }).where(eq(passwordResetsTable.id, reset.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.ownerId, reset.ownerId));

  res.json({ ok: true, message: 'Password reset successfully. Please sign in.' });
});

export default router;
