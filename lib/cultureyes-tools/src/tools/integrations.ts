/**
 * Integrations / auth + self / discovery tools.
 *
 * Ported from OpSoul's integration-management, secrets, and self-introspection
 * handlers (toolHandlers.ts: handleListIntegrations / handleRequestCredential /
 * handleConnectWithSecret / handleDisconnectIntegration / handleListSecrets /
 * handleGetSelfInfo / handleListConversations / handleGetCurrentTime).
 *
 * Two domains:
 *   - "auth"      — manage external-service credentials + integrations.
 *   - "discovery" — the operator introspecting itself, its threads, the time.
 *
 * Most tools depend on a sovereign backend (the integrations registry, the
 * Keys & Secrets vault, the operator record, the conversation store). Those are
 * modelled as clean, pluggable connector interfaces resolved off the context's
 * connector bag; when a connector is absent the tool returns a graceful,
 * non-fatal `ok:false` rather than throwing.
 *
 * `get_current_time` is the exception: it is fully real at SDK runtime — it
 * formats the runtime `Date` with `Intl` and needs no backend.
 */

import type { ToolContext, ToolDef, ToolResult } from "@cultureyes/types";
import { ok, optionalNumber, requireString } from "./_shared.js";

// ─── pluggable backends (this category's connector bag) ─────────────────────
//
// `ctx.connectors` is an additive bag a deployment attaches to the context.
// These tools touch sovereign backends, so each interface is read defensively
// from that bag; absence is handled gracefully, never thrown.

/** A single connected external service. */
export interface Integration {
  /** Canonical integration identifier (e.g. "notion", "github"). */
  integrationType: string;
  /** Human-readable label shown to the owner. */
  integrationLabel: string;
  /** Connection status; "connected" when unspecified. */
  status?: string;
  /** True when this is a one-off custom-app integration. */
  isCustomApp?: boolean;
  /** Base URL for custom-app endpoints. */
  baseUrl?: string;
}

/** A spec for one field rendered in an inline connect-form card. */
export interface ConnectFormField {
  name: string;
  label: string;
  type: "text" | "password" | "url" | "email" | "textarea";
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

/** The integrations registry — connect / disconnect / list connected services. */
export interface IntegrationsConnector {
  name: string;
  /** Currently connected integrations for this deployment. Read-only. */
  list(): Promise<Integration[]>;
  /**
   * Create an integration from a secret already stored in the vault.
   * Returns false when no secret with that name exists.
   */
  connect(args: {
    integrationType: string;
    label: string;
    secretName: string;
    baseUrl?: string;
  }): Promise<boolean>;
  /**
   * Remove the credential row(s) for an integration type. Never touches the
   * Keys & Secrets vault. Returns the number of rows removed.
   */
  disconnect(integrationType: string): Promise<number>;
}

/**
 * The Keys & Secrets vault — name listing only.
 *
 * `ctx.secrets` exposes `get(name)` for resolving a value at call time, but it
 * deliberately cannot enumerate. Listing the available labels is an admin
 * capability, so it is its own pluggable connector and still returns names
 * only — never values.
 */
export interface SecretsAdmin {
  name: string;
  listNames(): Promise<string[]>;
}

/** The operator's own metadata, for self-introspection. */
export interface SelfInfo {
  id: string;
  name: string;
  archetypes?: string[];
  mandate?: string;
  model?: string;
  ownerId?: string;
  identityLocked?: boolean;
}

/** Provides the operator's own record. */
export interface SelfInfoProvider {
  name: string;
  getSelf(): Promise<SelfInfo | null>;
}

/** A recent conversation thread. */
export interface ConversationSummary {
  id: string;
  contextName?: string;
  scopeId?: string;
  lastMessageAt?: Date | string;
}

/** The conversation store — recent threads this operator has been part of. */
export interface ConversationsStore {
  name: string;
  list(limit: number): Promise<ConversationSummary[]>;
}

/** This category's slice of the connector bag. */
interface IntegrationsConnectors {
  integrations?: IntegrationsConnector;
  secretsAdmin?: SecretsAdmin;
  selfInfo?: SelfInfoProvider;
  conversations?: ConversationsStore;
}

/** Reads this category's connectors without widening the public context type. */
function bag(ctx: ToolContext): IntegrationsConnectors {
  return (
    (ctx as unknown as { connectors?: IntegrationsConnectors }).connectors ?? {}
  );
}

function notConnected(tool: string): ToolResult {
  return {
    ok: false,
    content: `${tool} is not connected for this deployment.`,
    error: `${tool} connector not provisioned`,
  };
}

// ─── auth ───────────────────────────────────────────────────────────────────

const listIntegrations: ToolDef = {
  name: "list_integrations",
  description:
    "Returns the operator's currently connected external services with status, integration type, and human-readable label. Read-only.",
  domain: "auth",
  schema: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const conn = bag(ctx).integrations;
    if (!conn) return notConnected("list_integrations");

    const rows = await conn.list();
    if (rows.length === 0) {
      return ok("No integrations connected yet.", { integrations: rows });
    }
    const lines = rows.map(
      (r) =>
        `- ${r.integrationType} (${r.integrationLabel}) — status: ${r.status ?? "connected"}${r.isCustomApp ? " [custom_app]" : ""}${r.baseUrl ? ` @ ${r.baseUrl}` : ""}`,
    );
    return ok(`Connected integrations (${rows.length}):\n${lines.join("\n")}`, {
      integrations: rows,
    });
  },
};

