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

| # | File | Severity | Issue |
|---|------|----------|-------|
| 1 | `ChatSection.tsx` | Critical | Duplicate message: snapshot not cleared after DONE |
| 2 | `ChatSection.tsx` | Critical | No thinking indicator between send and first token |
| 3 | `memoryEngine.ts` | Medium | Distillation has no dedup tracking — repeated calls may create redundant memories |
| 4 | `chat.ts` | Medium | Memory stored under ownerId scope not conversationId scope — potential mismatch |
| 5 | `growEngine.ts` | Medium | Soul update does not diff — may write identical values |
| 6 | `vaelCron.ts` | Medium | Embedding failure is silently swallowed, stored as null |
| 7 | `requireSlotKey.ts` | Medium | No validation that slot's operatorId maps to a real operator |
| 8 | `public-chat.ts` | Medium | No res.end() guard after error in stream path |
| 9 | `chat.ts` | Low | fullContent not reset after clear_stream — minor memory overhead |
| 10 | `schema/memory.ts` | Low | No index on decayStartedAt — full table scan on decay cron |
| 11 | `memoryEngine.ts` | Low | Both Layer 1/2 distillation use Haiku — Layer 2 may need Sonnet for PII safety |
| 12 | `index.ts` | Low | Sovereign admin email hardcoded |

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
