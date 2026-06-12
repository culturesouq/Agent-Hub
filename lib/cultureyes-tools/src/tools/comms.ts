/**
 * Comms tools — `send_telegram`, `send_whatsapp`, `send_slack`, `slack_search`,
 * and `notify_owner`.
 *
 * Each resolves a pluggable channel connector (`TelegramConnector`,
 * `WhatsAppConnector`, `SlackConnector`) from `ctx.connectors`, falling back to
 * a default adapter that calls the real provider API with credentials read from
 * `ctx.secrets` and native `fetch`. A channel with no token/credential is not
 * provisioned: the tool returns a clear, non-fatal "not connected" result.
 *
 * Real payloads are ported from OpSoul's toolHandlers (handleSendTelegram /
 * handleSendWhatsApp / handleSendSlack / handleSlackSearch / handleNotifyOwner).
 */

import type { ToolContext, ToolDef } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

// ─── pluggable channel connectors ───────────────────────────────────────────
//
// Defined locally (not in _shared) so the comms category owns its adapter
// surface. A deployment swaps any channel by attaching its own implementation
// to `ctx.connectors`; otherwise the default below talks to the real API.

/** A Telegram backend (Bot API, or a custom relay — pluggable). */
export interface TelegramConnector {
  name: string;
  /** Send `text` to `chatId`. Returns the delivered chat id on success. */
  send(chatId: string, text: string): Promise<{ chatId: string }>;
}

/** A WhatsApp backend (Graph API Business, or a custom relay — pluggable). */
export interface WhatsAppConnector {
  name: string;
  /** Send `text` to recipient `to` (international format, no "+"). */
  send(to: string, text: string): Promise<{ to: string }>;
}

/** A Slack backend (Web API, or a custom relay — pluggable). */
export interface SlackConnector {
  name: string;
  /** Post `text` to a channel id/name. Returns the channel on success. */
  post(channel: string, text: string): Promise<{ channel: string }>;
  /** Search messages the bot can read. */
  search(query: string, opts?: { count?: number }): Promise<SlackSearchMatch[]>;
}
export interface SlackSearchMatch {
  text: string;
  channel?: string;
  user?: string;
  permalink?: string;
}

/** The optional comms connector bag a deployment attaches to the context. */
export interface CommsConnectors {
  telegram?: TelegramConnector;
  whatsapp?: WhatsAppConnector;
  slack?: SlackConnector;
}

/** Reads `ctx.connectors` for comms backends without widening `ToolContext`. */
function commsConnectors(ctx: ToolContext): CommsConnectors {
  return (
    (ctx as unknown as { connectors?: CommsConnectors }).connectors ?? {}
  );
}

// ─── default adapters (real provider APIs via fetch + ctx.secrets) ───────────

const WHATSAPP_GRAPH_VERSION = "v18.0";

/**
 * Default Telegram adapter — Bot API sendMessage. Returns `null` when no bot
 * token is configured (the channel is simply not connected). Throws only on a
 * genuine transport/API error, which the tool surfaces as an expected failure.
 */
async function defaultTelegram(
  ctx: ToolContext,
): Promise<TelegramConnector | null> {
  const token = await ctx.secrets.get("TELEGRAM_BOT_TOKEN");
  if (!token) return null;
  return {
    name: "telegram-bot-api",
    async send(chatId, text) {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Telegram sendMessage failed (HTTP ${res.status}): ${body.slice(0, 300)}`,
        );
      }
      return { chatId };
    },
  };
}

/**
 * Default WhatsApp adapter — Graph API messages. Needs both an access token and
 * the phone number id; missing either means the channel is not connected.
 */
async function defaultWhatsApp(
  ctx: ToolContext,
): Promise<WhatsAppConnector | null> {
  const token = await ctx.secrets.get("WHATSAPP_TOKEN");
  const phoneId = await ctx.secrets.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) return null;
  return {
    name: "whatsapp-graph-api",
    async send(to, text) {
      const res = await fetch(
        `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `WhatsApp send failed (HTTP ${res.status}): ${body.slice(0, 300)}`,
        );
      }
      return { to };
    },
  };
}

