# Operator Station Rewrite — Summary Report

**Date:** 2026-05-22
**Source commit (live):** `319f273`
**Image:** `banistudioacr.azurecr.io/opsoul-api:station-rewrite-319f273`
**Revision:** `opsoul--0000068` (Healthy)
**Live URL:** `https://opsoul.mangoforest-5c22eab7.uaenorth.azurecontainerapps.io/`
**Smoke test:** `GET /api/models` → 200 OK

---

## TL;DR

- **MCP tool count: 12 → 57.**
- **3 new chat widgets:** connect-form, chart, table, mermaid.
- **Tasks:** real cron parser, hourly + custom expressions, edit + run-now.
- **Connections:** rewritten end-to-end. MCP endpoint surfaced. Channels folded inline. Two duplicate Channel pages deleted.
- **PDF upload bug fixed.** Image upload was already fine.
- **Growth health stops getting stuck.** Stale-cache recompute + raised baseline.
- **Patent layers untouched.** Soul, Layer 0/1/2 fields, systemPrompt assembly, KB content, archetypes, identity locks — zero modifications.

---

## What got fixed

### 1. PDF upload — `Failed to process file: pdfParse is not a function`
The package was bumped to `pdf-parse@2.4.5` which switched from a callable default export to a class-based API. The old resolver ended up with a non-callable namespace object. Switched to `new PDFParse({data}).getText()`. Images already worked (different branch).

### 2. Tasks "custom" schedule silently never ran
`computeNextRunAt('custom', ...)` returned null, so the first run set `nextRunAt = null` and the task never fired again. Replaced with a real expression parser supporting:
- `hourly` / `daily` / `weekly` (named)
- `every N minutes`, `every N hours`
- `at 09:00 daily`
- `at 14:30 on monday`
- Full 5-field cron expressions (`0 9 * * 1-5`)
- Validation at the API boundary so unparseable input returns a 400, not a silently dead task

### 3. Tasks could not be edited after creation
Backend PATCH always supported full edits — UI never called it. Edit dialog now wired (name, schedule, expression, prompt).

### 4. No way to run a task on demand
New `POST /:taskId/run-now` endpoint + run-now button (⚡) per task row. Uses the same `runSingleTask()` executor as the cron and the new MCP `run_task_now` tool — one code path, three triggers.

### 5. Telegram & WhatsApp duplicated across Connections + standalone Channels pages
The Connections inline cards were missing the HMAC App Secret management; the standalone pages had it. Two views, asymmetric features, one data row. Folded both into the Connections page with the full feature set inline. Deleted `TelegramChannelSection.tsx` + `WhatsAppChannelSection.tsx`. Dropped the bottom `Channels` nav group from `OperatorDetail.tsx`.

### 6. MCP endpoint never exposed in the UI
Backend has had MCP at `/api/operators/:id/conversations/:convId/mcp` since the May 19 deploy. Now surfaced at the top of Connections with copy button, JSON-RPC explainer, and method examples (`tools/list`, `tools/call`).

### 7. "Some operators always 100% health"
`GET /grow/self-awareness` returned the cached row without recomputing. Stale values persisted forever when a trigger silently failed. Now treats rows older than 6 hours as stale, recomputes inline, persists fresh. If recompute itself fails, returns the stale row with a note instead of 502'ing.

### 8. growActivity stuck at 50 (penalizing operators for correctly not changing)
Baseline lifted from 50 → 70 when no proposals have fired. Locked operators, drift-blocked operators, and RLHF-refusing models no longer get their overall health dragged down for not modifying themselves. Owner-approved proposals still reward to 100.

### 9. API Access showed both legacy + v1, with examples only for legacy
Dropped the legacy chat endpoint section entirely. Kept v1 only — Operator ID, public endpoint card, key creation with surface-type pills (guest / authenticated / crud), active keys list with revoke.

### 10. Stale "Coming Soon" tiles
Static Salesforce/Jira/Zapier/Stripe placeholders removed from Connections. If we ship one, it'll show as a working card.

---

## What got added

### Chat widget protocol
A new `opsoul-widget` fenced block in assistant messages triggers an inline widget render. `MarkdownMessage` detects the tag, parses JSON, dispatches via `WidgetBlock`. Parse-failure falls back to plain `<pre>` so a broken payload is visible, not silent. Supports four widget kinds:

