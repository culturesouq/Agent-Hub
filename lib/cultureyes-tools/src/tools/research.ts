/**
 * Web-research tools — the five Firecrawl operations:
 * `firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, `firecrawl_extract`,
 * `firecrawl_search`.
 *
 * Ported from OpSoul (toolHandlers.ts handleFirecrawl*, integrations-firecrawl
 * firecrawl.ts). All danger knobs (allowExternalLinks, unbounded limit, missing
 * nav excludePaths) are HARDCODED here, NOT exposed via the schema — the brain
 * only ever sees the safe subset, so it cannot override them.
 *
 * Backend is pluggable: a deployment may attach its own `FirecrawlConnector` on
 * `ctx.connectors.firecrawl`; otherwise the default implementation calls the
 * real Firecrawl REST API with the bearer token from `ctx.secrets`
 * ("FIRECRAWL_API_KEY"). When no token is present every tool returns a
 * non-fatal "not connected" result rather than throwing.
 */

import type { ToolContext, ToolDef } from "@cultureyes/types";
import { ok, requireString } from "./_shared.js";

// ─── caps / guardrails (copied from OpSoul handlers) ────────────────────────
const FC_TRUNCATE = 12_000; // markdown chars returned per page
const FC_EXTRACT_TRUNCATE = 16_000; // JSON chars returned for extract
const FC_HARD_PAGE_CAP = 500; // Free-tier monthly safety net
const FC_HARD_DEPTH_CAP = 4;
const FC_EXTRACT_MAX_URLS = 20; // /extract is per-token priced — bound it

/** Default nav/utility path prefixes that should never be crawled. */
const FC_NAV_EXCLUDE_DEFAULTS: readonly string[] = [
  "/login",
  "/signup",
  "/sign-in",
  "/sign-up",
  "/register",
  "/cart",
  "/checkout",
  "/account",
  "/profile",
  "/privacy",
  "/terms",
  "/cookie",
  "/sitemap",
  "/search",
  "/tag/",
  "/tags/",
  "/category/",
  "/categories/",
  "/author/",
  "/page/",
  "/api/",
  "/wp-admin/",
  "/wp-login.php",
];

// ─── pluggable backend interface ────────────────────────────────────────────
//
// A consumer swaps the whole Firecrawl backend by attaching one of these on
// `ctx.connectors.firecrawl`. The default reads FIRECRAWL_API_KEY from
// `ctx.secrets` and calls the real Firecrawl REST API.

export interface FcScrapeArgs {
  url: string;
  formats?: Array<"markdown" | "html" | "json">;
  onlyMainContent?: boolean;
}
export interface FcMapArgs {
  url: string;
  search?: string;
  limit?: number;
}
export interface FcCrawlArgs {
  url: string;
  limit?: number;
  maxDiscoveryDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  allowExternalLinks?: boolean;
  allowSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  scrapeOptions?: { formats?: string[]; onlyMainContent?: boolean };
}
export interface FcExtractArgs {
  urls: string[];
  prompt?: string;
  schema?: object;
  enableWebSearch?: boolean;
}
export interface FcSearchArgs {
  query: string;
  limit?: number;
  scrapeOptions?: { formats?: string[] };
}

/** Generic result envelope (matches Firecrawl's REST shape). */
export interface FcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** /crawl returns the job id at top level on POST. */
  id?: string;
  status?: string;
}

export type FcSearchItem = { url: string; title?: string; markdown?: string };

/** A Firecrawl backend (the real REST API, a mock, a proxy, … — pluggable). */
export interface FirecrawlConnector {
  name: string;
  scrape(
    args: FcScrapeArgs,
  ): Promise<FcResponse<{ markdown?: string; html?: string; json?: unknown }>>;
  map(args: FcMapArgs): Promise<FcResponse<{ links: string[] }>>;
  crawl(args: FcCrawlArgs): Promise<FcResponse<{ id: string; url: string }>>;
  extract(args: FcExtractArgs): Promise<FcResponse<{ data: unknown }>>;
  search(args: FcSearchArgs): Promise<FcResponse<{ data: FcSearchItem[] }>>;
}