/**
 * Default Slack adapter — Web API chat.postMessage / search.messages. The Slack
 * API returns HTTP 200 with `{ ok:false, error }` on logical failure, so the
 * adapter inspects the JSON body and throws with the Slack error code.
 */
async function defaultSlack(ctx: ToolContext): Promise<SlackConnector | null> {
  const token = await ctx.secrets.get("SLACK_BOT_TOKEN");
  if (!token) return null;
  return {
    name: "slack-web-api",
    async post(channel, text) {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ channel, text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!body.ok) {
        throw new Error(`Slack post failed: ${body.error ?? "unknown error"}`);
      }
      return { channel };
    },
    async search(query, opts) {
      const count = opts?.count ?? 10;
      const url = `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=${count}`;
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        messages?: { matches?: SlackSearchMatch[] };
      };
      if (!body.ok) {
        throw new Error(
          `Slack search failed: ${body.error ?? "unknown error"}`,
        );
      }
      return body.messages?.matches ?? [];
    },
  };
}

// ─── tools ───────────────────────────────────────────────────────────────────

export const sendTelegram: ToolDef = {
  name: "send_telegram",
  description:
    "Sends a text message via the connected Telegram bot. Requires a Telegram integration to be connected; the bot token is loaded server-side and never seen by the LLM.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      chatId: {
        type: "string",
        description:
          'Telegram chat ID of the recipient (numeric string, e.g. "123456789" or "-1009876…" for groups).',
      },
      text: { type: "string", description: "Message body. Supports Markdown." },
    },
    required: ["chatId", "text"],
  },
  async execute(params, ctx) {
    const chatId = requireString(params, "chatId");
    const text = requireString(params, "text");
    const telegram = commsConnectors(ctx).telegram ?? (await defaultTelegram(ctx));
    if (!telegram) {
      return {
        ok: false,
        content: "send_telegram is not connected for this deployment.",
        error: "telegram connector not provisioned",
      };
    }
    try {
      const { chatId: delivered } = await telegram.send(chatId, text);
      return ok(`Telegram message delivered to ${delivered}.`, {
        channel: "telegram",
        chatId: delivered,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, content: message, error: message };
    }
  },
};

export const sendWhatsApp: ToolDef = {
  name: "send_whatsapp",
  description:
    "Sends a text message via WhatsApp Business API. Requires a WhatsApp integration to be connected; access token and phone number ID are loaded server-side.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description:
          'Recipient phone number in international format without "+" (e.g. "971501234567").',
      },
      text: { type: "string", description: "Message body." },
    },
    required: ["to", "text"],
  },
  async execute(params, ctx) {
    const to = requireString(params, "to");
    const text = requireString(params, "text");
    const whatsapp = commsConnectors(ctx).whatsapp ?? (await defaultWhatsApp(ctx));
    if (!whatsapp) {
      return {
        ok: false,
        content: "send_whatsapp is not connected for this deployment.",
        error: "whatsapp connector not provisioned",
      };
    }
    try {
      const { to: delivered } = await whatsapp.send(to, text);
      return ok(`WhatsApp message delivered to ${delivered}.`, {
        channel: "whatsapp",
        to: delivered,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, content: message, error: message };
    }
  },
};

