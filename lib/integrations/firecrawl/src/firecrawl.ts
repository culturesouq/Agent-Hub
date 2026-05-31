/**
 * Firecrawl REST wrapper (thin) — package @workspace/integrations-firecrawl
 *
 * Why a thin REST wrapper and not the vendor's firecrawl-mcp server:
 *   OpSoul already IS an MCP server (see artifacts/opsoul-api/src/utils/mcpServer.ts).
 *   Bolting on the official firecrawl-mcp would make Node spawn a child stdio
 *   process per crawl OR proxy MCP-to-MCP — extra hop, extra failure surface,
 *   zero benefit. By exposing the five Firecrawl operations as in-process REST
 *   calls we drop them straight into the existing toolRegistry shape used by
 *   chat.ts and consumed via /mcp for external MCP clients (Hajeri, Claude
 *   Desktop) automatically.
 *
 * Free tier (D-6 approved by owner 2026-05-31):
 *   - 500 pages / month
 *   - 15 requests / minute
 *   - 10 concurrent
 *   Enforced via FREE_TIER_MAX_CONCURRENT below. Quota / per-day per-operator
 *   tracking is at the toolHandlers + DB layer (operator_firecrawl_usage table).
 *
 * Forward-compat for Vael-as-Service ([[srag-vael-as-service]]):
 *   getFirecrawlKey(operatorId?) is the one seam we control today. The body
 *   only reads process.env.FIRECRAWL_API_KEY currently; switching to a per-
 *   operator key from operator_secrets is a one-line change later, no caller
 *   surface change.
 *
 * No keys are generated or stored in this file. The owner provisions
 * FIRECRAWL_API_KEY in .env.
 */

const FIRECRAWL_BASE: string = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev';

// Free tier ceiling — leave room for other simultaneous traffic. If a future
// upgrade (Standard / Growth) is approved this can be raised via the env var.
const FREE_TIER_MAX_CONCURRENT: number = Number(process.env.FIRECRAWL_MAX_CONCURRENT ?? 10);

/**
 * Resolve the API key for a given operator. Today the body always returns
 * the platform-wide env key; the operatorId arg is the forward-compat seam
 * for Vael-as-Service (per-customer key from operator_secrets).
 */
export function getFirecrawlKey(_operatorId?: string): string | undefined {
  return process.env.FIRECRAWL_API_KEY;
}

export function isFirecrawlAvailable(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}

// ─── Semaphore (process-wide) ─────────────────────────────────────────────
// Bounds *all* Firecrawl calls (internal + external MCP clients) so 4
// operators + Hajeri + Claude Desktop can't collectively saturate the
// Free-tier 15 req/min ceiling.
let inflight = 0;
const queue: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= FREE_TIER_MAX_CONCURRENT) {
    await new Promise<void>(resolve => queue.push(resolve));
  }
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
    const next = queue.shift();
    if (next) next();
  }
}

// ─── Result envelope ──────────────────────────────────────────────────────
export interface FcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** /crawl returns the job id at top level on POST */
  id?: string;
  /** /crawl/{id} GET shape carries status fields */
  status?: 'scraping' | 'completed' | 'failed' | string;
}

// ─── Internal HTTP helpers ────────────────────────────────────────────────
async function fcPost<T>(path: string, body: unknown, operatorId?: string): Promise<FcResponse<T>> {
  return withSlot(async () => {
    const key = getFirecrawlKey(operatorId);
    if (!key) return { success: false, error: 'FIRECRAWL_API_KEY not configured' };

    const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });

    if (res.status === 429) {
      return {
        success: false,
        error: 'Firecrawl rate-limit hit (Free tier is 15 req/min). Wait a moment and retry.',
      };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `Firecrawl ${path} HTTP ${res.status}: ${text.slice(0, 500)}` };
    }
    return (await res.json()) as FcResponse<T>;
  });
}

async function fcGet<T>(path: string, operatorId?: string): Promise<FcResponse<T>> {
  return withSlot(async () => {
    const key = getFirecrawlKey(operatorId);
    if (!key) return { success: false, error: 'FIRECRAWL_API_KEY not configured' };

    const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    if (res.status === 429) {
      return {
        success: false,
        error: 'Firecrawl rate-limit hit (Free tier is 15 req/min). Wait a moment and retry.',
      };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `Firecrawl ${path} HTTP ${res.status}: ${text.slice(0, 500)}` };
    }
    return (await res.json()) as FcResponse<T>;
  });
}

// ─── Public API surface ───────────────────────────────────────────────────

export interface ScrapeArgs {
  url: string;
  formats?: Array<'markdown' | 'html' | 'json'>;
  onlyMainContent?: boolean;
}

export interface MapArgs {
  url: string;
  search?: string;
  limit?: number;
}

export interface CrawlArgs {
  url: string;
  /** HARD-CAPPED to 500 by the tool handler (Free tier monthly budget) */
  limit?: number;
  maxDiscoveryDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  /** HARDCODED false at the handler layer — DO NOT expose to LLM */
  allowExternalLinks?: boolean;
  allowSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
  scrapeOptions?: { formats?: string[]; onlyMainContent?: boolean };
}

export interface CrawlStatusResult {
  status: 'scraping' | 'completed' | 'failed' | string;
  completed: number;
  total: number;
  creditsUsed: number;
  data?: Array<{ markdown?: string; metadata?: { sourceURL?: string; title?: string } }>;
}

export interface ExtractArgs {
  urls: string[];
  prompt?: string;
  schema?: object;
  enableWebSearch?: boolean;
}

export interface SearchArgs {
  query: string;
  limit?: number;
  scrapeOptions?: { formats?: string[] };
}

export const firecrawl = {
  scrape: (args: ScrapeArgs, operatorId?: string) =>
    fcPost<{ markdown?: string; html?: string; json?: unknown; metadata?: unknown }>('/v2/scrape', args, operatorId),

  map: (args: MapArgs, operatorId?: string) =>
    fcPost<{ links: string[] }>('/v2/map', args, operatorId),

  /** Async — returns a job id. Caller must poll crawlStatus. */
  crawl: (args: CrawlArgs, operatorId?: string) =>
    fcPost<{ id: string; url: string }>('/v2/crawl', args, operatorId),

  crawlStatus: (jobId: string, operatorId?: string) =>
    fcGet<CrawlStatusResult>(`/v2/crawl/${encodeURIComponent(jobId)}`, operatorId),

  crawlStop: (jobId: string, operatorId?: string) =>
    fcPost<{ status: string }>(`/v2/crawl/${encodeURIComponent(jobId)}/cancel`, {}, operatorId),

  extract: (args: ExtractArgs, operatorId?: string) =>
    fcPost<{ data: unknown; sources?: Record<string, string[]> }>('/v2/extract', args, operatorId),

  search: (args: SearchArgs, operatorId?: string) =>
    fcPost<{ data: Array<{ url: string; title?: string; markdown?: string }> }>('/v2/search', args, operatorId),
};

export type Firecrawl = typeof firecrawl;
