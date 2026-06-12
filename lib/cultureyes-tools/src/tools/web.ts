/**
 * Web tools — `web_search` and `fetch_url`.
 *
 * Both resolve a pluggable backend from `ctx.connectors`, falling back to a
 * default HTTP adapter configured from `ctx.secrets`. Verifier-mode content is
 * the trained `"Source: <name>, <confirms|contradicts|states> ..."` format.
 */

import type { ToolDef } from "@cultureyes/types";
import { connectors, ok, optionalNumber, requireString } from "./_shared.js";
import { defaultUrlFetcher, defaultWebSearchProvider } from "./defaults.js";

export const webSearch: ToolDef = {
  name: "web_search",
  description: "Search the public web for sources relevant to a query.",
  domain: "web",
  schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number", description: "Max results (default 5)." },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const limit = optionalNumber(params, "limit") ?? 5;
    const provider = connectors(ctx).webSearch ?? defaultWebSearchProvider(ctx);
    const hits = await provider.search(query, { limit });

    if (hits.length === 0) {
      return ok("No sources found.", { hits });
    }
    // Trained format: one "Source: <name>, <stance> <snippet>" sentence per hit.
    const lines = hits.map((h) => {
      const stance = h.stance ?? "states";
      const name = h.title || h.url || provider.name;
      const body = h.snippet.replace(/\s+/g, " ").trim();
      return `Source: ${name}, ${stance} ${body}.`;
    });
    return ok(lines.join(" "), { hits });
  },
};

export const fetchUrl: ToolDef = {
  name: "fetch_url",
  description: "Fetch and read the text content at a URL.",
  domain: "web",
  schema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
  async execute(params, ctx) {
    const url = requireString(params, "url");
    const fetcher = connectors(ctx).urlFetcher ?? defaultUrlFetcher(ctx);
    const { title, text } = await fetcher.fetch(url);
    const name = title || url;
    const excerpt = text.replace(/\s+/g, " ").trim().slice(0, 500);
    return ok(`Source: ${name}, states ${excerpt}.`, { url, title, text });
  },
};
