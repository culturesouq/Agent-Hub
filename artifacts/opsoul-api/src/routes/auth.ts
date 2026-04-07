import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { ownersTable, sessionsTable, passwordResetsTable } from '@workspace/db';
import { hashToken } from '@workspace/opsoul-utils/crypto';
import { signAccessToken, refreshTokenExpiresAt } from '../utils/jwt.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and, isNull } from 'drizzle-orm';
import { sendEmail, forgotPasswordEmail, welcomeEmail } from '../lib/email.js';
import { seedOwnerOperators, OWNER_EMAIL } from '../utils/initSeed.js';

const router = Router();

const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = 'opsoul_refresh';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function getBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? (req.headers['host'] as string) ?? 'opsoul.io';
  return `${proto}://${host}`;
}

async function issueSession(res: Response, owner: { id: string; email: string; name: string | null; isSovereignAdmin: boolean | null }): Promise<string> {
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

  return accessToken;
}

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

  const accessToken = await issueSession(res, owner);
  void sendEmail(owner.email, 'Welcome to OpSoul', welcomeEmail(owner.name ?? ''));
  if (owner.email === OWNER_EMAIL) void seedOwnerOperators(owner.id);

  res.status(201).json({
    accessToken,
    owner: { id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin ?? false },
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

  if (!owner.passwordHash) {
    res.status(401).json({ error: 'This account uses Google sign-in. Please continue with Google.' });
    return;
  }

  const valid = await bcrypt.compare(password, owner.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const accessToken = await issueSession(res, owner);
  if (owner.email === OWNER_EMAIL) void seedOwnerOperators(owner.id);

  res.json({
    accessToken,
    owner: { id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin ?? false },
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
    owner: { id: owner.id, email: owner.email, name: owner.name, isSovereignAdmin: owner.isSovereignAdmin ?? false },
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

  if (!owner.passwordHash) {
    res.status(400).json({ error: 'This account uses Google sign-in and has no password to change.' });
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
  res.json({
    id: owner.id,
    email: owner.email,
    name: owner.name,
    isSovereignAdmin: owner.isSovereignAdmin,
    createdAt: owner.createdAt,
  });
});

router.patch('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name?: string };
  const ownerId = req.owner!.ownerId;

  const trimmedName = typeof name === 'string' ? name.trim() : null;

  const [owner] = await db
    .update(ownersTable)
    .set({ name: trimmedName || null })
    .where(eq(ownersTable.id, ownerId))
    .returning();

  if (!owner) {
    res.status(404).json({ error: 'Owner not found' });
    return;
  }

  res.json({
    id: owner.id,
    email: owner.email,
    name: owner.name,
    isSovereignAdmin: owner.isSovereignAdmin,
    createdAt: owner.createdAt,
  });
});

router.get('/google', (req: Request, res: Response): void => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: 'Google OAuth is not configured.' });
    return;
  }

  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, error } = req.query as { code?: string; error?: string };
  const baseUrl = getBaseUrl(req);

  if (error || !code) {
    res.redirect(`${baseUrl}/login?error=google_cancelled`);
    return;
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json() as { access_token?: string; error?: string };

    if (!tokens.access_token) {
      console.error('[auth/google] Token exchange failed:', tokens);
      res.redirect(`${baseUrl}/login?error=google_failed`);
      return;
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = await userRes.json() as { sub: string; email: string; name?: string; email_verified?: boolean };

    if (!gUser.email) {
      res.redirect(`${baseUrl}/login?error=google_no_email`);
      return;
    }

    let [owner] = await db
      .select()
      .from(ownersTable)
      .where(eq(ownersTable.googleId, gUser.sub));

    if (!owner) {
      const [byEmail] = await db
        .select()
        .from(ownersTable)
        .where(eq(ownersTable.email, gUser.email.toLowerCase()));

      if (byEmail) {
        [owner] = await db
          .update(ownersTable)
          .set({ googleId: gUser.sub, name: byEmail.name ?? gUser.name ?? null })
          .where(eq(ownersTable.id, byEmail.id))
          .returning();
      } else {
        [owner] = await db
          .insert(ownersTable)
          .values({
            id: crypto.randomUUID(),
            email: gUser.email.toLowerCase(),
            name: gUser.name ?? null,
            googleId: gUser.sub,
            passwordHash: null,
          })
          .returning();
        void sendEmail(owner.email, 'Welcome to OpSoul', welcomeEmail(owner.name ?? ''));
      }
    }

    await issueSession(res, owner);
    res.redirect(`${baseUrl}/auth/google/success`);
  } catch (err) {
    console.error('[auth/google/callback]', err);
    res.redirect(`${getBaseUrl(req)}/login?error=google_failed`);
  }
});

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email: string };

  console.log(`[auth] forgot-password requested for: ${email}`);

  if (!email) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  const [owner] = await db
    .select()
    .from(ownersTable)
    .where(eq(ownersTable.email, email.toLowerCase()));

  if (!owner || !owner.passwordHash) {
    console.log(`[auth] forgot-password: no password account found for ${email} — silent ok`);
    res.json({ ok: true, message: 'If that email has a password-based account, a reset link has been sent.' });
    return;
  }

  await db.delete(passwordResetsTable).where(
    and(eq(passwordResetsTable.ownerId, owner.id), isNull(passwordResetsTable.usedAt))
  );

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.insert(passwordResetsTable).values({
    id: crypto.randomUUID(),
    ownerId: owner.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = `${getBaseUrl(req)}/reset-password?token=${rawToken}`;
  console.log(`[auth] forgot-password: sending reset link → ${resetUrl}`);
  void sendEmail(owner.email, 'Reset your OpSoul password', forgotPasswordEmail(resetUrl));

  res.json({ ok: true, message: 'If that email has a password-based account, a reset link has been sent.' });
});

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body as { token: string; newPassword: string };

  if (!token || !newPassword) {
    res.status(400).json({ error: 'token and newPassword are required' });
    return;
  }
  if (newPassword.length < 12) {
    res.status(400).json({ error: 'password must be at least 12 characters' });
    return;
  }

  const tokenHash = hashToken(token);

  const [reset] = await db
    .select()
    .from(passwordResetsTable)
    .where(and(eq(passwordResetsTable.tokenHash, tokenHash), isNull(passwordResetsTable.usedAt)));

  if (!reset) {
    console.warn('[auth] reset-password: token not found in DB (may have been superseded or already used)');
    res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    return;
  }
  if (new Date() > reset.expiresAt) {
    console.warn('[auth] reset-password: token expired at', reset.expiresAt);
    res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    return;
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await db.update(ownersTable).set({ passwordHash: newHash }).where(eq(ownersTable.id, reset.ownerId));
  await db.update(passwordResetsTable).set({ usedAt: new Date() }).where(eq(passwordResetsTable.id, reset.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.ownerId, reset.ownerId));

  res.json({ ok: true, message: 'Password reset successfully. Please sign in.' });
});

export default router;
