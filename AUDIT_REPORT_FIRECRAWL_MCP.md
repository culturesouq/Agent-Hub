# Firecrawl MCP Integration Audit — OpSoul

Date: 2026-05-31
Branch context: prior `feat/mcp-runtime-layer` has been merged into `main` (MCP runtime is live; `artifacts/opsoul-api/src/utils/mcpServer.ts` + `toolRegistry.ts` + `routes/mcp.ts` are all in `main`).

---

## 1. Recommendation (≤150 words)

**Add Firecrawl as five thin, in-process universal tools (`firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, `firecrawl_extract`, `firecrawl_search`) inside `toolRegistry.ts` + `toolHandlers.ts`, wrapping the Firecrawl REST API directly. Do NOT bolt on the official `firecrawl-mcp` server-as-a-process.**

Reason: OpSoul's MCP layer already exposes its own toolset over `/mcp` and consumes those tools internally through `dispatchTool()`. Running a second MCP server inside the API process would mean an MCP-client-talking-to-an-MCP-server loop for every Vael crawl — extra hop, extra failure surface, no benefit. The thin REST wrapper drops Firecrawl into the same shape as every other Wave-3 tool (`gmail_send`, `notion_search`), so external MCP clients (Hajeri, Claude) automatically get it for free via the existing `/mcp` endpoint.

Recommended tier: **Standard ($83/mo billed yearly, 100K credits, 50 concurrent)**. Start here; Free/Hobby will hit `/crawl` 15-req/min and 5-concurrent ceilings the first time Vael runs a single 1,000-page SRAG ingestion.

---

## 2. Integration Plan

### Files Touched

| File | Change |
|---|---|
| `artifacts/opsoul-api/src/utils/firecrawl.ts` | **NEW.** Thin REST client (~120 lines). Reads `FIRECRAWL_API_KEY` from env. No credential branching per operator. Mirrors the shape of `utils/webSearch.ts`. |
| `artifacts/opsoul-api/src/utils/toolRegistry.ts` | Append 5 new `RegisteredTool` entries to `UNIVERSAL_TOOLS` (Wave 4 section). All `availability: 'web'` (gated on `FIRECRAWL_API_KEY` present). |
| `artifacts/opsoul-api/src/utils/toolHandlers.ts` | Add 5 `handleFirecrawl*` functions + 5 new `case` lines in `dispatchTool()`. Each handler: parse args → call `firecrawl.ts` → format result → return. SRAG-bound handlers (`firecrawl_crawl`, `firecrawl_extract`) additionally route through `persistKbSeedEntry()` per page when caller is Vael (operator-id check at handler level). |
| `artifacts/opsoul-api/src/utils/capabilityEngine.ts` | Add `isFirecrawlAvailable(): boolean { return !!process.env.FIRECRAWL_API_KEY; }`. |
| `artifacts/opsoul-api/src/routes/mcp.ts` | Pass `hasFirecrawl: isFirecrawlAvailable()` to `createMcpServerForContext` (same pattern as `hasWebSearch`). |
| `artifacts/opsoul-api/src/utils/toolRegistry.ts` (`ToolContext`) | Add `hasFirecrawl: boolean` field; update `isAvailable()` to honour a new availability bucket `'firecrawl'` (or reuse `'web'` if you don't want the new bucket — see decision note). |
| `.env` (NOT committed) | Owner adds `FIRECRAWL_API_KEY=fc-…`. Pattern: identical to existing `SERPER_API_KEY`. |

**Decision note — availability bucket:** Cleanest is a new `'firecrawl'` availability value (separate gate from `'web'`). Reasoning: web_search (Serper) and Firecrawl are independent infrastructure; either can fail or be disabled without affecting the other. Single line change in `toolRegistry.ts` + `mcpServer.ts`.

### Code skeleton

```ts
// artifacts/opsoul-api/src/utils/firecrawl.ts
const FIRECRAWL_BASE = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev';

export function isFirecrawlAvailable(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}

interface FcResponse<T> { success: boolean; data?: T; error?: string; id?: string }

async function fcPost<T>(path: string, body: unknown): Promise<FcResponse<T>> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { success: false, error: 'FIRECRAWL_API_KEY not configured' };
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { success: false, error: `HTTP ${res.status}: ${await res.text()}` };
  return res.json() as Promise<FcResponse<T>>;
}

