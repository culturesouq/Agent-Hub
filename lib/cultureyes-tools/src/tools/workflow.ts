/**
 * Workflow / action tools — `audit_log`, `store`, `route_to_reviewer`,
 * `notify`. These DO things (the side-effecting half of the catalog).
 *
 * Each writes to a pluggable sink from `ctx.connectors`. Sinks are scoped to
 * the consumer/deployment on the context, so writes land in the right tenant.
 * Where no sink is wired, `audit_log` and `store` fall back to the context
 * logger (so logging always works), while `route_to_reviewer`/`notify`
 * require an explicit sink (they must reach a real human/channel).
 */

import type { ToolDef } from "@cultureyes/types";
import { connectors, ok, requireString } from "./_shared.js";

export const auditLog: ToolDef = {
  name: "audit_log",
  description: "Append an entry to the secured audit log.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      action: { type: "string" },
      detail: { type: "string" },
    },
    required: ["action"],
  },
  async execute(params, ctx) {
    const action = requireString(params, "action");
    const detail = typeof params.detail === "string" ? params.detail : "";
    const entry = {
      action,
      detail,
      consumerId: ctx.consumerId,
      deploymentId: ctx.deploymentId,
      ts: Date.now(),
    };
    const sink = connectors(ctx).audit;
    if (sink) await sink.append(entry);
    else ctx.logger.info("audit", entry);
    return ok(`Logged action: ${action}.`, entry);
  },
};

export const store: ToolDef = {
  name: "store",
  description: "Persist a key/value record to the secured store.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      key: { type: "string" },
      value: {},
    },
    required: ["key", "value"],
  },
  async execute(params, ctx) {
    const key = requireString(params, "key");
    const value = params.value;
    const sink = connectors(ctx).store;
    if (sink) await sink.put(key, value);
    else ctx.logger.info("store", { key, value });
    return ok(`Stored record: ${key}.`, { key });
  },
};

export const routeToReviewer: ToolDef = {
  name: "route_to_reviewer",
  description: "Escalate an item to a human reviewer queue.",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      reason: { type: "string" },
      payload: {},
    },
    required: ["reason"],
  },
  async execute(params, ctx) {
    const reason = requireString(params, "reason");
    const review = connectors(ctx).review;
    if (!review) {
      return {
        ok: false,
        content: "No reviewer queue is provisioned for this deployment.",
        error: "review sink not provisioned",
      };
    }
    const { ticketId } = await review.enqueue({
      reason,
      payload: params.payload,
      consumerId: ctx.consumerId,
      deploymentId: ctx.deploymentId,
      ts: Date.now(),
    });
    return ok(`Routed to reviewer: ticket ${ticketId}.`, { ticketId, reason });
  },
};

export const notify: ToolDef = {
  name: "notify",
  description: "Send a notification to a channel (chat, email, webhook, …).",
  domain: "workflow",
  schema: {
    type: "object",
    properties: {
      channel: { type: "string" },
      message: { type: "string" },
    },
    required: ["channel", "message"],
  },
  async execute(params, ctx) {
    const channel = requireString(params, "channel");
    const message = requireString(params, "message");
    const sink = connectors(ctx).notify;
    if (!sink) {
      return {
        ok: false,
        content: "No notification sink is provisioned for this deployment.",
        error: "notify sink not provisioned",
      };
    }
    await sink.send(channel, message);
    return ok(`Sent notification to ${channel}.`, { channel });
  },
};
