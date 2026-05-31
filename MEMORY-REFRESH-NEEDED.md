# Memory refresh list — Phase 1B (2026-05-31)

These memory files need to be updated by the main-session agent because they describe state that is no longer accurate. Phase 1B confirmed via direct code read.

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

## Notes

- Phase 1B did not change the underlying state of either bug — both were
  already fixed on `main` before Phase 1B began. This list exists only to
  prompt the main-session agent to refresh the memory entries that lag
  reality.

- All other memory entries in MEMORY.md were spot-checked during Phase 1B
  and remain accurate; only the two above need refresh.