async function fcGet<T>(path: string): Promise<FcResponse<T>> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { success: false, error: 'FIRECRAWL_API_KEY not configured' };
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
  return res.json() as Promise<FcResponse<T>>;
}

// ─── Public API surface ────────────────────────────────────────────────

export interface ScrapeArgs   { url: string; formats?: ('markdown'|'html'|'json')[]; onlyMainContent?: boolean }
export interface MapArgs      { url: string; search?: string; limit?: number }
export interface CrawlArgs    { url: string; limit?: number; maxDiscoveryDepth?: number;
                                includePaths?: string[]; excludePaths?: string[];
                                allowExternalLinks?: boolean; allowSubdomains?: boolean;
                                ignoreQueryParameters?: boolean;
                                scrapeOptions?: { formats?: string[]; onlyMainContent?: boolean } }
export interface ExtractArgs  { urls: string[]; prompt?: string; schema?: object; enableWebSearch?: boolean }
export interface SearchArgs   { query: string; limit?: number;
                                scrapeOptions?: { formats?: string[] } }

export const firecrawl = {
  scrape:  (a: ScrapeArgs)  => fcPost<{ markdown?: string; html?: string; json?: unknown; metadata?: any }>('/v2/scrape',  a),
  map:     (a: MapArgs)     => fcPost<{ links: string[] }>('/v2/map',     a),
  // crawl is async; returns { id }. Caller polls status.
  crawlBegin:  (a: CrawlArgs)   => fcPost<{ id: string; url: string }>('/v2/crawl',   a),
  crawlStatus: (id: string)     => fcGet<{ status: 'scraping'|'completed'|'failed';
                                           completed: number; total: number; creditsUsed: number;
                                           data?: Array<{ markdown?: string; metadata?: { sourceURL?: string; title?: string } }> }>(`/v2/crawl/${encodeURIComponent(id)}`),
  crawlStop:   (id: string)     => fcPost<{ status: string }>(`/v2/crawl/${encodeURIComponent(id)}/cancel`, {}),
  extract: (a: ExtractArgs) => fcPost<{ data: unknown; sources?: Record<string, string[]> }>('/v2/extract', a),
  search:  (a: SearchArgs)  => fcPost<{ data: Array<{ url: string; title?: string; markdown?: string }> }>('/v2/search', a),
};
```

```ts
// artifacts/opsoul-api/src/utils/toolHandlers.ts — Wave 4 additions
async function handleFirecrawlScrape(rawArgs: string, _ctx: ToolHandlerContext): Promise<ToolResult> {
  const a = parseArgs<ScrapeArgs>(rawArgs);
  if (!a.url) return { content: 'firecrawl_scrape requires "url".', meta: { terminateLoop: true } };
  const r = await firecrawl.scrape({ formats: ['markdown'], onlyMainContent: true, ...a });
  if (!r.success) return { content: `Firecrawl scrape failed: ${r.error}` };
  // Truncate to keep inside LLM context budget
  return { content: (r.data?.markdown ?? '').slice(0, 12_000) };
}

async function handleFirecrawlCrawl(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const a = parseArgs<CrawlArgs & { autoSeedKb?: boolean }>(rawArgs);
  if (!a.url) return { content: 'firecrawl_crawl requires "url".', meta: { terminateLoop: true } };

  // Hard guardrails — NEVER let operator-driven crawl run unbounded.
  // Per [[srag]] nav-page pre-filter bug: include defensive excludePaths.
  const safe: CrawlArgs = {
    url: a.url,
    limit: Math.min(a.limit ?? 50, 500),               // hard cap 500
    maxDiscoveryDepth: Math.min(a.maxDiscoveryDepth ?? 2, 4),
    allowExternalLinks: false,                          // ALWAYS false — link drift fix
    allowSubdomains:    a.allowSubdomains ?? false,
    ignoreQueryParameters: a.ignoreQueryParameters ?? true,
    includePaths: a.includePaths,
    excludePaths: [
      ...(a.excludePaths ?? []),
      // Pre-filter nav/utility pages SRAG kept ingesting last crawl
      '/login', '/signup', '/cart', '/checkout', '/account',
      '/privacy', '/terms', '/cookie', '/sitemap',
      '/search', '/tag/', '/category/', '/author/', '/page/',
    ],
    scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
  };

  const begin = await firecrawl.crawlBegin(safe);
  if (!begin.success || !begin.id) return { content: `Firecrawl crawl could not start: ${begin.error}` };

  return { content: `Crawl started. Job id: ${begin.id}. Use firecrawl_crawl_status with this id to fetch results.` };
}