/** Reads `ctx.connectors.firecrawl` without widening the public context type. */
function firecrawlConnector(ctx: ToolContext): FirecrawlConnector | undefined {
  const conn =
    (ctx as unknown as { connectors?: { firecrawl?: FirecrawlConnector } })
      .connectors ?? {};
  return conn.firecrawl;
}

/**
 * Default Firecrawl backend: real REST calls to the Firecrawl API with the
 * bearer token from `ctx.secrets`. Returns `undefined` when no token is
 * configured so callers can surface a clean "not connected" result.
 */
export async function defaultFirecrawlConnector(
  ctx: ToolContext,
): Promise<FirecrawlConnector | undefined> {
  const key = await ctx.secrets.get("FIRECRAWL_API_KEY");
  if (!key) return undefined;
  const base =
    (await ctx.secrets.get("FIRECRAWL_API_URL")) ?? "https://api.firecrawl.dev";

  async function post<T>(path: string, body: unknown): Promise<FcResponse<T>> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
    });
    if (res.status === 429) {
      return {
        success: false,
        error:
          "Firecrawl rate-limit hit (Free tier is 15 req/min). Wait a moment and retry.",
      };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        error: `Firecrawl ${path} HTTP ${res.status}: ${text.slice(0, 500)}`,
      };
    }
    return (await res.json()) as FcResponse<T>;
  }

  return {
    name: "firecrawl-rest",
    scrape: (args) =>
      post<{ markdown?: string; html?: string; json?: unknown }>(
        "/v2/scrape",
        args,
      ),
    map: (args) => post<{ links: string[] }>("/v2/map", args),
    crawl: (args) => post<{ id: string; url: string }>("/v2/crawl", args),
    extract: (args) => post<{ data: unknown }>("/v2/extract", args),
    search: (args) => post<{ data: FcSearchItem[] }>("/v2/search", args),
  };
}

/** Shared "no token / no connector" non-fatal result. */
function notConnected(tool: string) {
  return {
    ok: false as const,
    content: `${tool} is not connected for this deployment.`,
    error: "FIRECRAWL_API_KEY not configured",
  };
}

async function resolveConnector(
  ctx: ToolContext,
): Promise<FirecrawlConnector | undefined> {
  return firecrawlConnector(ctx) ?? (await defaultFirecrawlConnector(ctx));
}

function optBool(
  params: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const v = params[key];
  return typeof v === "boolean" ? v : undefined;
}

function optNum(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = params[key];
  return typeof v === "number" ? v : undefined;
}

function optStringArray(
  params: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const v = params[key];
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string");
  return out.length > 0 ? out : undefined;
}

// ─── firecrawl_scrape ───────────────────────────────────────────────────────
export const firecrawlScrape: ToolDef = {
  name: "firecrawl_scrape",
  description:
    "Fetches a single URL and returns its main content as markdown. Use for one-off page reads when you need clean, parseable content (no navigation chrome, no ads).",
  domain: "web",
  schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute https URL to scrape." },
      onlyMainContent: {
        type: "boolean",
        description: "Default true. Strip nav/footers/ads.",
      },
    },
    required: ["url"],
  },
  async execute(params, ctx) {
    const url = requireString(params, "url");
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("firecrawl_scrape");

    const r = await conn.scrape({
      url,
      formats: ["markdown"],
      onlyMainContent: optBool(params, "onlyMainContent") ?? true,
    });
    if (!r.success) {
      return {
        ok: false,
        content: `Firecrawl scrape did not return content (${r.error ?? "no detail"}). The URL may be unreachable, blocked, or behind auth.`,
        error: r.error ?? "scrape failed",
      };
    }
    const md = (r.data?.markdown ?? "").toString();
    if (!md.trim()) {
      return ok(`Firecrawl returned an empty page for ${url}.`, {
        url,
        markdown: "",
      });
    }
    const markdown = md.slice(0, FC_TRUNCATE);
    return ok(markdown, { url, markdown });
  },
};

