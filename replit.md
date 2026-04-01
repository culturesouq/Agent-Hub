# OpSoul v2.4

AI agent platform with 5-layer identity architecture, dual knowledge bases, GROW self-evolution system, multi-tenant JWT auth, and pgvector semantic search.

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
- `PATCH /:id` — update Layer 1 fields (blocked 423 if `layer1LockedAt` is set)
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
- Once locked: Layer 1 fields (archetype, mandate, coreValues, ethicalBoundaries) are permanently immutable

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
- **Phase 5 (pending):** GROW self-evolution system, cron scheduler (02:00 UTC daily)
- **Phase 6 (pending):** Skills engine, integrations, mission contexts
