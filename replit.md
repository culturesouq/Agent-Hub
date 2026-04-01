# OpSoul v2.4 — Complete

AI operator platform with 5-layer identity architecture, dual knowledge bases, GROW self-evolution system, multi-tenant JWT auth, and pgvector semantic search.

## v2.4 Session Completed Features

- **T2 Arabic detection** — Unicode `/[\u0600-\u06FF...]` detected in chat.ts → `languageInstruction` injected silently into system prompt
- **T3 API Reference** — Full code examples (curl, JS, Python) with copy buttons in Settings → API
- **T4 Connector Cards** — 5 connector cards (Gmail, GCal, Outlook, OneDrive, LinkedIn) with connect/disconnect in Integrations
- **T5 GROW Test Mode** — `POST /operators/:id/grow/test-proposal/:proposalId` runs 3 test messages through current vs proposed soul; before/after preview panel in GrowSection
- **T6 Behavior Diff Card** — Human-readable proposal cards: field names humanized, plain language rationale, confidence badge
- **T7 Safe Mode** — `PATCH /:id/safe-mode` backend; toggle in Settings → Safe Mode; amber badge in header; growCron filters `safeMode = false`
- **T8 Drift Cron** — `driftCron.ts` runs every 90 days (`0 3 1 */3 *`); computes `semanticDistance(soulOriginal, soulCurrent)` → stored in `soulState`; alerts if drift > 0.30
- **T9 Theme** — Sidebar 14% lightness vs 10% for main; `--radius: 0.5rem`; thin custom scrollbars
- **T10 Mobile Nav** — Hamburger button → slide-in overlay with full sidebar nav; replaced horizontal tab bar
- **T11 GitHub** — Committed as "OpSoul v2.4 Complete"; push with `git push origin main` (requires GitHub credentials)
- **T12 Text** — All UI "assistant" strings replaced with "operator"

## Architecture

### Monorepo Structure

```
lib/
  db/               — Drizzle ORM + PostgreSQL schema (all OpSoul tables)
  opsoul-utils/     — Shared utilities: env validation, AES-256-GCM crypto, OpenAI embeddings
artifacts/
  opsoul-api/       — Express API server (port 3001)
  mockup-sandbox/   — Vite component preview server
```

### Database (`lib/db`)

All 23 tables in `lib/db/src/schema/`:

| Table | Purpose |
|---|---|
| `owners` | Platform account holders (Sovereign Admins) |
| `sessions` | Refresh token store (SHA-256 hash, 30-day TTL) |
| `operators` | AI agents with 5-layer identity; layer1 locked on first message |
| `conversations` | Chat sessions per operator |
| `messages` | Individual turn records with token counts |
| `grow_proposals` | GROW self-evolution proposals (cron: 02:00 UTC daily) |
| `grow_blocked_log` | Audit log of rejected GROW proposals |
| `self_awareness` | Operator introspection snapshots |
| `owner_kb` | Owner-level knowledge base chunks (pgvector) |
| `operator_kb` | Operator-level knowledge base chunks (pgvector) |
| `kb_verification` | KB chunk verification status |
| `memory` | Semantic memory entries (pgvector) |
| `capability_requests` | Operator capability expansion requests |
| `tasks` | Operator task queue |
| `platform_skills` | Platform-wide skills library |
| `operator_skills` | Skills assigned to operators |
| `ops_logs` | Operational error/event logs |
| `platform_patterns` | Cross-operator pattern detection |
| `support_tickets` | Owner-initiated support conversations |
| `operator_integrations` | Third-party integrations per operator |
| `mission_contexts` | Named context presets per operator |
| `admin_audit_log` | **Immutable** admin action log (DB trigger enforced) |

### API Server (`artifacts/opsoul-api`)

Running on **port 3001**.