const requestCredential: ToolDef = {
  name: "request_credential",
  description:
    "Emits an inline connect-form card in the chat so the owner can drop a token mid-conversation. Used when the operator needs a credential it cannot derive from existing secrets. The card resolves to a real integration on submit.",
  domain: "auth",
  schema: {
    type: "object",
    properties: {
      integrationType: {
        type: "string",
        description:
          'Canonical integration identifier — e.g. "notion", "slack", "github", "linear", "hubspot", "telegram", "whatsapp", or any custom string for a one-off app.',
      },
      label: {
        type: "string",
        description: 'Human-readable label shown on the card (e.g. "Connect Notion").',
      },
      instructions: {
        type: "string",
        description: "One short sentence explaining what the owner is about to do and why.",
      },
      docsUrl: {
        type: "string",
        description: "Optional URL pointing to where the owner can generate the token.",
      },
      fields: {
        type: "array",
        description:
          'Form fields to render. The first field whose name is "token" is treated as the primary credential.',
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            label: { type: "string" },
            type: {
              type: "string",
              enum: ["text", "password", "url", "email", "textarea"],
            },
            placeholder: { type: "string" },
            required: { type: "boolean" },
            hint: { type: "string" },
          },
          required: ["name", "label", "type"],
        },
      },
    },
    required: ["integrationType", "label", "fields"],
  },
  async execute(params, _ctx) {
    const integrationType = requireString(params, "integrationType");
    const label = requireString(params, "label");
    const fields = params.fields;
    if (!Array.isArray(fields) || fields.length === 0) {
      return {
        ok: false,
        content:
          'request_credential requires "integrationType", "label", and a non-empty "fields" array.',
        error: "missing fields",
      };
    }
    const instructions =
      typeof params.instructions === "string" ? params.instructions : undefined;
    const docsUrl = typeof params.docsUrl === "string" ? params.docsUrl : undefined;

    // The card spec a chat UI renders inline; the integration is created the
    // moment the owner submits it.
    const card = {
      kind: "connect_form" as const,
      integrationType,
      label,
      ...(instructions ? { instructions } : {}),
      ...(docsUrl ? { docsUrl } : {}),
      fields: fields as ConnectFormField[],
    };

    return ok(
      `Connect card for ${integrationType} ("${label}") is ready. The owner can drop the credential in the card; the integration is created the moment they hit Connect.`,
      { card },
    );
  },
};

const connectWithSecret: ToolDef = {
  name: "connect_with_secret",
  description:
    "Creates a connected integration using a stored secret as the token, instead of asking the owner to paste one. Useful when the owner already saved the key under Keys & Secrets and tells the operator to use it.",
  domain: "auth",
  schema: {
    type: "object",
    properties: {
      integrationType: {
        type: "string",
        description: 'Canonical integration identifier (e.g. "github", "notion").',
      },
      label: {
        type: "string",
        description: 'Integration label (e.g. "GitHub — main account").',
      },
      secretKey: {
        type: "string",
        description:
          'Name of the secret in Keys & Secrets (uppercase, e.g. "GITHUB_PAT"). Value is read server-side; never seen by the LLM.',
      },
      baseUrl: {
        type: "string",
        description: "Optional base URL when the integration is a custom-app endpoint.",
      },
    },
    required: ["integrationType", "label", "secretKey"],
  },
  async execute(params, ctx) {
    const integrationType = requireString(params, "integrationType");
    const label = requireString(params, "label");
    const secretName = requireString(params, "secretKey").toUpperCase();
    const baseUrl = typeof params.baseUrl === "string" ? params.baseUrl : undefined;

    const conn = bag(ctx).integrations;
    if (!conn) return notConnected("connect_with_secret");

    const created = await conn.connect({
      integrationType,
      label,
      secretName,
      ...(baseUrl ? { baseUrl } : {}),
    });
    if (!created) {
      return {
        ok: false,
        content: `No secret named "${secretName}" in this operator's Keys & Secrets.`,
        error: "secret not found",
      };
    }
    return ok(
      `Connected ${integrationType} ("${label}") using stored secret ${secretName}.`,
      { integrationType, label, secretKey: secretName },
    );
  },
};