export const sendSlack: ToolDef = {
  name: "send_slack",
  description:
    "Posts a message to a Slack channel via the connected Slack bot. Requires a Slack integration to be connected.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      channel: {
        type: "string",
        description:
          'Channel ID (e.g. "C01234ABCDE") or channel name with leading # (e.g. "#general").',
      },
      text: {
        type: "string",
        description: "Message body. Supports Slack markdown.",
      },
    },
    required: ["channel", "text"],
  },
  async execute(params, ctx) {
    const channel = requireString(params, "channel");
    const text = requireString(params, "text");
    const slack = commsConnectors(ctx).slack ?? (await defaultSlack(ctx));
    if (!slack) {
      return {
        ok: false,
        content: "send_slack is not connected for this deployment.",
        error: "slack connector not provisioned",
      };
    }
    try {
      const { channel: posted } = await slack.post(channel, text);
      return ok(`Slack message posted to ${posted}.`, {
        channel: posted,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, content: message, error: message };
    }
  },
};

export const slackSearch: ToolDef = {
  name: "slack_search",
  description:
    "Searches messages across channels the connected Slack bot can read. Up to 10 results.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Search query (supports Slack search modifiers like in:#channel).",
      },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const slack = commsConnectors(ctx).slack ?? (await defaultSlack(ctx));
    if (!slack) {
      return {
        ok: false,
        content: "slack_search is not connected for this deployment.",
        error: "slack connector not provisioned",
      };
    }
    try {
      const matches = await slack.search(query, { count: 10 });
      if (matches.length === 0) {
        return ok("No messages found.", { matches });
      }
      const content = matches
        .map((m) => `Found entry: ${m.text.replace(/\s+/g, " ").trim()}.`)
        .join(" ");
      return ok(content, { matches });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, content: message, error: message };
    }
  },
};

export const notifyOwner: ToolDef = {
  name: "notify_owner",
  description:
    "Sends a short notification to the owner via the first available connected channel (Telegram > WhatsApp > Slack). The owner's primary chat/number/channel is configured at integration time. Use when something needs the owner's attention outside the chat.",
  domain: "comms",
  schema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Notification text — keep short and actionable.",
      },
    },
    required: ["text"],
  },
  async execute(params, ctx) {
    const text = requireString(params, "text");
    const conns = commsConnectors(ctx);

    // Probe channels in preference order: telegram > whatsapp > slack.
    // For the default adapters, the owner target lives in a per-channel secret.
    const telegram = conns.telegram ?? (await defaultTelegram(ctx));
    if (telegram) {
      const ownerChatId = await ctx.secrets.get("TELEGRAM_CHAT_ID");
      if (ownerChatId) {
        try {
          await telegram.send(ownerChatId, text);
          return ok(`Owner notified via Telegram (${ownerChatId}).`, {
            channel: "telegram",
            target: ownerChatId,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return { ok: false, content: message, error: message };
        }
      }
    }

    const whatsapp = conns.whatsapp ?? (await defaultWhatsApp(ctx));
    if (whatsapp) {
      const ownerPhone = await ctx.secrets.get("WHATSAPP_OWNER_PHONE");
      if (ownerPhone) {
        try {
          await whatsapp.send(ownerPhone, text);
          return ok(`Owner notified via WhatsApp (${ownerPhone}).`, {
            channel: "whatsapp",
            target: ownerPhone,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return { ok: false, content: message, error: message };
        }
      }
    }

    const slack = conns.slack ?? (await defaultSlack(ctx));
    if (slack) {
      const ownerChannel = await ctx.secrets.get("SLACK_OWNER_CHANNEL");
      if (ownerChannel) {
        try {
          await slack.post(ownerChannel, text);
          return ok(`Owner notified via Slack (${ownerChannel}).`, {
            channel: "slack",
            target: ownerChannel,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return { ok: false, content: message, error: message };
        }
      }
    }

    return {
      ok: false,
      content:
        "No outbound channel is configured with an owner target. Connect Telegram (TELEGRAM_CHAT_ID), WhatsApp (WHATSAPP_OWNER_PHONE), or Slack (SLACK_OWNER_CHANNEL), then call again.",
      error: "no owner channel configured",
    };
  },
};

export const commsTools: ToolDef[] = [
  sendTelegram,
  sendWhatsApp,
  sendSlack,
  slackSearch,
  notifyOwner,
];
