# OpSoul — Source of Truth

## Rules (apply to all OpSoul work)

1. **Mac = GitHub = Azure. Always.** Before any deployment, `git status` must be clean and `git diff origin/main` must be empty. If not — commit first.
2. **Commit before you close.** Every session that touches code ends with a commit and push. No uncommitted work left overnight.
3. **No backup files in the repo.** Old versions live in git history (`git show <commit>:path/to/file`). Delete `.backup`, old snapshots, extracted directories immediately.
4. **Never run DB migrations without explicit owner approval.** Schema files (`.ts`) can be committed. `drizzle push` / `drizzle migrate` requires the owner to approve and run manually.
5. **Azure deploys from GitHub only.** No manual file edits on Azure directly. All changes: Mac → commit → push → Azure redeploys.
6. **Source of truth file updated after every commit.** Add what changed and date.

---

## Working Directory

`/Users/bstar/opsoul-audit/` — the only source of truth for OpSoul code.

Remote: `https://github.com/culturesouq/agent-hub.git` (branch: `main`)

Azure Container App pulls from this repo on each deployment.

---

## Commit Log (newest first)

### 2026-05-09 — fix: phase 1 complete — dedup, drift cron, token rotation, memory search scope
- `memoryEngine.ts`: Dedup fallback now selects `id` from vector query and fetches that specific row by ID — no longer returns random first row for operator (fix 1.3)
- `growEngine.ts`: Removed inline `cron.schedule` that duplicated drift cron registration from `driftCron.ts` / `index.ts` (fix 1.4)
- `auth.ts` `/refresh`: Old session is now revoked (`revokedAt`) before calling `issueSession()` — fresh refresh cookie + access token issued on every refresh (fix 1.5)
- `memory.ts` `/search`: Passes `buildOwnerScope(op.ownerId).scopeId` to `searchMemory` — owner sees only their scope memories, not all-scope (fix 1.7)

### 2026-05-09 — fix: operator remembers research + http timeout
**Commit:** `04bfadf`
- `chat.ts`: All 4 `persistUrlScrapedResult` and `persistWebSearchResult` call sites now pass `scope.scopeId` + `scope.scopeTrust`. Operator research (web search, URL reads) is now stored under the correct scope and recalled in future conversations.
- `httpExecutor.ts`: `AbortSignal.timeout(15000)` added to external fetch — slow APIs no longer hold the stream open.

### 2026-05-09 — sync: 5 days of uncommitted Mac work committed to GitHub
**Commit:** `e93e3d6`
- `memoryEngine.ts`: Layer 1/2 memory separation, scope-aware storage
- `scopeResolver.ts`: Full scope isolation implementation
- `growEngine.ts` + `growGuards.ts`: GROW guard chain logic
- `vaelCron.ts`: VAEL verification pipeline updates
- `sessionStore.ts`: New session management utility (NEW FILE)
- `main_memory.ts`: New `operator_main_memory` table schema, Layer 2 (NEW FILE)
- `memory.ts` schema: `scopeId` is now `notNull().default('legacy')`
- `chat.ts` / `public-chat.ts`: Latest streaming path
- `operators.ts`, `conversations.ts`, `grow.ts`, `memory.ts` routes: Latest state
- `telegram-webhook.ts`, `whatsapp-webhook.ts`: Latest state
- `systemPrompt.ts`, `ownerOperatorsSeed.ts`: Latest state
- `Dockerfile`: Added (was untracked)
- **Removed:** `opsoul-extracted/` (April 1 old snapshot) and `chat.ts.backup` (May 2)
- ⚠️ DB schema files committed as definitions only. No migration run yet.
  - `main_memory` table → needs `drizzle push` when owner is ready
  - `scopeId` column default change → safe for existing rows (Postgres applies default to new rows only)

### 2026-05-04 — fix: replace hardcoded opsoul.io API endpoint URLs with window.location.origin
**Commit:** `305170f`
- `DeploymentsSection.tsx`, `SettingsSection.tsx`, `ApiKeysSection.tsx`, `login.tsx`: All hardcoded `api.opsoul.io` → `window.location.origin`

### 2026-05-03 — VAEL admin desk, SSE streaming fix, chat execution blocks
**Commits:** `9a3b27d`, `c2ea4a8`, `b3a4fff`, `56cbbdc`
- VAEL unified KB ingest through verification pipeline
- SSE streaming: added `no-transform` to Cache-Control for Azure Envoy
- Chat execution blocks wired up properly

### 2026-05-02 — 9-fix audit pass: soul fidelity, OAuth, ChatSection rewrite
**Commit:** `3e72854`
- `ChatSection.tsx`: Full rewrite with `useReducer`, attachments, voice, tool blocks
- ⚠️ Known bugs introduced here: duplicate message after stream, no thinking indicator

---

## Known Open Bugs (as of 2026-05-09)

| # | File | Severity | Issue | Status |
|---|------|----------|-------|--------|
| 1 | `ChatSection.tsx` | Critical | Duplicate message: snapshot not cleared after DONE | Open |
| 2 | `ChatSection.tsx` | Critical | No thinking indicator between send and first token | Open |
| 3 | `chat.ts` | Medium | Web search + URL results stored without scopeId — operator forgot research | ✅ Fixed 2026-05-09 |
| 4 | `httpExecutor.ts` | Low | No timeout on external fetch — slow APIs hold SSE open | ✅ Fixed 2026-05-09 |
| 5 | `auth.ts` | Low | Refresh token not rotated on use | ✅ Fixed 2026-05-09 |
| 6 | `growEngine.ts` + `driftCron.ts` | Low | Drift cron double-scheduled — runs twice per quarterly trigger | ✅ Fixed 2026-05-09 |
| 7 | `memoryEngine.ts` | Low | Dedup fallback returns wrong row (no functional impact) | ✅ Fixed 2026-05-09 |
| 8 | `memory.ts` | Low | POST /search ignores scopeId — owner sees all-scope memories | ✅ Fixed 2026-05-09 |

---

## DB Migration Status

| Table | Status |
|-------|--------|
| `operator_main_memory` | Schema defined, **migration NOT run** |
| `operator_memory.scopeId` | Default changed to `'legacy'`, **migration NOT run** |

Owner must approve and run `pnpm --filter opsoul-db push` when ready.

---

## Architecture Notes

- **Layer 1 Memory**: Per-conversation, PII allowed, stored in `operator_memory` with `scopeId`
- **Layer 2 Memory**: PII-free insights, stored in `operator_main_memory`, eligible for GROW
- **VAEL**: KB verification pipeline — entries land as `pending`, VAEL validates before `approved`
- **Scope Isolation**: Each operator's data is scoped to its owner. Cross-operator contamination (like the Vael incident) is prevented by scopeResolver
- **Operators live in Azure**: Container App at `mangoforest-5c22eab7.uaenorth.azurecontainerapps.io`