const disconnectIntegration: ToolDef = {
  name: "disconnect_integration",
  description:
    "Removes a connected integration by integrationType. The operator may invoke this on the owner's instruction; it deletes the credential row but never touches Keys & Secrets.",
  domain: "auth",
  schema: {
    type: "object",
    properties: {
      integrationType: {
        type: "string",
        description: 'Integration to disconnect (e.g. "notion").',
      },
    },
    required: ["integrationType"],
  },
  async execute(params, ctx) {
    const integrationType = requireString(params, "integrationType");
    const conn = bag(ctx).integrations;
    if (!conn) return notConnected("disconnect_integration");

    const removed = await conn.disconnect(integrationType);
    return ok(
      removed > 0
        ? `Disconnected ${integrationType}. ${removed} row(s) removed.`
        : `No connected integration of type "${integrationType}" was found.`,
      { integrationType, removed },
    );
  },
};

const listSecrets: ToolDef = {
  name: "list_secrets",
  description:
    "Returns the names of all secrets stored under Keys & Secrets for this operator. Values are never returned — only the labels — so the operator can know what credentials it can reference in http_request or connect_with_secret.",
  domain: "auth",
  schema: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const conn = bag(ctx).secretsAdmin;
    if (!conn) return notConnected("list_secrets");

    const names = await conn.listNames();
    if (names.length === 0) {
      return ok("No secrets stored.", { secrets: names });
    }
    return ok(
      `Stored secret labels:\n${names.map((n) => `- ${n}`).join("\n")}\n\nValues are never returned by this tool. Use {{LABEL}} placeholders in http_request or pass the label to connect_with_secret.`,
      { secrets: names },
    );
  },
};

// ─── discovery ────────────────────────────────────────────────────────────--

const getSelfInfo: ToolDef = {
  name: "get_self_info",
  description:
    "Returns the operator's own metadata: id, name, archetypes, mandate summary, current model, owner identity, identity-lock state. Read-only introspection.",
  domain: "discovery",
  schema: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const conn = bag(ctx).selfInfo;
    if (!conn) return notConnected("get_self_info");

    const self = await conn.getSelf();
    if (!self) {
      return {
        ok: false,
        content: "Operator record not found.",
        error: "self record missing",
      };
    }
    const archetypes = self.archetypes ?? [];
    const lines = [
      `Name: ${self.name}`,
      `Id: ${self.id}`,
      `Owner id: ${self.ownerId ?? "—"}`,
      `Archetypes: ${archetypes.length > 0 ? archetypes.join(", ") : "—"}`,
      `Mandate: ${self.mandate ?? "—"}`,
      `Model: ${self.model ?? "(platform default)"}`,
      `Identity locked: ${self.identityLocked ? "yes" : "no"}`,
    ];
    return ok(lines.join("\n"), { self });
  },
};

const listConversations: ToolDef = {
  name: "list_conversations",
  description:
    "Returns the operator's recent conversation threads with title, scope, and last-message time. Useful for the operator to know what threads it has been part of.",
  domain: "discovery",
  schema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max threads to return. Default 10." },
    },
    required: [],
  },
  async execute(params, ctx) {
    const requested = optionalNumber(params, "limit") ?? 10;
    const limit = Math.max(1, Math.min(50, requested));

    const conn = bag(ctx).conversations;
    if (!conn) return notConnected("list_conversations");

    const rows = await conn.list(limit);
    if (rows.length === 0) {
      return ok("No conversations yet.", { conversations: rows });
    }
    const lines = rows.map((r) => {
      const last =
        r.lastMessageAt instanceof Date
          ? r.lastMessageAt.toISOString()
          : (r.lastMessageAt ?? "—");
      return `- "${r.contextName ?? "(untitled)"}" — scope ${r.scopeId ?? "legacy"}, last ${last} (id ${r.id})`;
    });
    return ok(`Recent conversations (${rows.length}):\n${lines.join("\n")}`, {
      conversations: rows,
    });
  },
};

const getCurrentTime: ToolDef = {
  name: "get_current_time",
  description:
    'Returns the current date and time. Defaults to Asia/Dubai (GST). Optional timezone parameter accepts an IANA timezone identifier (e.g. "America/New_York", "Asia/Tokyo", "Europe/London", "UTC") for time elsewhere in the world.',
  domain: "discovery",
  schema: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone identifier. Defaults to Asia/Dubai when omitted.",
      },
    },
    required: [],
  },
  async execute(params, _ctx) {
    const tz =
      typeof params.timezone === "string" && params.timezone.length > 0
        ? params.timezone
        : "Asia/Dubai";
    try {
      // Trained format: "<weekday, day month year, HH:mm> in <timezone>".
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const now = new Date();
      const formatted = `${fmt.format(now)} in ${tz}`;
      return ok(formatted, { timezone: tz, iso: now.toISOString() });
    } catch {
      return {
        ok: false,
        content: `Invalid timezone "${tz}". The timezone parameter accepts IANA identifiers such as "Asia/Dubai", "America/New_York", "Europe/London", "UTC".`,
        error: "invalid timezone",
      };
    }
  },
};

export const integrationsTools: ToolDef[] = [
  listIntegrations,
  requestCredential,
  connectWithSecret,
  disconnectIntegration,
  listSecrets,
  getSelfInfo,
  listConversations,
  getCurrentTime,
];
