# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI chat**: OpenRouter via Replit AI Integrations (`AI_INTEGRATIONS_OPENROUTER_BASE_URL`, `AI_INTEGRATIONS_OPENROUTER_API_KEY`)
- **AI voice (STT/TTS)**: OpenAI via Replit AI Integrations (`AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`)

## Authentication

- Password-protected single-owner app. Default password: `agent-hub-secret` (override with `OWNER_PASSWORD` env var).
- Session: `express-session`, 7-day expiry, `SESSION_SECRET` env var.
- API keys: format `ahub_<48hex>`, stored hashed in DB, per-agent.

## Project

**Agent Hub** — a private web app for managing AI agents with rich customization.

### Artifacts

| Name | Path | Package |
|------|------|---------|
| Agent Hub (frontend) | `artifacts/agent-hub/` | `@workspace/agent-hub` |
| API Server (backend) | `artifacts/api-server/` | `@workspace/api-server` |
| Mockup Sandbox | `artifacts/mockup-sandbox/` | `@workspace/mockup-sandbox` |

### Completed Features (Tasks #1–#9)

1. **UX Redesign** — dark glassmorphism UI, redesigned sidebar (agents list, settings, logs, public API)
2. **Persistent Memory** — per-agent memory store, automatic summarization, memory panel
3. **Knowledge Base** — file upload (PDF, TXT, DOCX, CSV, images), per-agent knowledge retrieval
4. **Web Search** — per-agent toggle, DuckDuckGo/SerpAPI search integration, source citations
5. **Tool Calling & Custom Functions** — webhook tools, custom JS functions, tool call display in chat
6. **Expanded Platform Integrations** — connections panel, OAuth/webhook integrations (Slack, GitHub, etc.)
7. **Automations & Scheduling** — cron-based automations, webhook triggers, `runAgentTask()` runner
8. **Image / Vision Understanding** — image upload + clipboard paste in chat, multimodal OpenRouter models
9. **Conversational Voice Chat** — see below
10. **Dynamic Personality Growth** — see below

### Task #9: Dynamic Personality Growth (COMPLETE)

- **DB schema**: `agentGrowthLogTable` (id, agentId, field, oldValue, newValue, appliedAt) in `lib/db/src/schema/growth.ts`
- **Chat integration** (`chat.ts`): After each owner-chat stream completes, parses `[GROW: field=X, value=Y]` tags from `fullResponse`
  - Strips GROW tags from the streamed response shown to user (invisible to user)
  - Validates proposed value against permanent instructions using a lightweight LLM call (gpt-4.1-nano, 10 tokens)
  - If allowed: updates `agentsTable.backstory` or `agentsTable.personality` + inserts into `agentGrowthLogTable`
  - `buildSystemPrompt()` updated with growth instructions — agent is told to use the tag only when genuinely meaningful
- **Streaming buffer**: `STRIP_TAGS_REGEX`, `looksLikeTagStart()`, `extractSafeContent()` all updated to handle GROW tags
- **API routes** (`growth.ts`): `GET /agents/:id/growth` (list) + `POST /agents/:id/growth/:id/revert` (revert)
- **OpenAPI spec**: `GrowthLogEntry` schema, `listGrowthLog` + `revertGrowth` operations, `growth` tag; codegen re-run
- **Frontend**: `AgentGrowth.tsx` — timeline of growth events (newest first), expandable cards showing before/after diff, revert button
- **Navigation**: Growth added to Brain group in sidebar (under Instructions), with count badge; `agent-detail.tsx` updated
- **i18n**: Growth keys in EN + AR

### Task #8: Conversational Voice Chat (COMPLETE)

- `voice` (text, default `nova`) and `voiceSpeed` (real, default `1.0`) columns added to agents DB table and migrated
- Per-agent voice selector (alloy/echo/fable/onyx/nova/shimmer) + speed slider in Identity tab
- **Backend routes** (`artifacts/api-server/src/routes/voice.ts`):
  - `POST /agents/:id/transcribe` — multipart audio → `speechToText()` (gpt-4o-mini-transcribe)
  - `POST /agents/:id/speak` — JSON body → **SSE streaming PCM16** via `textToSpeechStream()` (gpt-audio, 24kHz mono)
    - Response: `text/event-stream` with `data: {chunk: base64_pcm16}` frames, then `data: {done: true}`
    - **Note**: The generated `speakText()` client helper is marked `@deprecated` — do NOT use it. Use raw `fetch` with SSE parsing (see `useVoiceSession` hook).