// ─── firecrawl_map ──────────────────────────────────────────────────────────
export const firecrawlMap: ToolDef = {
  name: "firecrawl_map",
  description:
    "Discovers URLs reachable from a starting domain — returns a list of links without fetching their content. Use to plan a crawl or survey a site before scraping.",
  domain: "web",
  schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Absolute https URL to start mapping from.",
      },
      search: {
        type: "string",
        description: "Optional filter — only return links matching this substring.",
      },
      limit: {
        type: "number",
        description: "Optional max links to return (Firecrawl default: 5000).",
      },
    },
    required: ["url"],
  },
  async execute(params, ctx) {
    const url = requireString(params, "url");
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("firecrawl_map");

    const search = params.search;
    const r = await conn.map({
      url,
      search: typeof search === "string" ? search : undefined,
      limit: optNum(params, "limit"),
    });
    if (!r.success) {
      return {
        ok: false,
        content: `Firecrawl map did not return links (${r.error ?? "no detail"}).`,
        error: r.error ?? "map failed",
      };
    }
    const links = r.data?.links ?? [];
    return ok(
      `Found ${links.length} links from ${url}:\n${links.slice(0, 200).join("\n")}`,
      { url, links },
    );
  },
};

// ─── firecrawl_crawl ────────────────────────────────────────────────────────
export const firecrawlCrawl: ToolDef = {
  name: "firecrawl_crawl",
  description:
    "Starts an asynchronous deep crawl of a domain. Returns a job id. Page limit is capped at 500 by the platform (Free-tier budget). External links and subdomains are never followed. Common nav/utility paths (/login, /cart, /category/, /tag/, /api/) are pre-filtered.",
  domain: "web",
  schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Seed URL to crawl from." },
      limit: { type: "number", description: "Max pages to fetch. Capped at 500." },
      maxDiscoveryDepth: {
        type: "number",
        description: "How deep from the seed to follow links. Capped at 4.",
      },
      includePaths: {
        type: "array",
        items: { type: "string" },
        description:
          'Optional URL-path prefixes to include (e.g. ["/docs/", "/blog/"]).',
      },
      excludePaths: {
        type: "array",
        items: { type: "string" },
        description: "Optional URL-path prefixes to exclude.",
      },
    },
    required: ["url"],
  },
  async execute(params, ctx) {
    const url = requireString(params, "url");
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("firecrawl_crawl");

    // Hard guardrails — danger knobs are forced here, never trusted from input.
    const safe: FcCrawlArgs = {
      url,
      limit: Math.min(optNum(params, "limit") ?? 50, FC_HARD_PAGE_CAP),
      maxDiscoveryDepth: Math.min(
        optNum(params, "maxDiscoveryDepth") ?? 2,
        FC_HARD_DEPTH_CAP,
      ),
      allowExternalLinks: false,
      allowSubdomains: false,
      ignoreQueryParameters: true,
      includePaths: optStringArray(params, "includePaths"),
      excludePaths: [
        ...(optStringArray(params, "excludePaths") ?? []),
        ...FC_NAV_EXCLUDE_DEFAULTS,
      ],
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    };
    const r = await conn.crawl(safe);
    if (!r.success || !r.id) {
      return {
        ok: false,
        content: `Firecrawl crawl could not start (${r.error ?? "no job id returned"}).`,
        error: r.error ?? "crawl failed to start",
      };
    }
    return ok(
      `Crawl started for ${url}. Job id: ${r.id}. Cap: ${safe.limit} pages, depth ${safe.maxDiscoveryDepth}. External links and subdomains will not be followed. Poll with firecrawl_crawl + the job id to retrieve pages once status='completed'.`,
      {
        jobId: r.id,
        url,
        limit: safe.limit,
        maxDiscoveryDepth: safe.maxDiscoveryDepth,
      },
    );
  },
};

