export interface OAuthProvider {
  displayName: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  additionalParams?: Record<string, string>;
  useBasicAuth?: boolean;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    displayName: "Google",
    clientIdEnvVar: "GOOGLE_CLIENT_ID",
    clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
    additionalParams: { access_type: "offline", prompt: "consent" },
  },
  microsoft: {
    displayName: "Microsoft",
    clientIdEnvVar: "MICROSOFT_CLIENT_ID",
    clientSecretEnvVar: "MICROSOFT_CLIENT_SECRET",
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: [
      "offline_access",
      "openid",
      "email",
      "profile",
      "User.Read",
      "Mail.Send",
      "Mail.ReadWrite",
      "Calendars.ReadWrite",
      "Files.ReadWrite",
      "Sites.Read.All",
    ],
  },
  github: {
    displayName: "GitHub",
    clientIdEnvVar: "GITHUB_CLIENT_ID",
    clientSecretEnvVar: "GITHUB_CLIENT_SECRET",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "user", "read:org"],
  },
  slack: {
    displayName: "Slack",
    clientIdEnvVar: "SLACK_CLIENT_ID",
    clientSecretEnvVar: "SLACK_CLIENT_SECRET",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "chat:write", "channels:history", "users:read"],
  },
  notion: {
    displayName: "Notion",
    clientIdEnvVar: "NOTION_CLIENT_ID",
    clientSecretEnvVar: "NOTION_CLIENT_SECRET",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    additionalParams: { owner: "user" },
    useBasicAuth: true,
  },
  hubspot: {
    displayName: "HubSpot",
    clientIdEnvVar: "HUBSPOT_CLIENT_ID",
    clientSecretEnvVar: "HUBSPOT_CLIENT_SECRET",
    authorizationUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
    ],
  },
  linkedin: {
    displayName: "LinkedIn",
    clientIdEnvVar: "LINKEDIN_CLIENT_ID",
    clientSecretEnvVar: "LINKEDIN_CLIENT_SECRET",
    authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["r_liteprofile", "r_emailaddress", "w_member_social"],
  },
};

export function getCallbackUrl(providerId: string): string {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  const base = domain
    ? `https://${domain}`
    : `http://localhost:${process.env.PORT || 8080}`;
  return `${base}/api/oauth/${providerId}/callback`;
}

export function buildAuthUrl(providerId: string, state: string): string | null {
  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) return null;
  const clientId = process.env[provider.clientIdEnvVar];
  if (!clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(providerId),
    response_type: "code",
    scope: provider.scopes.join(" "),
    state,
    ...provider.additionalParams,
  });

  return `${provider.authorizationUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  providerId: string,
  code: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  authed_user?: { access_token: string };
} | null> {
  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) return null;

  const clientId = process.env[provider.clientIdEnvVar];
  const clientSecret = process.env[provider.clientSecretEnvVar];
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getCallbackUrl(providerId),
    client_id: clientId,
    client_secret: clientSecret,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (provider.useBasicAuth) {
    const cred = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${cred}`;
  }

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Token exchange failed for ${providerId}:`, err);
    return null;
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    authed_user?: { access_token: string };
  }>;
}

export async function refreshAccessToken(
  providerId: string,
  refreshToken: string
): Promise<{ access_token: string; expires_in?: number } | null> {
  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) return null;

  const clientId = process.env[provider.clientIdEnvVar];
  const clientSecret = process.env[provider.clientSecretEnvVar];
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });

  if (!res.ok) return null;
  return res.json() as Promise<{ access_token: string; expires_in?: number }>;
}

export async function getAccountLabel(providerId: string, accessToken: string): Promise<string> {
  try {
    switch (providerId) {
      case "google": {
        const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const d = await r.json() as { email?: string; name?: string };
        return d.email || d.name || "Google account";
      }
      case "microsoft": {
        const r = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const d = await r.json() as { userPrincipalName?: string; displayName?: string };
        return d.userPrincipalName || d.displayName || "Microsoft account";
      }
      case "github": {
        const r = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
        });
        const d = await r.json() as { login?: string; name?: string };
        return d.name || `@${d.login}` || "GitHub account";
      }
      case "slack": {
        const r = await fetch("https://slack.com/api/auth.test", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: "{}",
        });
        const d = await r.json() as { ok: boolean; user?: string; team?: string };
        return d.ok ? `${d.user} (${d.team})` : "Slack workspace";
      }
      case "notion": {
        const r = await fetch("https://api.notion.com/v1/users/me", {
          headers: { Authorization: `Bearer ${accessToken}`, "Notion-Version": "2022-06-28" },
        });
        const d = await r.json() as { name?: string; person?: { email: string } };
        return d.person?.email || d.name || "Notion account";
      }
      case "hubspot": {
        const r = await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + accessToken);
        const d = await r.json() as { user?: string; hub_domain?: string };
        return d.user || d.hub_domain || "HubSpot account";
      }
      case "linkedin": {
        const r = await fetch("https://api.linkedin.com/v2/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const d = await r.json() as { localizedFirstName?: string; localizedLastName?: string };
        return `${d.localizedFirstName || ""} ${d.localizedLastName || ""}`.trim() || "LinkedIn account";
      }
      default:
        return "Connected account";
    }
  } catch {
    return "Connected account";
  }
}