- **`useVoiceSession` hook** (`artifacts/agent-hub/src/hooks/use-voice-session.ts`):
  - State machine: `idle → recording → transcribing → speaking → recording (loop)`
  - MediaRecorder + Web Audio API VAD (RMS silence detection, 1.8s threshold)
  - Proper teardown: each recording turn stops all previous MediaStream tracks + closes AudioContext
  - PCM16 SSE streaming playback via `AudioBufferSourceNode` scheduling (progressive, not buffered)
  - All sources tracked in `scheduledSourcesRef`; `stopSession()` closes the `playbackCtxRef` immediately
  - `isActiveRef` cancellation guard on every `await` (no messages fire after session ends)
  - `micDenied` state + `retrySession()` + `clearMicDenied()` for permission denied flow
- **UI Components**:
  - `VoiceOverlay.tsx` — full-screen absolute overlay with pulse rings, waveform bars, transcript preview, stop button
  - `MicPermissionGuide.tsx` — browser-specific step-by-step permission fix guide (Chrome/Firefox/Safari) with retry/dismiss
  - "Start Voice" / "Stop" button in the **chat header** (not the input bar)
- **OpenAPI spec**: `/speak` → `text/event-stream` response with `SpeakChunk` schema; codegen re-run
- **i18n**: All voice keys in EN + AR (`voiceRecording`, `voiceTranscribing`, `voiceSpeaking`, `startVoice`, `stopVoice`)

### Pending Tasks (future sessions)

- **Task #9**: Dynamic Personality Growth (Auto) — agent personality evolves from conversation patterns
- **Task #10**: WhatsApp & Telegram Connectors — incoming/outgoing message webhooks
- **Task #11**: API Docs & Secrets Manager — interactive API docs UI, key management UI

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── agent-hub/              # React + Vite frontend (port via $PORT)
│   └── api-server/             # Express API server (port 8080)
├── lib/
│   ├── api-spec/               # OpenAPI spec + Orval codegen config
│   ├── api-client-react/       # Generated React Query hooks (do not hand-edit generated/)
│   ├── api-zod/                # Generated Zod schemas
│   ├── db/                     # Drizzle ORM schema + DB connection
│   ├── integrations-openai-ai-server/   # OpenAI AI integration (STT + TTS)
│   └── integrations/openai_ai_integrations/  # OpenAI integration internals
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
- SSE streaming headers (required for Replit nginx proxy): `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, `res.flushHeaders()`
- Depends on: `@workspace/db`, `@workspace/api-zod`, `@workspace/integrations-openai-ai-server`
- `pnpm --filter @workspace/api-server run dev` — run the dev server

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)
- Dev push: `pnpm --filter @workspace/db run push` or `push-force`

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

**CRITICAL after any spec change**: Run `cd lib/api-spec && pnpm run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec. Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec.
⚠️ The `speakText()` function is `@deprecated` — the `/speak` endpoint is SSE, not JSON. Use `useVoiceSession` hook directly.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`.

## Key Implementation Notes

- **Automation webhook URL**: `/api/webhooks/automation/:webhookSecret` — no auth required
- **`agent-runner.ts`**: exports `runAgentTask(agentId, prompt, contextVars?)` and `executeAutomation(automationId, promptOverride?)`
- **Voice TTS**: `textToSpeechStream()` from `@workspace/integrations-openai-ai-server/audio` — yields base64 PCM16 chunks (24kHz, mono, signed 16-bit)
- **Voice STT**: `speechToText()` from same package — uses `gpt-4o-mini-transcribe`; `ensureCompatibleFormat()` handles ffmpeg conversion
- **Voice speed**: applied via prompt hint (gpt-audio doesn't support native speed param)
