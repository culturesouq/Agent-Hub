const CONNECTORS_HOSTNAME = process.env.REPLIT_CONNECTORS_HOSTNAME;
const REPL_IDENTITY = process.env.REPL_IDENTITY;

export interface ConnectorTokenResult {
  token: string;
  expiresAt: number;
}

export interface ConnectorStatus {
  connected: boolean;
  displayName?: string;
  error?: string;
}

export async function getReplitConnectorToken(connectorConfigId: string): Promise<ConnectorTokenResult | null> {
  if (!CONNECTORS_HOSTNAME || !REPL_IDENTITY) {
    return null;
  }

  try {
    const res = await fetch(
      `https://${CONNECTORS_HOSTNAME}/connectors/${connectorConfigId}/token`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${REPL_IDENTITY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json() as { access_token?: string; token?: string; expires_in?: number; expires_at?: number };
    const token = data.access_token || data.token;
    if (!token) return null;

    const expiresAt = data.expires_at
      ? data.expires_at
      : Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000);

    return { token, expiresAt };
  } catch {
    return null;
  }
}

export async function checkConnectorStatus(connectorConfigId: string): Promise<ConnectorStatus> {
  if (!CONNECTORS_HOSTNAME || !REPL_IDENTITY) {
    return { connected: false, error: "Replit connector service not available" };
  }

  try {
    const res = await fetch(
      `https://${CONNECTORS_HOSTNAME}/connectors/${connectorConfigId}/status`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${REPL_IDENTITY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (res.status === 404) {
      return { connected: false, error: "Connector not found or not authorized" };
    }

    if (!res.ok) {
      const tokenResult = await getReplitConnectorToken(connectorConfigId);
      if (tokenResult) {
        return { connected: true };
      }
      return { connected: false, error: `Connector status check failed (HTTP ${res.status})` };
    }

    const data = await res.json() as { connected?: boolean; displayName?: string; status?: string };
    return {
      connected: data.connected !== false && data.status !== "disconnected",
      displayName: data.displayName,
    };
  } catch (err) {
    return { connected: false, error: String(err) };
  }
}

export function isReplitConnectorAvailable(): boolean {
  return !!(CONNECTORS_HOSTNAME && REPL_IDENTITY);
}
