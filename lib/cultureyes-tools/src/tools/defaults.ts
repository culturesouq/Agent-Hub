/**
 * Sensible default adapters, configured from `ctx.secrets` — used when a
 * deployment hasn't attached its own connector. They speak a generic
 * REST/JSON shape so any compatible provider works by setting two secrets;
 * swapping to Tavily/Exa/Firecrawl/Postgres/etc. is a different connector on
 * the context, never an edit here.
 */

import type { ToolContext } from "@cultureyes/types";
import type {
  UrlFetcher,
  WebSearchHit,
  WebSearchProvider,
} from "./_shared.js";

/**
 * Default web search: POSTs `{ query, limit }` to the endpoint in
 * `WEB_SEARCH_ENDPOINT` with bearer `WEB_SEARCH_API_KEY`, and reads back a
 * `{ results: [{ title, url, snippet, stance? }] }` envelope. Most modern
 * search APIs (Tavily, Serper, Exa) either match this or sit behind a thin
 * gateway that does — and a consumer that needs a vendor's exact shape just
 * supplies its own `WebSearchProvider`.
 */
export function defaultWebSearchProvider(ctx: ToolContext): WebSearchProvider {
  return {
    name: "http-search",
    async search(query, opts) {
      const endpoint = await ctx.secrets.get("WEB_SEARCH_ENDPOINT");
      if (!endpoint) {
        throw new Error(
          "No WebSearchProvider configured and WEB_SEARCH_ENDPOINT secret is unset",
        );
      }
      const apiKey = await ctx.secrets.get("WEB_SEARCH_API_KEY");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ query, limit: opts?.limit ?? 5 }),
      });
      if (!res.ok) {
        throw new Error(`Search provider returned HTTP ${res.status}`);
      }
      const json = (await res.json()) as { results?: unknown };
      const rows = Array.isArray(json.results) ? json.results : [];
      return rows.map((r): WebSearchHit => {
        const o = r as Record<string, unknown>;
        return {
          title: String(o.title ?? o.name ?? "untitled"),
          url: String(o.url ?? ""),
          snippet: String(o.snippet ?? o.content ?? o.text ?? ""),
          stance:
            o.stance === "confirms" ||
            o.stance === "contradicts" ||
            o.stance === "states"
              ? o.stance
              : undefined,
        };
      });
    },
  };
}

/** Default URL fetcher: plain HTTP GET, returns the raw body as text. */
export function defaultUrlFetcher(_ctx: ToolContext): UrlFetcher {
  return {
    name: "http-fetch",
    async fetch(url) {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`Fetch returned HTTP ${res.status}`);
      const text = await res.text();
      const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
      return { title: titleMatch?.[1]?.trim(), text };
    },
  };
}