- **`connect_form`** → `TokenDropCard` — inline form for the owner to drop a credential when the operator asks. Submits to `/operators/:id/integrations`. One protocol, many use cases.
- **`chart`** → `ChartCard` — bar / line / pie via Recharts. Responsive container.
- **`table`** → `TableCard` — semantic `<table>` with overflow scroll.
- **`mermaid`** → `MermaidCard` — source + copy + render-at-mermaid.live link. Inline rendering ships when mermaid-js is bundled (component swap only, no protocol change).

### 45 new MCP tools (total 12 → 57)

#### Wave 1 — Integration mgmt, memory, KB-learned, self, tasks (16 tools)
- `list_integrations`, `request_credential`, `connect_with_secret`, `disconnect_integration`, `list_secrets`
- `run_task_now`, `list_tasks`, `get_task_history`
- `store_memory`, `search_memory`, `list_memories` — same `storeMemory()` engine; **decay/retrieval pipeline preserved** (Layer 1/2, 0.55 threshold, importance scoring all intact)
- `kb_search` (both KBs), `kb_delete_learned` (**operator_kb only — owner_kb literally unreachable**, isSystem entries protected), `kb_pending_list`
- `get_self_info`, `list_conversations`

#### Wave 2 — Outbound comms, files, research (9 tools)
- `send_telegram`, `send_whatsapp`, `send_slack`, `notify_owner` — credentials never reach the LLM; helper `loadIntegration()` decrypts server-side
- `delete_file`, `append_to_file`, `download_to_workspace`
- `fetch_url`, `extract_pdf_text` — same pdf-parse v2 pipeline as the upload fix

#### Wave 2 (cont.) — Artifact renderers (3 tools)
- `render_chart`, `render_table`, `render_diagram` — emit `opsoul-widget` payloads, drawn by the Hub

#### Wave 3 — Connected-app first-class tools (17 tools)
All `availability:'integration'`, routed through the existing `executeHttpWithOAuth()` so Google OAuth refresh is automatic:
- **Gmail (3):** `gmail_send`, `gmail_search`, `gmail_read`
- **Calendar (2):** `calendar_create_event`, `calendar_list_events`
- **Drive (2):** `drive_search`, `drive_read_file`
- **GitHub (3):** `github_create_issue`, `github_search`, `github_read_file`
- **Notion (2):** `notion_search`, `notion_create_page`
- **Slack (1):** `slack_search` (sender ships in wave 2)
- **Linear (2):** `linear_create_issue`, `linear_search` — GraphQL
- **HubSpot (2):** `hubspot_search_contact`, `hubspot_create_deal`

### New Discord connector tile
PAT-token connection in the Connections catalog. First-class Discord tools deferrable to a follow-up.

### `runSingleTask()` extracted into a shared executor
Same function powers: hourly cron loop, `run_task_now` MCP tool, `POST /run-now` HTTP route. Single source of execution behavior.

### Skills section becomes live MCP catalog
Already pulled from `buildToolManifest()` — wave 1/2/3 tools showed up automatically. Wired `connectedIntegrations` into the manifest call so 'integration'-gated tools correctly appear only when the integration is connected. Added category tints for `memory`, `self`, `communication`.

---

## What stayed locked (patent + soul)

Zero changes to:
- `systemPrompt.ts` and the assembly path
- Soul fields (`rawIdentity`, `backstory`, `toneProfile`, `emotionalRange`, `coreValues`, `ethicalBoundaries`, archetypes)
- KB content rules and Layer 4 guidance
- Identity-lock + grow-lock + safe-mode mechanics
- Memory pipeline behavior (`storeMemory`, `searchMemory`, decay, 0.55 retrieval threshold, scope isolation, two-layer split)
- GROW proposal generation prompt (`growEngine.ts`) — the reframe from "self-modify" to "observe patterns" would likely unstick the LLM-refusal block, but per the no-prompt-changes-without-approval rule **it stays parked for a dedicated session**

---

## Files touched (high-level)

