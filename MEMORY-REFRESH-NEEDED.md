# Memory refresh list — Phase 1B + 2B (2026-05-31)

These memory files need to be updated by the main-session agent because they describe state that is no longer accurate. Phase 1B + 2B confirmed via direct code read.

## Resolved bugs / completed work

- **`[[opsoul-03-integer-bug]]`** → resolved at commit `d52b338` (2026-05-24).
  Both flagged call sites are fixed:
  - `utils/toolHandlers.ts:785` — MCP `kb_search` tool: `0.3 → 30`
  - `cron/tasksCron.ts:79` — scheduled-task KB retrieval: `0.3 → 30`
  All other write paths to `operator_kb.confidence_score` use 75-85 integer
  scale (verified Phase 0 audit). The memory currently still describes the
  bug as "under investigation" needing a stack trace; that state is stale.

- **`[[opsoul-mcp-buildout]]`** → MCP shipped on `main`; the "paused before
  chat.ts refactor" note is no longer accurate.
  Phase 0 + architecture audits confirm:
  - `@modelcontextprotocol/sdk` is a real production dependency
  - `utils/mcpServer.ts` (138 lines) wraps the universal `toolRegistry.ts`
    as an MCP Server with `tools/list` + `tools/call`
  - `routes/mcp.ts` (147 lines) mounts at
    `/api/operators/:operatorId/conversations/:convId/mcp` with stateless
    `StreamableHTTPServerTransport`
  - `chat.ts` calls `dispatchTool` + `listToolsForContext` from the same
    registry — the chat.ts refactor the memory warns is paused has shipped
  - Both internal chat (chat.ts) and external MCP (mcpServer.ts) dispatch
    through the SAME `dispatchTool` handler
  Memory needs an "MCP shipped — chat.ts refactor complete" update.

## Phase 2B additions (2026-05-31 — integration + quality pass)

- **`[[srag]]`** → "must fix nav-page pre-filter + external link drift" entry
  is now partially obsolete on the integration branch. The Stop-Crawl POST
  the memory says is missing has shipped end-to-end:
  - UI button in `KbSection.tsx` (Phase 2 Commit 8)
  - Backend route at `POST /api/operators/:operatorId/firecrawl/crawl/:jobId/stop`
    wrapping `firecrawl.crawlStop()` (Phase 2B Commit 1)
  - 503 on missing API key, 502 with structured payload on Firecrawl error
  The nav-page pre-filter + external-link drift fixes ALSO already shipped:
  - `lib/integrations/firecrawl/src/looksLikeNavPage.ts` post-filter
  - `allowExternalLinks: false` + 14-entry nav-path excludePaths hardcoded
    in `toolHandlers.ts` firecrawl handlers (NOT exposed via tool schema)
  Memory needs "Stop-Crawl + nav-filter + external-link guards all shipped"
  update.

- **`[[opsoul-runtime-layer]]`** + **`[[opsoul-mcp-buildout]]`** → both already
  flagged as outdated above; the firecrawl integration is a concrete instance
  of "runtime layer" extending the MCP substrate. Five new registered tools
  (`firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, `firecrawl_extract`,
  `firecrawl_search`) ship through the same registry → handler → toolset
  pipeline the other tools use.

- **`[[no-fallbacks]]`** → memory should note the `system_error` role convention
  Phase 1B introduced is now consistently used everywhere (chat.ts, public-chat,
  telegram-webhook, whatsapp-webhook on error paths). Phase 2B verified zero
  new synthetic-string slips and removed one (tasksCron.ts mid-prompt assistant
  acks — replaced with role:'system' KB/memory injection).

## Notes

- Phase 1B + 2B did not change the underlying state of the `[[opsoul-03-integer-bug]]`
  or `[[opsoul-mcp-buildout]]` bugs — both were already fixed on `main` before
  Phase 1B began. This list exists to prompt the main-session agent to refresh
  the memory entries that lag reality.

- All other memory entries in MEMORY.md were spot-checked during Phase 1B + 2B
  and remain accurate; only the entries above need refresh.
