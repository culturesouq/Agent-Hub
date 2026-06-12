/**
 * Shared helpers for tool implementations + the pluggable connector/provider
 * interfaces tools resolve from `ctx`.
 *
 * Design rule (PLATFORM_SDK_SOT): never hard-code one vendor. Every external
 * dependency is a clean adapter interface with a sensible default that reads
 * its endpoint/key from `ctx.secrets`. A consumer swaps the backend by putting
 * a different implementation on the context — no tool code changes.
 */

import type { ToolContext, ToolResult } from "@cultureyes/types";

// ─── ctx.connectors — the pluggable-backend bag ─────────────────────────────
//
// `ToolContext` from @cultureyes/types is the stable spine. Connectors are an
// optional, additive bag a deployment attaches to the same context object.
// Tools read them defensively (they may be absent) and fall back to a default
// HTTP adapter configured from `ctx.secrets`.

/** A web-search backend (Tavily, Exa, Serper, Brave, Perplexity, … — pluggable). */
export interface WebSearchProvider {
  name: string;
  search(query: string, opts?: { limit?: number }): Promise<WebSearchHit[]>;
}
export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
  /** Optional stance the source takes toward the query, if the provider scores it. */
  stance?: "confirms" | "contradicts" | "states";
}

/** A URL fetcher (HTTP, Firecrawl, Puppeteer, … — pluggable). */
export interface UrlFetcher {
  name: string;
  fetch(url: string): Promise<{ title?: string; text: string }>;
}

/** A relational/SQL backend (Postgres, SQLite, MySQL, BigQuery, … — pluggable). */
export interface DbConnector {
  name: string;
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

/** A knowledge-base backend (OpSoul KB, a docs store, … — pluggable). */
export interface KbConnector {
  name: string;
  lookup(query: string, opts?: { limit?: number }): Promise<KbEntry[]>;
}
export interface KbEntry {
  text: string;
  source?: string;
  score?: number;
}

/** A vector store (pgvector, Pinecone, Weaviate, Qdrant, … — pluggable). */
export interface VectorConnector {
  name: string;
  search(query: string, opts?: { k?: number }): Promise<VectorMatch[]>;
}
export interface VectorMatch {
  text: string;
  score: number;
  id?: string;
}

/** An append-only audit sink (DB table, SIEM, file, … — pluggable). */
export interface AuditSink {
  name: string;
  append(entry: Record<string, unknown>): Promise<void>;
}

/** A durable key/value store (the secure-storage substrate — pluggable). */
export interface StoreSink {
  name: string;
  put(key: string, value: unknown): Promise<void>;
}

/** A human-review queue (route_to_reviewer target — pluggable). */
export interface ReviewSink {
  name: string;
  enqueue(item: Record<string, unknown>): Promise<{ ticketId: string }>;
}

/** A notification sink (Slack, email, Telegram, webhook, … — pluggable). */
export interface NotifySink {
  name: string;
  send(channel: string, message: string): Promise<void>;
}

/** The optional connector bag a deployment attaches to the tool context. */
export interface ToolConnectors {
  webSearch?: WebSearchProvider;
  urlFetcher?: UrlFetcher;
  db?: DbConnector;
  kb?: KbConnector;
  vector?: VectorConnector;
  audit?: AuditSink;
  store?: StoreSink;
  review?: ReviewSink;
  notify?: NotifySink;
}

/** Context augmented with the optional connector bag (read by tools). */
export type ToolCtx = ToolContext & { connectors?: ToolConnectors };

/** Reads `ctx.connectors` without widening the public `ToolContext` type. */
export function connectors(ctx: ToolContext): ToolConnectors {
  return (ctx as ToolCtx).connectors ?? {};
}

// ─── param helpers ──────────────────────────────────────────────────────────

export function requireString(
  params: Record<string, unknown>,
  key: string,
): string {
  const v = params[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Missing required string parameter: ${key}`);
  }
  return v;
}

export function optionalNumber(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = params[key];
  return typeof v === "number" ? v : undefined;
}

export function ok(content: string, data?: unknown): ToolResult {
  return { ok: true, content, data };
}