async function handleFirecrawlExtract(rawArgs: string, ctx: ToolHandlerContext): Promise<ToolResult> {
  const a = parseArgs<ExtractArgs>(rawArgs);
  if (!a.urls?.length || !a.prompt) {
    return { content: 'firecrawl_extract requires "urls" and "prompt".', meta: { terminateLoop: true } };
  }
  const r = await firecrawl.extract({ ...a, showSources: true } as any);
  if (!r.success) return { content: `Firecrawl extract failed: ${r.error}` };
  return { content: JSON.stringify(r.data).slice(0, 16_000) };
}
```

`dispatchTool()` gets 5 new `case` lines mirroring the Wave-3 pattern. No changes to `mcpServer.ts` or `routes/mcp.ts` beyond the `hasFirecrawl` flag — external MCP clients pick up the new tools automatically.

---

## 3. Per-Operator Usage

| Operator | Primary endpoint | Typical pattern | Volume estimate (pages/mo) |
|---|---|---|---|
| **Vael** (SRAG) | `firecrawl_crawl` + `firecrawl_extract` | One `crawl` per domain (limit 200-500), pipe each returned page through Vael's existing `kbIntake.verifyAndStore` pipeline. `extract` for structured ingest (entity + insight types) when source has known schema (gov regs, company pages). | **30,000-60,000** (heaviest user — the SRAG tap) |
| **Nahil** (Make it in Emirates) | `firecrawl_scrape` + `firecrawl_search` | On-demand scrapes of UAE gov/MoE/ICP/MoIAT pages; periodic `crawl` of Tamm/MoFAIC regulation updates. Owner-set seed list. | **3,000-8,000** |
| **Istishari** (Foundermoment) | `firecrawl_search` + `firecrawl_scrape` | Founder interviews, Crunchbase-style profiles (when accessible), startup-ecosystem newsletters (a16z, Stratechery, etc.). Mostly point scrapes; occasional small `crawl` of a single founder blog. | **2,000-5,000** |
| **Bani** (builder) | `firecrawl_scrape` (rare) | Reading docs / GitHub READMEs / API references when user asks. No SRAG ingestion. | **<500** |

**Total estimate: ~40K-75K credits/month at owner's current operator activity.** Standard tier (100K credits) gives ~30-60% headroom.

---

## 4. Cost Projection

| Scenario | Pages/mo | Tier (yearly billing) | Headroom |
|---|---|---|---|
| Conservative (current activity) | 40K | **Standard $83** | 60% |
| Realistic (Vael runs 1-2 SRAG batches/wk) | 60K-75K | **Standard $83** | 25-40% |
| Heavy (Vael-as-Service pilot adds 1 customer) | 120K+ | **Growth $333** | varies |

**Recommendation: start Standard ($83/mo yearly = $99/mo monthly).** Upgrade to Growth only when Vael-as-Service onboards a paying customer (cost recovered from that revenue).

Important credit-math notes:
- `/scrape`, `/crawl` page, `/map` = **1 credit each**.
- `/search` = **2 credits per 10 results**.
- `/extract` is priced separately by token — confirm with Firecrawl support before heavy use. Suggest setting a per-call quota cap in the handler (e.g. max 20 URLs per `extract` call).
- A 200-page Vael crawl = 200 credits. A 500-page max-cap crawl = 500 credits. Vael's KB pipeline filters most pages out via PII/duplicate/contradiction checks, but Firecrawl still bills the fetch.

---

## 5. Rate-Limit + Concurrency Strategy

Standard tier ceilings: **50 crawls/min, 500 scrapes/min, 50 concurrent browsers, 100K queued jobs.** Operator load against those:

- Vael's `crawl` is the only endpoint at risk — operator may kick off a 500-page job while Nahil and Istishari are scraping. 50/min crawl ceiling is comfortable if only one Vael job runs at a time.
- Scrape and search ceilings (500/min, 250/min) are unreachable at owner's current scale.

**Mitigation — add a single shared semaphore in `firecrawl.ts`:**

```ts
// In-process queue: max N concurrent Firecrawl calls
let inflight = 0;
const QUEUE: Array<() => void> = [];
const MAX_INFLIGHT = Number(process.env.FIRECRAWL_MAX_CONCURRENT ?? 8);

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) await new Promise<void>(r => QUEUE.push(r));
  inflight++;
  try { return await fn(); }
  finally {
    inflight--;
    const next = QUEUE.shift();
    if (next) next();
  }
}
```

Wrap every `fcPost` / `fcGet` in `withSlot()`. Keeps 4 operators from collectively saturating Firecrawl while leaving headroom for Vael's crawl streams.

**Per-operator daily quota (recommended, not strictly required):** track Firecrawl credit consumption per `operatorId` in a small `operator_firecrawl_usage` table (date, operatorId, credits). Hard-stop Vael at e.g. 5,000 credits/day to prevent a runaway crawl from burning the month's budget in one afternoon. Owner sees the count under Vael's Skills tab.

**Stop Crawl button (already in SRAG roadmap):** must call `firecrawl.crawlStop(jobId)` — exposed as `firecrawl_crawl_stop` tool so Vael can self-stop, *and* the SRAG admin UI calls the same endpoint when owner clicks Stop.

---

## 6. SRAG Pipeline Integration (addresses the two pre-existing critical bugs)

Per `[[srag]]`: nav-page pre-filter + external-link drift caused $25 of wasted credits last crawl. Both are fixed at the **`handleFirecrawlCrawl` boundary, not in SRAG itself**:

### Bug 1 — nav-page pre-filter

Nav pages (login, cart, terms, category indexes) were being scraped, embedded, and consuming pipeline capacity even though they carry no usable content.

**Fix:** the `excludePaths` defaults in `handleFirecrawlCrawl` (see skeleton above) block the most common nav paths at the Firecrawl level — they're never fetched, so they never reach SRAG ingestion. Plus a post-fetch shape check in the handler:

```ts
// In the crawlStatus polling result, before kbIntake:
function looksLikeNavPage(page: { markdown?: string; metadata?: any }): boolean {
  const md = page.markdown ?? '';
  if (md.length < 300) return true;                              // too short to be content
  const linkRatio = (md.match(/\]\(http/g)?.length ?? 0) / Math.max(md.length, 1) * 1000;
  if (linkRatio > 8) return true;                                // mostly links = nav
  const title = (page.metadata?.title ?? '').toLowerCase();
  if (/^(login|sign in|cart|checkout|search results)$/.test(title)) return true;
  return false;
}
```

### Bug 2 — external link drift

Crawler followed outbound links and started indexing the entire internet from a single seed.

**Fix:** `allowExternalLinks: false` is hard-coded (not user-settable) inside `handleFirecrawlCrawl`. The arg is removed from the schema sent to the LLM so even a misbehaving operator can't override. Subdomain following defaults to false too.

### Vael flow into SRAG

1. Vael calls `firecrawl_crawl` with a single seed domain. Handler returns job id.
2. Vael calls `firecrawl_crawl_status` periodically (or once at completion). Handler:
   - Fetches the crawled pages from Firecrawl.
   - Runs each through `looksLikeNavPage()` — filter out.
   - For each surviving page, calls existing `verifyAndStore()` from `kbIntake.ts` with `(operatorId=vaelId, ownerId, content=page.markdown, sourceUrl=page.metadata.sourceURL, sourceName=domain, mandate=vaelMandate)`.
   - Returns to LLM: `"Ingested N pages into SRAG, skipped M nav-like pages, K rejected for PII/duplicates."`
3. Existing Vael cron picks up the new `is_pipeline_intake=true, status='pending'` rows and runs full verification — **no SRAG schema change required**.

### Things NOT to do

- Don't bypass `verifyAndStore()`. Owner's "Crawl is owner-side (not OpSoul-side)" note in SoT was about *raw crawl dumps without filtering*. The recommendation here keeps the existing 5-check pipeline (durability, PII, dedup, contradiction, source trust) as the gate — Firecrawl is the source tap, kbIntake is still the door.
- Don't auto-seed without `looksLikeNavPage()`. The reason the last crawl was a $25 waste was that nav pages reached the embedding step.
- Don't expose `allowExternalLinks` as an LLM-controllable parameter. Hardcode false.

---

## 7. Vael-as-Service Forward Compatibility

Per `[[srag-vael-as-service]]`: future commercial offering where establishments hire Vael to verify/dedup their corpus. Two compatibility questions:

### Auth model

Single platform-wide `FIRECRAWL_API_KEY` works for **internal** use (Vael, Nahil, Istishari, Bani all under owner's account). For Vael-as-Service customers, three viable options:

| Model | Pros | Cons |
|---|---|---|
| **A. Shared owner key, bill customer for credits** | Zero customer setup, OpSoul controls budget caps. | OpSoul fronts the Firecrawl bill. Need usage accounting. |
| **B. Per-customer Firecrawl key via `operatorSecretsTable`** | Customer pays Firecrawl directly. Clean cost separation. | Customer onboarding friction. Each customer needs a Firecrawl account. |
| **C. Hybrid: shared key with hard per-customer credit cap** | OpSoul keeps the relationship, marks up credits as part of subscription. | Need per-customer quota tracking (already needed anyway — see §5). |

Recommendation: **build A now (simpler), with the per-operator quota table from §5 already in place**. Switch to C when first paying customer signs. The handler change is one `if (operator.tier === 'service') keyName = 'service_firecrawl_key'` line — easy upgrade path.

### Code surface

No changes required. The five `handleFirecrawl*` functions are identical for owner-operators and service-operators. The only forward-compat seam is `fcPost()` reading the API key from env vs from `operatorSecretsTable` — wrap that in a single `getFirecrawlKey(operatorId)` helper now even if the implementation always returns `process.env.FIRECRAWL_API_KEY` today.

### Pricing model

Standard ($83/mo) covers internal use and the first 1-2 service customers if each consumes ≤25K credits/month. Bumping to Growth ($333/mo, 500K credits) is the inflection point — at 5 paying customers averaging 50K credits each, Growth pays for itself with credit-markup margin (typical SaaS markup on infra is 2-3x).

---

## Risks + Mitigations Summary

| Risk | Mitigation |
|---|---|
| Vael crawls something unbounded, burns month's credits in one job | Hard `limit: 500` cap in handler + per-operator daily quota table + `allowExternalLinks: false` hardcode |
| External MCP clients (Hajeri, Claude) start calling `firecrawl_crawl` without rate awareness | Already covered — shared semaphore in `firecrawl.ts` applies to ALL callers, internal or MCP |
| Firecrawl API key leak | Server-side only — never sent to LLM. Same pattern as `SERPER_API_KEY` already in production |
| Nav-page bug from last SRAG crawl recurs | `excludePaths` defaults + `looksLikeNavPage()` post-filter — both in handler, both default-on |
| Extract endpoint billing is per-token, not per-URL — surprise cost | Per-call cap (`urls.length ≤ 20`) + confirm pricing with Firecrawl support before enabling for Vael batch use |
| Owner direction (May 2026 SoT) was "crawl owner-side, not OpSoul-side" | Recommendation respects that intent — Firecrawl is the source tap, but `verifyAndStore()` 5-check pipeline still gates everything reaching SRAG. Owner-side crawl was rejected because raw dumps bypassed verification; this design does not. |

---

## Appendix — Why Not the Official `firecrawl-mcp` Server

The Mendable team publishes `firecrawl-mcp` (npm `firecrawl-mcp`, runnable via `npx -y firecrawl-mcp`). It speaks MCP over stdio / SSE / HTTP-streamable. Considered and rejected because:

1. **OpSoul is already an MCP server.** Adding `firecrawl-mcp` would make the OpSoul Node process either (a) spawn a child stdio process for every Firecrawl call (slow, fragile), or (b) act as an MCP client to a separately-deployed `firecrawl-mcp` instance (extra deployment surface, network hop, transport mismatch).
2. **No persistence integration.** `firecrawl-mcp`'s tools return raw scrape output. OpSoul's value-add for Vael is the `kbIntake.verifyAndStore` pipeline — that requires intercepting the result inside an OpSoul handler, which is exactly what a thin REST wrapper does naturally.
3. **No per-operator quota tracking.** `firecrawl-mcp` has no notion of operator identity, so the §5 per-operator quota table would have to live outside it anyway — same code as if we'd written the REST wrapper from the start.
4. **Drift risk.** Vendor MCP servers evolve independently; staying close to the documented REST surface in a 120-line file is cheaper to maintain than tracking the vendor's tool-name changes.

The only scenario where the official MCP server wins is when OpSoul *isn't* the host — e.g. owner wants to use Firecrawl from Claude Desktop directly. That's a Claude Desktop config, not an OpSoul integration.
