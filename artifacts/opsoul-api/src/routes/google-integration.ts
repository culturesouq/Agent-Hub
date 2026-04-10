import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { operatorIntegrationsTable, operatorsTable } from '@workspace/db';
import { requireAuth } from '../middleware/requireAuth.js';
import { eq, and } from 'drizzle-orm';
import { encryptToken, decryptToken } from '@workspace/opsoul-utils/crypto';
import { triggerSelfAwareness } from '../utils/selfAwarenessEngine.js';

const router = Router();

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive',
].join(' ');

function getBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(',')[0].trim();
    return `https://${domain}`;
  }
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? (req.headers['host'] as string) ?? 'localhost';
  return `${proto}://${host}`;
}

function createState(ownerId: string, operatorId: string): string {
  const payload = Buffer.from(JSON.stringify({
    ownerId,
    operatorId,
    nonce: crypto.randomBytes(8).toString('hex'),
    ts: Date.now(),
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET!).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyState(state: string): { ownerId: string; operatorId: string } | null {
  try {
    const dotIdx = state.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const payload = state.slice(0, dotIdx);
    const sig = state.slice(dotIdx + 1);
    const expected = crypto.createHmac('sha256', process.env.JWT_SECRET!).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() - data.ts > 10 * 60 * 1000) return null;
    return { ownerId: data.ownerId, operatorId: data.operatorId };
  } catch {
    return null;
  }
}

router.post('/initiate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: 'Google OAuth is not configured.' });
    return;
  }

  const { operatorId } = req.body as { operatorId: string };
  if (!operatorId) {
    res.status(400).json({ error: 'operatorId is required' });
    return;
  }

  const [op] = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(and(eq(operatorsTable.id, operatorId), eq(operatorsTable.ownerId, req.owner!.ownerId)));

  if (!op) {
    res.status(404).json({ error: 'Operator not found' });
    return;
  }

  const state = createState(req.owner!.ownerId, operatorId);
  const redirectUri = `${getBaseUrl(req)}/api/integrations/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  res.json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const baseUrl = getBaseUrl(req);

  if (error || !code || !state) {
    res.redirect(`${baseUrl}/?error=google_cancelled`);
    return;
  }

  const stateData = verifyState(state);
  if (!stateData) {
    res.redirect(`${baseUrl}/?error=google_invalid_state`);
    return;
  }

  const { ownerId, operatorId } = stateData;

  try {
    const redirectUri = `${baseUrl}/api/integrations/google/callback`;

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

    const tokens = await tokenRes.json() as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };

    if (!tokens.access_token) {
      console.error('[google-integration] Token exchange failed:', tokens);
      res.redirect(`${baseUrl}/operators/${operatorId}?tab=connections&error=google_failed`);
      return;
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = await userRes.json() as { email?: string; name?: string };

    const tokenPayload = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      email: gUser.email ?? '',
    });
    const encrypted = encryptToken(tokenPayload);

    const googleSubTypes = [
      { type: 'gmail',           label: `Gmail — ${gUser.email ?? 'connected'}` },
      { type: 'google_calendar', label: `Google Calendar — ${gUser.email ?? 'connected'}` },
      { type: 'google_drive',    label: `Google Drive — ${gUser.email ?? 'connected'}` },
    ];

    for (const sub of googleSubTypes) {
      const [existing] = await db
        .select({ id: operatorIntegrationsTable.id })
        .from(operatorIntegrationsTable)
        .where(
          and(
            eq(operatorIntegrationsTable.operatorId, operatorId),
            eq(operatorIntegrationsTable.ownerId, ownerId),
            eq(operatorIntegrationsTable.integrationType, sub.type),
          )
        );

      if (existing) {
        await db
          .update(operatorIntegrationsTable)
          .set({
            tokenEncrypted: encrypted,
            integrationLabel: sub.label,
            status: 'connected',
            scopes: ['gmail', 'calendar', 'drive'],
          })
          .where(eq(operatorIntegrationsTable.id, existing.id));
      } else {
        await db.insert(operatorIntegrationsTable).values({
          id: crypto.randomUUID(),
          operatorId,
          ownerId,
          integrationType: sub.type,
          integrationLabel: sub.label,
          tokenEncrypted: encrypted,
          status: 'connected',
          scopes: ['gmail', 'calendar', 'drive'],
        });
      }
    }

    await triggerSelfAwareness(operatorId, 'integration_change').catch(() => {});

    res.redirect(`${baseUrl}/operators/${operatorId}?tab=connections&connected=google`);
  } catch (err) {
    console.error('[google-integration/callback]', err);
    res.redirect(`${baseUrl}/operators/${operatorId}?tab=connections&error=google_failed`);
  }
});

export default router;
