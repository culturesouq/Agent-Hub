/**
 * Data tools — `db_query`, `kb_query`, `vector_search`.
 *
 * Each resolves a pluggable connector (`DbConnector`, `KbConnector`,
 * `VectorConnector`) from `ctx.connectors`. These are private/sovereign
 * backends, so there is no "default HTTP" guess: if no connector is wired the
 * tool returns a clear, non-fatal "not provisioned" result. Verifier content
 * is the trained `"Found entry: <text>."` shape.
 */

import type { ToolDef } from "@cultureyes/types";
import { connectors, ok, optionalNumber, requireString } from "./_shared.js";

export const dbQuery: ToolDef = {
  name: "db_query",
  description: "Run a read query against the provisioned private database.",
  domain: "data",
  schema: {
    type: "object",
    properties: {
      sql: { type: "string", description: "A read-only SQL statement." },
      params: { type: "array", items: {} },
    },
    required: ["sql"],
  },
  async execute(params, ctx) {
    const sql = requireString(params, "sql");
    const db = connectors(ctx).db;
    if (!db) {
      return {
        ok: false,
        content: "No database is provisioned for this deployment.",
        error: "db connector not provisioned",
      };
    }
    const rows = await db.query(
      sql,
      Array.isArray(params.params) ? (params.params as unknown[]) : undefined,
    );
    const content =
      rows.length === 0
        ? "Found 0 rows."
        : `Found ${rows.length} row${rows.length === 1 ? "" : "s"}: ${rows
            .slice(0, 10)
            .map((r) => JSON.stringify(r))
            .join("; ")}.`;
    return ok(content, { rows });
  },
};

export const kbQuery: ToolDef = {
  name: "kb_query",
  description: "Look up an entry in the provisioned private knowledge base.",
  domain: "data",
  schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const limit = optionalNumber(params, "limit") ?? 3;
    const kb = connectors(ctx).kb;
    if (!kb) {
      return {
        ok: false,
        content: "No knowledge base is provisioned for this deployment.",
        error: "kb connector not provisioned",
      };
    }
    const entries = await kb.lookup(query, { limit });
    if (entries.length === 0) {
      return ok("No entry found.", { entries });
    }
    // Trained format: "Found entry: <text>." per match.
    const content = entries
      .map((e) => `Found entry: ${e.text.replace(/\s+/g, " ").trim()}.`)
      .join(" ");
    return ok(content, { entries });
  },
};

export const vectorSearch: ToolDef = {
  name: "vector_search",
  description: "Semantic similarity search over the provisioned vector store.",
  domain: "data",
  schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      k: { type: "number", description: "Number of nearest matches." },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const k = optionalNumber(params, "k") ?? 5;
    const vector = connectors(ctx).vector;
    if (!vector) {
      return {
        ok: false,
        content: "No vector store is provisioned for this deployment.",
        error: "vector connector not provisioned",
      };
    }
    const matches = await vector.search(query, { k });
    if (matches.length === 0) {
      return ok("No entry found.", { matches });
    }
    const content = matches
      .map((m) => `Found entry: ${m.text.replace(/\s+/g, " ").trim()}.`)
      .join(" ");
    return ok(content, { matches });
  },
};