**Auth routes** (`/api/auth/`):
- `POST /register` — create owner account (bcrypt 12 rounds)
- `POST /login` — returns 24hr JWT access token + 30-day refresh cookie
- `POST /refresh` — exchange httpOnly refresh cookie for new access token
- `POST /logout` — revoke session, clear cookie
- `POST /change-password` — require current password, revoke all sessions
- `GET /me` — return owner profile (requires Bearer token)

**Auth model:**
- Access token: 24hr JWT (HS256), signed with `JWT_SECRET`
- Refresh token: 30-day, stored as SHA-256 hash in `sessions` table, raw value in httpOnly cookie
- `requireAuth` middleware validates Bearer token on protected routes

**Operator routes** (`/api/operators/`) — all require Bearer token:
- `POST /` — create operator (validates Layer 1 + Layer 2 soul via Zod)
- `GET /` — list all operators for authenticated owner
- `GET /:id` — get single operator with full identity layers
- `PATCH /:id` — update Layer 1 fields (owner always allowed; lock only prevents operator self-modification)
- `DELETE /:id` — permanently delete operator
- `POST /:id/lock-layer1` — lock Layer 1 identity (idempotent-safe, 409 if already locked)
- `GET /:id/soul` — get Layer 2 soul + original snapshot
- `PATCH /:id/soul` — field-level soul update (never deep merge; blocked if FROZEN)
- `POST /:id/soul/reset` — restore Layer 2 soul to original (blocked if FROZEN)
- `PATCH /:id/grow-lock` — set GROW lock level (OPEN/CONTROLLED/LOCKED/FROZEN) + optional expiry

**Layer 1 lock behavior:**
- `layer1LockedAt` is `null` at creation time
- Set explicitly via `POST /:id/lock-layer1`
- Also set automatically on first message sent (via `lockLayer1IfUnlocked` helper, called from Phase 4 chat routes)
- Lock meaning: prevents the **operator** from self-modifying its identity during GROW cycles or conversations
- Owner (authenticated user) can always update Layer 1 fields via `PATCH /:id` and `PATCH /:id/identity-from-description` regardless of lock status

**Layer 2 Soul schema (Zod-validated):**
```
personalityTraits  string[]   — e.g. ["analytical","warm","curious"]
toneProfile        string     — e.g. "calm and professional"
communicationStyle string     — e.g. "concise, avoids jargon"
quirks             string[]   — distinctive behaviors
valuesManifestation string[]  — how core values show up
emotionalRange     string     — stability profile
decisionMakingStyle string    — reasoning approach
conflictResolution string     — de-escalation strategy
```

**GROW lock levels:**
- `OPEN` — GROW can freely propose soul changes
- `CONTROLLED` (default) — GROW proposals allowed at higher confidence threshold
- `LOCKED` — GROW proposals blocked; only manual soul edits allowed
- `FROZEN` — No changes at all (manual or GROW) until `lockedUntil` expires

### Shared Utilities (`lib/opsoul-utils`)

- `validateEnv()` — hard-fails at startup if any required env var is missing
- `encryptToken(raw)` / `decryptToken(ciphertext)` — AES-256-GCM, key from `ENCRYPTION_KEY`
- `hashToken(raw)` — SHA-256 hex digest (used for refresh token storage)
- `embed(text)` — OpenAI `text-embedding-3-small` embeddings (1536-dim)
- `cosineSimilarity(a, b)` / `semanticDistance(a, b)` — vector math

## AI Stack

| Purpose | Model | Provider |
|---|---|---|
| Live chat | `meta-llama/llama-3.3-70b-instruct` | OpenRouter |
| GROW evaluation | `anthropic/claude-sonnet-4-5` | OpenRouter |
| Embeddings | `text-embedding-3-small` | OpenAI direct |

## Required Secrets

All stored as Replit Secrets:

