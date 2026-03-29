import { eq, and } from "drizzle-orm";
import { db, oauthConnectionsTable, serviceApiKeysTable } from "@workspace/db";
import { refreshAccessToken } from "./oauth-providers.js";

const USER_ID = "owner";

const OAUTH_SERVICE_MAP: Record<string, string> = {
  gmail: "google",
  google_calendar: "google",
  google_sheets: "google",
  google_drive: "google",
  google_docs: "google",
  outlook: "microsoft",
  onedrive: "microsoft",
  sharepoint: "microsoft",
  github: "github",
  slack: "slack",
  notion: "notion",
  hubspot: "hubspot",
  linkedin: "linkedin",
};

const API_KEY_SERVICES = new Set([
  "telegram",
  "stripe",
  "linear",
  "airtable",
]);

export async function resolveToken(serviceId: string): Promise<string | null> {
  const providerId = OAUTH_SERVICE_MAP[serviceId];

  if (providerId) {
    return getOAuthToken(providerId);
  }

  if (API_KEY_SERVICES.has(serviceId)) {
    const key = await getStoredApiKey(serviceId);
    if (key) return key;
    const def = await import("./integrations-catalog.js").then(m => m.getIntegrationById(serviceId));
    return def?.envVar ? (process.env[def.envVar] ?? null) : null;
  }

  return null;
}

export async function isServiceConnected(serviceId: string): Promise<{ connected: boolean; accountLabel?: string }> {
  const providerId = OAUTH_SERVICE_MAP[serviceId];

  if (providerId) {
    const [conn] = await db
      .select({ accountLabel: oauthConnectionsTable.accountLabel })
      .from(oauthConnectionsTable)
      .where(
        and(
          eq(oauthConnectionsTable.userId, USER_ID),
          eq(oauthConnectionsTable.providerId, providerId)
        )
      );
    return conn ? { connected: true, accountLabel: conn.accountLabel } : { connected: false };
  }

  if (API_KEY_SERVICES.has(serviceId)) {
    const key = await getStoredApiKey(serviceId);
    const def = await import("./integrations-catalog.js").then(m => m.getIntegrationById(serviceId));
    const envKey = def?.envVar ? process.env[def.envVar] : undefined;
    return key || envKey ? { connected: true } : { connected: false };
  }

  return { connected: false };
}

async function getOAuthToken(providerId: string): Promise<string | null> {
  const [conn] = await db
    .select()
    .from(oauthConnectionsTable)
    .where(
      and(
        eq(oauthConnectionsTable.userId, USER_ID),
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

async function getStoredApiKey(serviceId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(serviceApiKeysTable)
    .where(
      and(
        eq(serviceApiKeysTable.userId, USER_ID),
        eq(serviceApiKeysTable.serviceId, serviceId)
      )
    );
  return row?.apiKey ?? null;
}

export { OAUTH_SERVICE_MAP, API_KEY_SERVICES };
