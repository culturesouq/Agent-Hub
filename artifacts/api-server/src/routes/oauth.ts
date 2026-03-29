import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, oauthConnectionsTable, serviceApiKeysTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import {
  OAUTH_PROVIDERS,
  buildAuthUrl,
  exchangeCodeForToken,
  getAccountLabel,
  refreshAccessToken,
} from "../services/oauth-providers.js";

const router: IRouter = Router();

const CURRENT_USER_ID = "owner";

function getUserId(req: Express.Request): string {
  const session = (req as unknown as { session: { userId?: string } }).session;
  return session?.userId || CURRENT_USER_ID;
}

declare global {
  namespace Express {
    interface Request {
      session: {
        authenticated?: boolean;
        userId?: string;
        oauthState?: string;
      };
    }
  }
}

router.get("/oauth/:providerId/start", requireAuth, (req, res): void => {
  const { providerId } = req.params;
  const returnTo = (req.query.returnTo as string) || "/";

  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) {
    res.status(404).json({ error: `Unknown OAuth provider: ${providerId}` });
    return;
  }

  const clientId = process.env[provider.clientIdEnvVar];
  if (!clientId) {
    res.status(400).json({
      error: `${provider.clientIdEnvVar} is not configured. Please add it to your environment secrets.`,
      missing: provider.clientIdEnvVar,
    });
    return;
  }

  const statePayload = Buffer.from(
    JSON.stringify({ returnTo, providerId, nonce: Math.random().toString(36).slice(2) })
  ).toString("base64url");

  req.session.oauthState = statePayload;

  const authUrl = buildAuthUrl(providerId, statePayload);
  if (!authUrl) {
    res.status(500).json({ error: "Failed to build authorization URL" });
    return;
  }

  res.redirect(authUrl);
});

router.get("/oauth/:providerId/callback", async (req, res): Promise<void> => {
  const { providerId } = req.params;
  const { code, state, error } = req.query as Record<string, string>;

  const savedState = req.session?.oauthState;

  if (error) {
    const returnTo = tryDecodeState(state)?.returnTo || "/";
    res.redirect(`${returnTo}?oauth_error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code) {
    res.status(400).send("Missing authorization code");
    return;
  }

  if (!state || !savedState || state !== savedState) {
    const returnTo = tryDecodeState(state)?.returnTo || "/";
    res.redirect(`${returnTo}?oauth_error=invalid_state`);
    return;
  }

  req.session.oauthState = undefined;

  const stateData = tryDecodeState(state);
  const returnTo = stateData?.returnTo || "/";

  try {
    const tokens = await exchangeCodeForToken(providerId, code);
    if (!tokens) {
      res.redirect(`${returnTo}?oauth_error=token_exchange_failed`);
      return;
    }

    const accessToken =
      (tokens as { authed_user?: { access_token: string } }).authed_user?.access_token ||
      tokens.access_token;

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    const provider = OAUTH_PROVIDERS[providerId];
    const accountLabel = await getAccountLabel(providerId, accessToken);

    await db
      .insert(oauthConnectionsTable)
      .values({
        userId: CURRENT_USER_ID,
        providerId,
        accessToken,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt,
        accountLabel,
        scopes: provider?.scopes.join(" ") || "",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [oauthConnectionsTable.userId, oauthConnectionsTable.providerId],
        set: {
          accessToken,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          accountLabel,
          updatedAt: new Date(),
        },
      });

    res.redirect(`${returnTo}?oauth_connected=${providerId}`);
  } catch (err) {
    console.error(`OAuth callback error for ${providerId}:`, err);
    res.redirect(`${returnTo}?oauth_error=server_error`);
  }
});

router.delete("/oauth/:providerId/disconnect", requireAuth, async (req, res): Promise<void> => {
  const { providerId } = req.params;
  const userId = getUserId(req);

  await db
    .delete(oauthConnectionsTable)
    .where(
      and(
        eq(oauthConnectionsTable.userId, userId),
        eq(oauthConnectionsTable.providerId, providerId)
      )
    );

  res.json({ disconnected: true, providerId });
});

router.get("/oauth/connections", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const connections = await db
    .select()
    .from(oauthConnectionsTable)
    .where(eq(oauthConnectionsTable.userId, userId));

  res.json(
    connections.map(c => ({
      providerId: c.providerId,
      accountLabel: c.accountLabel,
      connected: true,
      expiresAt: c.expiresAt,
    }))
  );
});

router.post("/oauth/api-key/:serviceId", requireAuth, async (req, res): Promise<void> => {
  const { serviceId } = req.params;
  const { apiKey } = req.body as { apiKey: string };
  const userId = getUserId(req);

  if (!apiKey?.trim()) {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  await db
    .insert(serviceApiKeysTable)
    .values({ userId, serviceId, apiKey: apiKey.trim(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [serviceApiKeysTable.userId, serviceApiKeysTable.serviceId],
      set: { apiKey: apiKey.trim(), updatedAt: new Date() },
    });

  res.json({ saved: true, serviceId });
});

router.delete("/oauth/api-key/:serviceId", requireAuth, async (req, res): Promise<void> => {
  const { serviceId } = req.params;
  const userId = getUserId(req);

  await db
    .delete(serviceApiKeysTable)
    .where(
      and(
        eq(serviceApiKeysTable.userId, userId),
        eq(serviceApiKeysTable.serviceId, serviceId)
      )
    );

  res.json({ deleted: true, serviceId });
});

export async function getOAuthToken(
  providerId: string,
  userId: string = CURRENT_USER_ID
): Promise<string | null> {
  const [conn] = await db
    .select()
    .from(oauthConnectionsTable)
    .where(
      and(
        eq(oauthConnectionsTable.userId, userId),
        eq(oauthConnectionsTable.providerId, providerId)
      )
    );

  if (!conn) return null;

  if (conn.expiresAt && conn.refreshToken && conn.expiresAt < new Date(Date.now() + 60_000)) {
    const refreshed = await refreshAccessToken(providerId, conn.refreshToken);
    if (refreshed) {
      const expiresAt = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000)
        : conn.expiresAt;

      await db
        .update(oauthConnectionsTable)
        .set({ accessToken: refreshed.access_token, expiresAt, updatedAt: new Date() })
        .where(eq(oauthConnectionsTable.id, conn.id));

      return refreshed.access_token;
    }
  }

  return conn.accessToken;
}

export async function getStoredApiKey(
  serviceId: string,
  userId: string = CURRENT_USER_ID
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(serviceApiKeysTable)
    .where(
      and(
        eq(serviceApiKeysTable.userId, userId),
        eq(serviceApiKeysTable.serviceId, serviceId)
      )
    );
  return row?.apiKey ?? null;
}

function tryDecodeState(state?: string): { returnTo: string; providerId: string } | null {
  try {
    if (!state) return null;
    return JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export default router;
