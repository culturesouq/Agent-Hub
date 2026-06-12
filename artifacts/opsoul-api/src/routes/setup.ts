import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { ownersTable } from '@workspace/db';
import { signAccessToken, refreshTokenExpiresAt } from '../utils/jwt.js';
import { hashToken } from '@workspace/opsoul-utils/crypto';
import { sessionsTable } from '@workspace/db';

const router = Router();

const BCRYPT_ROUNDS = 12;
const COOKIE_NAME = 'opsoul_refresh';

// GET /api/setup/status
// No auth required — called before any account exists.
// Returns { setupRequired: true } when the owners table is empty.
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  const [firstOwner] = await db.select({ id: ownersTable.id }).from(ownersTable).limit(1);
  res.json({ setupRequired: !firstOwner });
});

// POST /api/setup/complete
// First-run only: create the initial admin account.
// Returns 409 if an owner already exists.
router.post('/complete', async (req: Request, res: Response): Promise<void> => {
  const [existing] = await db.select({ id: ownersTable.id }).from(ownersTable).limit(1);
  if (existing) {
    res.status(409).json({ error: 'Setup already complete' });
    return;
  }

  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail.includes('@')) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const ownerId = crypto.randomUUID();

  const [owner] = await db
    .insert(ownersTable)
    .values({
      id: ownerId,
      email: trimmedEmail,
      passwordHash,
      name: null,
      isSovereignAdmin: true,
    })
    .returning();

  if (!owner) {
    res.status(500).json({ error: 'Failed to create account' });
    return;
  }

  // Issue session — same pattern as auth.ts issueSession
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
    owner: {
      id: owner.id,
      email: owner.email,
      name: owner.name,
      isSovereignAdmin: owner.isSovereignAdmin ?? true,
    },
  });
});

export default router;
