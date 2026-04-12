# OpSoul

## Overview

OpSoul is an AI operator platform featuring a 5-layer identity architecture, dual knowledge bases, and a GROW self-evolution system. It includes multi-tenant JWT authentication and pgvector semantic search for enhanced AI capabilities. The platform aims to provide a robust framework for managing and evolving AI agents, offering advanced features for identity management, self-improvement, and integration with external services.

## Engineering Notebook

Living decision log, architecture notes, and bug history: `.local/notebook.md`
Always update it when something meaningful is built, changed, or decided.

## System Architecture

OpSoul is structured as a monorepo containing shared libraries and distinct services. The hub (frontend) is now wired to the v2 API (opsoul-api-v2). The v1 API (opsoul-api) remains running but is no longer the active backend.

**Patent:** IPPT-2026-000028 — architecture claims frozen. Do not alter the 5-layer soul schema, GROW system flow, or self-awareness engine contracts.

**Monorepo Structure:**
- `lib/db`: Drizzle ORM + PostgreSQL schema for v1 (`public` schema). Kept for reference.
- `lib/db-v2`: Drizzle ORM + PostgreSQL schema for v2 (`opsoul_v3` schema). Active.
- `lib/opsoul-utils`: Shared utilities — AES-256-GCM encryption, OpenAI embeddings, semantic distance.
- `artifacts/opsoul-api`: v1 Express API, port 3001, `public` schema. Kept running for rollback.
- `artifacts/opsoul-api-v2`: v2 Express API, port 3002, `opsoul_v3` schema. **Active backend.**
- `artifacts/opsoul-hub`: React/Vite frontend at `/`. Now points to v2 (`/api/v3/...`).

**Database:**
- v1 uses `public` schema (PostgreSQL + Drizzle).
- v2 uses `opsoul_v3` schema (PostgreSQL + Drizzle). All 22 core tables present.
- `opsoul_v3.platform_skills`: 163 skills populated (copied from v1), all with `trigger_description`.
- Encryption: AES-256-GCM for all integration tokens (`ENCRYPTION_KEY` secret).

**API Server v2 (`opsoul-api-v2` — port 3002):**
- **All routes prefixed** with `/api/v3/...`
- **Auth:** JWT (24h access, 30d refresh). Email/password + Google OAuth.
- **Google OAuth:** `/api/v3/integrations/google/initiate` + `/callback`. Auto-installs Gmail, Calendar, Drive skills on connect.
- **Operators:** Full CRUD, soul layers, layer1 locking, bootstrap-preview.
- **Chat:** Full skill pipeline — trigger detection (cosine similarity), URL auto-read, LEARN extraction, archetype defaults, second-pass LLM.
- **GROW:** Soul evolution proposals, self-awareness recompute, drift detection.
- **Skills:** Platform-wide skills (163 rows), per-operator installs, integration auto-install.
- **KB:** Owner KB + operator KB with pgvector RAG, `/kb/search`.
- **Memory:** Semantic memories with decay, distillation, archiving.
- **Admin:** Sovereign admin routes, RAG pipeline, drift-alert dashboard.
- **Public:** `/v3/chat` (slot-based public chat), `/v3/action` (public CRUD).
- **VAEL:** Background self-awareness engine cron (twice daily).
- **Crons:** GROW (daily 02:00 UTC), Vael (01:00 + 13:00 UTC), Memory decay (04:00 UTC), Drift (quarterly 03:00 UTC 1st of month).

**Sovereign Admins:** `mohamedhajeri887@gmail.com` and `smoketest@opsoul.dev`
**VAEL_OPERATOR_ID:** `a826164f-3111-4cc9-8f3c-856ecc589d77`

**AI Stack:**
- **Live Chat:** `anthropic/claude-sonnet-4-5` (CHAT_MODEL)
- **KB / Short tasks:** `anthropic/claude-haiku-4-5` (KB_MODEL)
- **GROW Evaluation:** `anthropic/claude-sonnet-4-5` (GROW_MODEL)
- **Embeddings:** `text-embedding-3-small` via OpenAI.
- **Llama is permanently banned** — `meta-llama/llama-3.3-70b-instruct` is removed from all code paths. Never re-add it.
- **chatCompletion v2 signature:** `chatCompletion(messages, { model: GROW_MODEL })` — opts object, NOT a plain string.

**Skill Trigger Detection:**
- All installed + archetype-default skills are embedded at chat time.
- Cosine similarity computed for every skill trigger description against the user message.
- Best match above threshold 0.45 wins. All skills are scored before winner is selected.

**Frontend (`opsoul-hub`):**
- Built with React and Vite. Dark mission-control aesthetic.
- API calls via `apiFetch(endpoint)` → proxied to `/api/v3/...` → v2 backend on port 3002.
- Vite proxy config: `/api/v3` → port 3002, `/api` → port 3001 (v1, legacy).
- SSE streaming chat, live typing indicators.
- Google OAuth connect flow: calls `/api/v3/integrations/google/initiate` to get authUrl.

## External Dependencies

- **OpenRouter:** AI model access (Claude Sonnet 4-5, Claude Haiku 4-5). Never use Llama 3.3 70B.
- **OpenAI:** `text-embedding-3-small` embeddings.
- **PostgreSQL:** Primary database. Two active schemas: `public` (v1) and `opsoul_v3` (v2).
- **SendGrid:** Email — forgot password, welcome emails (`SENDGRID_FROM_EMAIL` secret).
- **Google OAuth:** `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Gmail, Calendar, Drive integrations.
- **GitHub PAT:** `GITHUB_PERSONAL_ACCESS_TOKEN` — GitHub integration.
- **JWT_SECRET / SESSION_SECRET / ENCRYPTION_KEY:** Core security secrets.
