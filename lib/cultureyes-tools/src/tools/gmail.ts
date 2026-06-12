/**
 * Gmail tools — `gmail_send`, `gmail_search`, `gmail_read`, `gmail_modify`,
 * `gmail_create_draft`, `gmail_list_labels`.
 *
 * Ported from the OpSoul Gmail handlers. Each tool resolves a pluggable
 * `GmailConnector` from `ctx.connectors`; when none is wired it falls back to a
 * default adapter that calls the Gmail REST API
 * (https://gmail.googleapis.com/gmail/v1/...) using a Google OAuth access token
 * read from `ctx.secrets` ("GOOGLE_OAUTH_TOKEN", falling back to
 * "GMAIL_ACCESS_TOKEN"). With no token the tools return a non-fatal
 * `ok:false` "not connected" result rather than throwing.
 *
 * Mirrors OpSoul's real endpoints, RFC 2822 base64url message bodies (send /
 * create_draft), Gmail query syntax (search), label ids (list_labels), and the
 * bulk action enum (modify: read/unread/archive/trash/untrash/star/unstar/
 * apply_label/remove_label, max 1000 ids via batchModify).
 */

import type { ToolContext, ToolDef, ToolResult } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_MODIFY_IDS = 1000;

/** Actions accepted by `gmail_modify`. */
export type GmailModifyAction =
  | "mark_read"
  | "mark_unread"
  | "archive"
  | "unarchive"
  | "trash"
  | "untrash"
  | "star"
  | "unstar"
  | "apply_label"
  | "remove_label";

/**
 * A pluggable Gmail backend. The default implementation talks to the Gmail REST
 * API with an OAuth access token; a deployment may attach its own (a server-side
 * Gmail gateway, a mock, a different mailbox provider exposing the same shape).
 * Each method returns the parsed JSON envelope from the Gmail API.
 */
export interface GmailConnector {
  name: string;
  /** POST users/me/messages/send — body is an RFC 2822 message, base64url-encoded. */
  sendMessage(rawBase64Url: string): Promise<unknown>;
  /** GET users/me/messages?q=...&maxResults=... — Gmail query syntax. */
  searchMessages(query: string, maxResults: number): Promise<unknown>;
  /** GET users/me/messages/{id}?format=full. */
  readMessage(messageId: string): Promise<unknown>;
  /** POST users/me/messages/{id}/modify. */
  modifyMessage(
    messageId: string,
    addLabelIds: string[],
    removeLabelIds: string[],
  ): Promise<unknown>;
  /** POST users/me/messages/batchModify (for >1 id). */
  batchModify(
    messageIds: string[],
    addLabelIds: string[],
    removeLabelIds: string[],
  ): Promise<unknown>;
  /** POST users/me/drafts — body is { message: { raw } }. */
  createDraft(rawBase64Url: string): Promise<unknown>;
  /** GET users/me/labels. */
  listLabels(): Promise<unknown>;
}

// ─── default REST adapter ───────────────────────────────────────────────────

/** The non-fatal sentinel a tool returns when no Gmail token/connector exists. */
const NOT_CONNECTED: ToolResult = {
  ok: false,
  content: "Gmail is not connected for this deployment.",
  error: "gmail not connected",
};

/** Reads the Gmail OAuth access token from secrets, trying both known names. */
async function gmailToken(ctx: ToolContext): Promise<string | undefined> {
  return (
    (await ctx.secrets.get("GOOGLE_OAUTH_TOKEN")) ??
    (await ctx.secrets.get("GMAIL_ACCESS_TOKEN")) ??
    undefined
  );
}

/**
 * Default Gmail connector backed by the Gmail REST API + a bearer access token.
 * Returns `undefined` when no token is available so the caller can degrade to a
 * clean "not connected" result.
 */