**Backend (`artifacts/opsoul-api/src/`):**
- `routes/upload.ts` — pdf-parse v2 fix
- `routes/tasks.ts` — schedule enum, validation, run-now endpoint
- `routes/grow.ts` — stale-refresh on GET self-awareness
- `routes/operator-skills.ts` — pass connectedIntegrations
- `cron/tasksCron.ts` — extracted `runSingleTask()` + new parser
- `utils/taskSchedule.ts` — **NEW** cron/expression parser + validator
- `utils/toolRegistry.ts` — 45 new tool definitions, schema relaxed for arrays/nested
- `utils/toolHandlers.ts` — 45 new handlers + helpers (`loadIntegration`, `callOAuth`, `emitWidget`)
- `utils/openrouter.ts` — `ToolDefinition.parameters` widened for `items`/nested
- `utils/selfAwarenessEngine.ts` — raised growActivity baseline, added 2 trigger values

**Hub (`artifacts/opsoul-hub/src/`):**
- `components/operator/widgets/types.ts` — **NEW** widget protocol types
- `components/operator/widgets/TokenDropCard.tsx` — **NEW** connect-form widget
- `components/operator/widgets/ChartCard.tsx` — **NEW** Recharts widget
- `components/operator/widgets/TableCard.tsx` — **NEW** semantic table widget
- `components/operator/widgets/MermaidCard.tsx` — **NEW** mermaid source widget
- `components/operator/widgets/WidgetBlock.tsx` — **NEW** dispatcher
- `components/operator/ChatSection.tsx` — fence detection for `opsoul-widget`
- `components/operator/TasksSection.tsx` — full rewrite (edit dialog, run-now, hourly, cron)
- `components/operator/IntegrationsSection.tsx` — full rewrite (MCP block, folded channels, catalog by category)
- `components/operator/SettingsSection.tsx` — API Access cleaned (legacy dropped)
- `components/operator/SkillsSection.tsx` — three new category tints
- `pages/OperatorDetail.tsx` — dropped bottom Channels group + obsolete imports
- `types.ts` — `Task.schedule` widened, `Integration` got `baseUrl` + `isCustomApp`

**Deleted (folded into Connections):**
- `components/operator/TelegramChannelSection.tsx`
- `components/operator/WhatsAppChannelSection.tsx`

---

## Deploy details

| | |
|---|---|
| **Source commits** | `404fb57` → `319f273` (11 commits) |
| **ACR build run** | `dg79` (Succeeded, 2m15s) |
| **Image** | `banistudioacr.azurecr.io/opsoul-api:station-rewrite-319f273` |
| **Container app** | `opsoul` (rg `bani-studio-rg`, region `uaenorth`) |
| **New revision** | `opsoul--0000068` (Healthy) |
| **Prior revision** | `opsoul--0000066` (image `upload-fix-dd7e32c`) — Azure auto-deactivates after traffic cuts over |
| **Smoke** | `GET /api/models` → 200 OK on new revision |

**Rollback safety net retained (per SoT owner directive 2026-05-19):**
- `mcp-runtime-f9f23e4` (MCP runtime layer, pre-upload-fix)
- `webhook-fix-2c4ea80` (pre-MCP)
- `upload-fix-dd7e32c` (pre-station-rewrite — auto-pinned by Azure as previous-active)

Rollback to pre-station-rewrite:
```bash
az containerapp update -n opsoul -g bani-studio-rg \
  --image banistudioacr.azurecr.io/opsoul-api:upload-fix-dd7e32c
```

---

## Open follow-ups (parked, not done)

1. **GROW prompt reframe** — needs your word-by-word approval per the no-prompt-changes-without-approval rule. The third-person "observe patterns from logs" framing would likely unstick the LLM's RLHF self-modification refusal.
2. **Mermaid library** — when bundled, `MermaidCard.tsx` swaps to inline render. Protocol + tool stay the same.
3. **Artifacts archive tab** under Files — owner-facing list of past operator-generated charts/diagrams/tables. Inline render is the working feature today.
4. **Owner notification targets** — `notify_owner` looks for `appSchema.ownerChatId / ownerPhone / ownerChannel`. Currently has to be set manually on each integration row. A future small UI affordance under each connected channel card would let you click "Use this for owner notifications".
5. **First-class Discord tools** — Discord connector tile is live; the corresponding `discord_send_message` / `discord_search` tools are not in this batch. Add when needed.