| Secret | Description |
|---|---|
| `JWT_SECRET` | 64-char hex — signs access tokens |
| `ENCRYPTION_KEY` | 64-char hex (32 bytes) — AES-256-GCM key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OPENAI_API_KEY` | OpenAI API key (embeddings only) |
| `DATABASE_URL` | Auto-managed by Replit |
| `SESSION_SECRET` | Auto-managed |

## Build Phases

- **Phase 1 (complete):** Environment validation, shared utilities, full DB schema (23 tables), JWT auth API
- **Phase 2 (complete):** Operator CRUD, 5-layer identity management, Layer 1 lock logic, soul field-level updates, GROW lock control
- **Phase 3 (complete):** Dual KB ingestion (owner + operator), pgvector semantic search, confidence/verification filtering, RAG context assembly
- **Phase 4 (complete):** OpenRouter streaming/sync chat (Llama 3.3 70B), SSE, conversation CRUD, message history, KB RAG context injection, auto Layer 1 lock on first message
- **Phase 5 (complete):** GROW self-evolution system — Claude Sonnet 4-5 soul evaluation, proposal lifecycle (queued→evaluating→applied/rejected/needs_owner_review), owner decide flow, self-awareness state, daily cron 02:00 UTC, FROZEN/LOCKED guards
- **Phase 6 (complete):** Skills engine (platform library + per-operator install), integrations (AES-256-GCM token vault, never returned), mission contexts (tone/KB/GROW overrides, per-conversation activation), full system prompt injection at Layer 3
- **Phase 7 (complete):** Memory system — `operator_memory` store with vector embeddings; CRUD + semantic search + manual decay + distillation routes at `/api/operators/:id/memory`; daily 04:00 UTC decay cron (-0.05/day, auto-archive at ≤0.05); AI distillation (Llama 3.3 70B extracts facts/preferences/patterns from recent conversations, stores at confidence ≥0.7); injected into Layer 3 "Remembered Context" block at chat time (top-5, cosine ≥0.40, weight >0.1); `memoryCount` in chat responses
- **Phase 9 (complete):** OpSoul Hub frontend — React + Vite app (`artifacts/opsoul-hub`, port 19165, preview at `/`); Vite proxy `/api → localhost:3001`; custom JWT auth layer (`src/lib/api.ts` apiFetch + `src/contexts/AuthContext.tsx`); dark mission-control aesthetic (deep navy + cyan); pages: `/login` (register + login), `/` (operator dashboard with create/delete), `/operators/:id` (9-section operator workspace: Identity, Chat, Knowledge Base, GROW & Self-Awareness, Memory, Integrations, Mission Contexts, Skills, Capability Requests); SSE streaming chat with live typing indicator; all 9 sections wire directly to Phases 1-8 API endpoints; TypeScript clean

- **Phase 8 (complete):** Self-Awareness Engine — `buildSelfAwarenessState()` computes live identity_state (Layer 1 snapshot), soul_state (soul + GROW history counts), capability_state (integrations + skills + KB chunk counts + avg confidence), task_history (last 30 tasks + per-type success/failure breakdown), mandate_gaps (task types with ≥50% failure), health score (v2.4 weights: mandateCoverage×0.30 + mandateGaps×0.20 + kbConfidence×0.25 + growActivity×0.15 + soulIntegrity×0.10 → Strong≥70/Developing≥40/Needs Attention<40); `recomputeSelfAwareness()` preserves previous state + logs to ops_logs on failure; `triggerSelfAwareness()` is a non-blocking `setImmediate` wrapper; 5 event triggers: chat (conversation_end), owner-kb/operator-kb POST (kb_learn), integrations POST/PATCH/DELETE (integration_change), GROW decide approve (grow_approved), capability-requests POST (capability_request); `health_score` jsonb column added to `self_awareness_state`; GET route returns DB state or live-computes if no cache; POST /recompute for explicit refresh; capability-requests route: `/api/operators/:id/capability-requests` — full CRUD (GET list, POST create→fires trigger, GET single, PATCH :id/respond, DELETE)