// ─── firecrawl_extract ──────────────────────────────────────────────────────
export const firecrawlExtract: ToolDef = {
  name: "firecrawl_extract",
  description:
    "Pulls structured data out of one or more URLs using a JSON schema and/or a natural-language prompt. Use when you need typed fields (names, dates, prices) rather than raw markdown. Limited to 20 URLs per call.",
  domain: "web",
  schema: {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description: "URLs to extract from (max 20).",
      },
      prompt: {
        type: "string",
        description: "Natural-language description of what to extract.",
      },
      schema: {
        type: "object",
        description: "Optional JSON Schema describing the expected output shape.",
      },
    },
    required: ["urls"],
  },
  async execute(params, ctx) {
    const urls = optStringArray(params, "urls");
    if (!urls || urls.length === 0) {
      return {
        ok: false,
        content: 'firecrawl_extract requires a non-empty "urls" array.',
        error: "missing urls",
      };
    }
    const prompt = typeof params.prompt === "string" ? params.prompt : undefined;
    const schema =
      params.schema && typeof params.schema === "object"
        ? (params.schema as object)
        : undefined;
    if (!prompt && !schema) {
      return {
        ok: false,
        content: 'firecrawl_extract requires either a "prompt" or a JSON "schema".',
        error: "missing prompt and schema",
      };
    }
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("firecrawl_extract");

    const cappedUrls = urls.slice(0, FC_EXTRACT_MAX_URLS);
    const r = await conn.extract({
      urls: cappedUrls,
      prompt,
      schema,
      enableWebSearch: optBool(params, "enableWebSearch"),
    });
    if (!r.success) {
      return {
        ok: false,
        content: `Firecrawl extract did not return data (${r.error ?? "no detail"}).`,
        error: r.error ?? "extract failed",
      };
    }
    const extracted = r.data?.data ?? null;
    const payload = JSON.stringify(extracted).slice(0, FC_EXTRACT_TRUNCATE);
    return ok(payload, { urls: cappedUrls, extracted });
  },
};

// ─── firecrawl_search ───────────────────────────────────────────────────────
export const firecrawlSearch: ToolDef = {
  name: "firecrawl_search",
  description:
    "Searches the web and returns top results. Optionally scrapes the result pages in the same call so you get titles + URLs + markdown content together.",
  domain: "web",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query." },
      limit: { type: "number", description: "Max results to return. Default 5." },
    },
    required: ["query"],
  },
  async execute(params, ctx) {
    const query = requireString(params, "query");
    const conn = await resolveConnector(ctx);
    if (!conn) return notConnected("firecrawl_search");

    const r = await conn.search({ query, limit: optNum(params, "limit") ?? 5 });
    if (!r.success) {
      return {
        ok: false,
        content: `Firecrawl search returned no results (${r.error ?? "no detail"}).`,
        error: r.error ?? "search failed",
      };
    }
    const items = r.data?.data ?? [];
    const formatted = items
      .map((it, i) => {
        const tail = it.markdown
          ? "\n   " +
            it.markdown.slice(0, 240).replace(/\s+/g, " ") +
            (it.markdown.length > 240 ? "…" : "")
          : "";
        return `${i + 1}. ${it.title ?? "(untitled)"} — ${it.url}${tail}`;
      })
      .join("\n");
    return ok(formatted || `No results for "${query}".`, { query, results: items });
  },
};

// ─── exported array ─────────────────────────────────────────────────────────
export const researchTools: ToolDef[] = [
  firecrawlScrape,
  firecrawlMap,
  firecrawlCrawl,
  firecrawlExtract,
  firecrawlSearch,
];