async function defaultGmailConnector(
  ctx: ToolContext,
): Promise<GmailConnector | undefined> {
  const token = await gmailToken(ctx);
  if (!token) return undefined;

  async function call(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const res = await fetch(`${GMAIL_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      const errMsg =
        (json as { error?: { message?: string } })?.error?.message ??
        `Gmail API returned HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    return json;
  }

  return {
    name: "gmail-rest",
    sendMessage: (raw) =>
      call("POST", "/messages/send", { raw }),
    searchMessages: (query, maxResults) =>
      call(
        "GET",
        `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
      ),
    readMessage: (messageId) =>
      call("GET", `/messages/${encodeURIComponent(messageId)}?format=full`),
    modifyMessage: (messageId, addLabelIds, removeLabelIds) =>
      call(
        "POST",
        `/messages/${encodeURIComponent(messageId)}/modify`,
        { addLabelIds, removeLabelIds },
      ),
    batchModify: (ids, addLabelIds, removeLabelIds) =>
      call("POST", "/messages/batchModify", {
        ids,
        addLabelIds,
        removeLabelIds,
      }),
    createDraft: (raw) =>
      call("POST", "/drafts", { message: { raw } }),
    listLabels: () => call("GET", "/labels"),
  };
}

/** Resolves the connector from ctx, else the default REST adapter. */
async function resolveConnector(
  ctx: ToolContext,
): Promise<GmailConnector | undefined> {
  const bag =
    (ctx as unknown as { connectors?: { gmail?: GmailConnector } }).connectors ??
    {};
  return bag.gmail ?? (await defaultGmailConnector(ctx));
}

/** Builds an RFC 2822 plain-text message and base64url-encodes it. */
function encodeMessage(to: string, subject: string, body: string): string {
  const raw =
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
    body;
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function optionalString(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = params[key];
  return typeof v === "string" ? v : undefined;
}

// ─── tools ──────────────────────────────────────────────────────────────────

const gmailSend: ToolDef = {
  name: "gmail_send",
  description:
    "Sends an email via the connected Gmail account. Standard RFC 2822 message — recipient, subject, body.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email." },
      subject: { type: "string", description: "Subject line." },
      body: { type: "string", description: "Plain-text body." },
    },
    required: ["to", "subject", "body"],
  },
  async execute(params, ctx) {
    const to = requireString(params, "to");
    const subject = requireString(params, "subject");
    const body = optionalString(params, "body");
    if (body === undefined) {
      return {
        ok: false,
        content: 'gmail_send requires "to", "subject", "body".',
        error: "missing body",
      };
    }
    const gmail = await resolveConnector(ctx);
    if (!gmail) return NOT_CONNECTED;

    const result = await gmail.sendMessage(encodeMessage(to, subject, body));
    return ok(`Sent email to ${to} with subject "${subject}".`, { result });
  },
};

const gmailSearch: ToolDef = {
  name: "gmail_search",
  description:
    "Searches the connected Gmail mailbox using Gmail query syntax. Returns up to 10 message metadata records.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: 'Gmail search query (e.g. "from:foo@bar.com is:unread").',
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const gmail = await resolveConnector(ctx);
    if (!gmail) return NOT_CONNECTED;

    const result = await gmail.searchMessages(query, 10);
    const messages = (result as { messages?: unknown[] }).messages ?? [];
    const count = Array.isArray(messages) ? messages.length : 0;
    return ok(
      `Found ${count} message${count === 1 ? "" : "s"} matching "${query}".`,
      { result },
    );
  },
};

const gmailRead: ToolDef = {
  name: "gmail_read",
  description:
    "Fetches the body of a Gmail message by message id (obtained from gmail_search).",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      messageId: { type: "string", description: "Gmail message id." },
    },
    required: ["messageId"],
  },
  async execute(params, ctx) {
    const messageId = requireString(params, "messageId");
    const gmail = await resolveConnector(ctx);
    if (!gmail) return NOT_CONNECTED;

    const result = await gmail.readMessage(messageId);
    const snippet = (result as { snippet?: string }).snippet;
    const content = snippet
      ? `Read message ${messageId}: ${snippet.replace(/\s+/g, " ").trim()}.`
      : `Read message ${messageId}.`;
    return ok(content, { result });
  },
};

const gmailModify: ToolDef = {
  name: "gmail_modify",
  description:
    "Modify Gmail message state in bulk. Use action enum to mark read/unread, archive, trash/untrash, star/unstar, or apply/remove a custom label. Pass an array of messageIds (max 1000 per call). Combine with gmail_search to clean up promotional mail, archive old threads, mark batches read, etc.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      messageIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of Gmail message ids (from gmail_search).",
      },
      action: {
        type: "string",
        enum: [
          "mark_read",
          "mark_unread",
          "archive",
          "unarchive",
          "trash",
          "untrash",
          "star",
          "unstar",
          "apply_label",
          "remove_label",
        ],
        description: "What to do to all messages.",
      },
      labelId: {
        type: "string",
        description:
          "Required only when action is apply_label or remove_label. Custom label id from gmail_list_labels.",
      },
    },
    required: ["messageIds", "action"],
  },
  async execute(params, ctx) {
    const rawIds = params.messageIds;
    const messageIds = Array.isArray(rawIds)
      ? rawIds.filter((x): x is string => typeof x === "string")
      : [];
    if (messageIds.length === 0) {
      return {
        ok: false,
        content: 'gmail_modify requires a non-empty "messageIds" array.',
        error: "missing messageIds",
      };
    }
    if (messageIds.length > MAX_MODIFY_IDS) {
      return {
        ok: false,
        content: `gmail_modify accepts at most ${MAX_MODIFY_IDS} message ids per call.`,
        error: "too many ids",
      };
    }
    const action = requireString(params, "action") as GmailModifyAction;
    const labelId = optionalString(params, "labelId");

    let addLabelIds: string[] = [];
    let removeLabelIds: string[] = [];
    switch (action) {
      case "mark_read":
        removeLabelIds = ["UNREAD"];
        break;
      case "mark_unread":
        addLabelIds = ["UNREAD"];
        break;
      case "archive":
        removeLabelIds = ["INBOX"];
        break;
      case "unarchive":
        addLabelIds = ["INBOX"];
        break;
      case "trash":
        addLabelIds = ["TRASH"];
        removeLabelIds = ["INBOX"];
        break;
      case "untrash":
        removeLabelIds = ["TRASH"];
        addLabelIds = ["INBOX"];
        break;
      case "star":
        addLabelIds = ["STARRED"];
        break;
      case "unstar":
        removeLabelIds = ["STARRED"];
        break;
      case "apply_label":
        if (!labelId) {
          return {
            ok: false,
            content: 'gmail_modify action=apply_label requires "labelId".',
            error: "missing labelId",
          };
        }
        addLabelIds = [labelId];
        break;
      case "remove_label":
        if (!labelId) {
          return {
            ok: false,
            content: 'gmail_modify action=remove_label requires "labelId".',
            error: "missing labelId",
          };
        }
        removeLabelIds = [labelId];
        break;
      default:
        return {
          ok: false,
          content: `gmail_modify unknown action: "${String(action)}".`,
          error: "unknown action",
        };
    }

    const gmail = await resolveConnector(ctx);
    if (!gmail) return NOT_CONNECTED;

    if (messageIds.length === 1) {
      const result = await gmail.modifyMessage(
        messageIds[0],
        addLabelIds,
        removeLabelIds,
      );
      return ok(`Modified 1 message (${action}).`, { result });
    }

    const result = await gmail.batchModify(
      messageIds,
      addLabelIds,
      removeLabelIds,
    );
    return ok(`Applied ${action} to ${messageIds.length} messages.`, {
      result,
    });
  },
};

const gmailCreateDraft: ToolDef = {
  name: "gmail_create_draft",
  description:
    "Creates a draft email (does NOT send). Same shape as gmail_send. Useful when the operator wants the user to review before sending.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient email." },
      subject: { type: "string", description: "Subject line." },
      body: { type: "string", description: "Plain-text body." },
    },
    required: ["to", "subject", "body"],
  },
  async execute(params, ctx) {
    const to = requireString(params, "to");
    const subject = requireString(params, "subject");
    const body = optionalString(params, "body");
    if (body === undefined) {
      return {
        ok: false,
        content: 'gmail_create_draft requires "to", "subject", "body".',
        error: "missing body",
      };
    }
    const gmail = await resolveConnector(ctx);
    if (!gmail) return NOT_CONNECTED;

    const result = await gmail.createDraft(encodeMessage(to, subject, body));
    return ok(`Created a draft email to ${to} with subject "${subject}".`, {
      result,
    });
  },
};

const gmailListLabels: ToolDef = {
  name: "gmail_list_labels",
  description:
    "Lists all Gmail labels (system + custom) with their ids. Use the label ids with gmail_modify apply_label / remove_label actions.",
  domain: "comms",
  schema: { type: "object", properties: {} },
  async execute(_params, ctx) {
    const gmail = await resolveConnector(ctx);
    if (!gmail) return NOT_CONNECTED;

    const result = await gmail.listLabels();
    const labels = (result as { labels?: unknown[] }).labels ?? [];
    const count = Array.isArray(labels) ? labels.length : 0;
    return ok(`Found ${count} Gmail label${count === 1 ? "" : "s"}.`, {
      result,
    });
  },
};

export const gmailTools: ToolDef[] = [
  gmailSend,
  gmailSearch,
  gmailRead,
  gmailModify,
  gmailCreateDraft,
  gmailListLabels,
];
