# OpSoul — Developer Guide

Version 0.1.0 · Last updated June 2026

---

## What is OpSoul?

OpSoul is a self-hosted AI platform. Developers integrate it into their own
products or internal tools. The platform provides:

- A complete multi-operator AI runtime with persistent memory, tool execution,
  and a GROW development engine
- A REST API you call from any language or framework
- An npm client package for JavaScript/TypeScript projects
- A Docker image for server deployments
- A desktop installer (Mac, Windows coming) for non-technical users

The platform is patent-protected. You run it on your own infrastructure —
nothing phones back to OpSoul. Your data stays in your database.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│              Your Application           │
│  (web app, mobile app, backend service) │
└──────────────┬──────────────────────────┘
               │  HTTP  (REST API)
               ▼
┌─────────────────────────────────────────┐
│           OpSoul Platform               │
│                                         │
│  ┌──────────┐  ┌──────────┐            │
│  │ Operator │  │ Operator │  ...        │
│  │   (AI)   │  │   (AI)   │            │
│  └──────────┘  └──────────┘            │
│                                         │
│  5-layer prompt engine                  │
│  GROW self-development engine           │
│  2-layer memory system                  │
│  Tool execution layer (69+ tools)       │
│  BYO model routing                      │
└──────────────┬──────────────────────────┘
               │
               ▼
       PostgreSQL (local or remote)
```

Each operator is a distinct AI agent with its own identity, knowledge base,
tool permissions, memory, and GROW state. Operators are isolated from each
other. Your application talks to OpSoul via the REST API or the npm client.

---

## Installation Options

### Option 1 — Desktop App (Mac)

For teams that want a local install without DevOps.

Download `OpSoul-0.1.0-arm64.dmg` from the GitHub release, drag to
Applications, open. No Docker, no database setup, no environment variables —
everything is self-contained.

The desktop app runs OpSoul at `http://localhost:3001`.

See the User Guide for step-by-step instructions.

### Option 2 — Docker

For server deployments, CI environments, or teams on Linux/Windows servers.

```bash
# Pull and run
docker compose up -d
```

Use the `docker-compose.yml` from the repository root:

```yaml
version: "3.9"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: opsoul
      POSTGRES_PASSWORD: opsoul_local
      POSTGRES_DB: opsoul
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    image: banistudioacr.azurecr.io/opsoul-api:latest
    ports:
      - "${PORT:-3001}:3001"
    environment:
      DATABASE_URL: postgres://opsoul:opsoul_local@db:5432/opsoul
      JWT_SECRET: your-secret-here
      OPENROUTER_API_KEY: your-key-here   # or any other model key
    depends_on:
      - db

volumes:
  pgdata:
```

Replace the secret and key values. OpSoul will be available at port 3001.

### Option 3 — npm Client Package

For JavaScript/TypeScript applications that talk to a running OpSoul instance.

```bash
npm install @opsoul/client
# or
pnpm add @opsoul/client
```

---

## npm Client — `@opsoul/client`

### Setup

```typescript
import { createClient } from '@opsoul/client'

const opsoul = createClient({
  baseUrl: 'http://localhost:3001',  // your OpSoul instance
  apiKey: 'your-jwt-token',          // from /api/auth/login
})
```

### Authentication

```typescript
// Get a token by logging in as the admin
const { token } = await opsoul.auth.login({
  email: 'admin@yourinstance.com',
  password: 'your-admin-password',
})

// Use the token going forward
const client = createClient({ baseUrl, apiKey: token })
```

### Sending a message to an operator

```typescript
const response = await opsoul.chat.send({
  operatorId: 'your-operator-uuid',
  message: 'What are the latest market trends in renewable energy?',
  sessionId: 'user-session-id',  // groups messages into a conversation
})

console.log(response.reply)       // the operator's response text
console.log(response.toolsUsed)   // list of tools the operator invoked
```

### Streaming responses

```typescript
for await (const chunk of opsoul.chat.stream({
  operatorId: 'your-operator-uuid',
  message: 'Write a detailed analysis of...',
  sessionId: 'session-123',
})) {
  process.stdout.write(chunk.delta)
}
```

### Listing operators

```typescript
const operators = await opsoul.operators.list()
operators.forEach(op => console.log(op.id, op.name))
```

### Getting a specific operator

```typescript
const operator = await opsoul.operators.get('operator-uuid')
console.log(operator.name, operator.growScore)
```

### Adding knowledge to an operator

```typescript
// From a file path (Node.js)
await opsoul.knowledge.upload({
  operatorId: 'operator-uuid',
  filePath: './documents/product-manual.pdf',
})

// From a Buffer
await opsoul.knowledge.uploadBuffer({
  operatorId: 'operator-uuid',
  buffer: pdfBuffer,
  filename: 'manual.pdf',
  mimeType: 'application/pdf',
})
```

### GROW metrics

```typescript
const grow = await opsoul.grow.getSelfAwareness('operator-uuid')
console.log(grow.score)        // 0–100
console.log(grow.knowledge)    // sub-score
console.log(grow.growth)       // sub-score
console.log(grow.integrity)    // sub-score

// Recompute
await opsoul.grow.recompute('operator-uuid')
```

### Setting the lock level

```typescript
await opsoul.grow.setLockLevel('operator-uuid', 'FROZEN')
// Options: 'OPEN' | 'CONTROLLED' | 'FROZEN'
```

---

## REST API Reference

All endpoints are at `http://your-instance:3001/api/`

Authentication: pass a JWT token in the Authorization header:
`Authorization: Bearer <token>`

Get a token via `POST /api/auth/login`.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login with email + password. Returns JWT token. |
| POST | /api/auth/logout | Invalidate current token. |
| POST | /api/auth/refresh | Refresh a token before expiry. |
| PUT | /api/auth/password | Change password. |

### Operators

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/operators | List all operators. |
| POST | /api/operators | Create a new operator. |
| GET | /api/operators/:id | Get operator by ID. |
| PUT | /api/operators/:id | Update operator settings. |
| DELETE | /api/operators/:id | Delete operator. |
| GET | /api/operators/:id/model-config | Get BYO model config (key masked). |
| PUT | /api/operators/:id/model-config | Set BYO model config. |
| DELETE | /api/operators/:id/model-config | Remove BYO model config. |
| POST | /api/operators/:id/model-config/test | Test model config (real API call). |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/chat | Send a message. Returns full response. |
| POST | /api/chat/stream | Send a message. Returns SSE stream. |
| GET | /api/conversations | List conversations for an operator. |
| GET | /api/conversations/:id | Get a conversation and its messages. |
| DELETE | /api/conversations/:id | Delete a conversation. |

**POST /api/chat body:**
```json
{
  "operatorId": "uuid",
  "message": "your message",
  "sessionId": "optional-session-id",
  "context": {}
}
```

**POST /api/chat response:**
```json
{
  "reply": "operator response text",
  "sessionId": "session-id",
  "toolsUsed": ["web_search", "http_request"],
  "messageId": "uuid"
}
```

### Knowledge Base

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/kb/operator/:id | List KB entries for an operator. |
| POST | /api/kb/upload | Upload a document (multipart/form-data). |
| DELETE | /api/kb/:entryId | Delete a KB entry. |
| POST | /api/kb/search | Search the KB. |

### GROW

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/grow/self-awareness | Get GROW score for an operator. |
| POST | /api/grow/recompute | Trigger GROW recomputation. |
| PATCH | /api/operators/:id/lock-level | Set lock level (OPEN/CONTROLLED/FROZEN). |

### Setup (first run)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/setup/status | Check if initial setup is needed. |
| POST | /api/setup/complete | Complete initial setup (creates first admin). |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/healthz | Returns 200 OK when the server is running. |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| JWT_SECRET | Yes | Secret for signing JWT tokens (min 32 chars) |
| PORT | No | HTTP port (default: 3001) |
| NODE_ENV | No | `production` or `development` |
| ALLOWED_ORIGIN | No | CORS allowed origin (default: same as APP_URL) |
| APP_URL | No | Public URL of this instance |
| OPENROUTER_API_KEY | No | Default model key (OpenRouter) |
| OPENAI_API_KEY | No | Default model key (OpenAI) |
| ENCRYPTION_KEY | No | Key for encrypting BYO model API keys at rest |
| SENDGRID_API_KEY | No | For email features |
| LOG_LEVEL | No | `debug`, `info`, `warn`, `error` (default: info) |

BYO model keys set per-operator via the API are encrypted at rest using
`ENCRYPTION_KEY`. If not set, they are stored as-is.

---

## Building from Source

Requires: Node.js 20+, pnpm 11+

```bash
git clone https://github.com/culturesouq/Agent-Hub.git
cd Agent-Hub
pnpm install

# Start in development mode
cd artifacts/opsoul-api
pnpm dev

# In another terminal — start the UI
cd artifacts/opsoul-hub
pnpm dev
```

OpSoul API runs on port 3001. Hub UI runs on port 5173 in dev mode.

You need a PostgreSQL database. Set `DATABASE_URL` in an `.env` file in
`artifacts/opsoul-api/`.

### Building the desktop installer (Mac)

```bash
# Build the Hub UI first
pnpm --filter @workspace/opsoul-hub build

# Then build the signed and notarized DMG
cd electron
APPLE_ID="your-apple-id@icloud.com" \
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
APPLE_TEAM_ID="YOURTEAMID" \
npm run dist:mac
```

Requires an Apple Developer account with a Developer ID Application
certificate in your keychain.

---

## Operator Architecture

Each operator in OpSoul has a 5-layer structure:

- **Layer 0** — Platform identity (set by OpSoul, never changed)
- **Layer 1** — Operator identity (name, purpose, personality)
- **Layer 2** — Knowledge (documents, facts, KB entries)
- **Layer 3** — Tools (what the operator can do)
- **Layer 4** — DNA (rules, behaviour, growth directives)

These layers are assembled at runtime for each conversation. You configure
layers 1–4 via the console or the API. Layer 0 is platform-managed.

---

## Tool System

OpSoul ships with 69 built-in tools via the CultureEyes SDK. Categories:

- **Web** — web_search, http_request, fetch_url, scrape_page
- **Files** — read_file, write_file, list_directory, search_files
- **Data** — query_database, parse_json, transform_data
- **Communication** — send_email, send_webhook
- **Knowledge** — search_kb, add_to_kb, summarise_document
- **Computation** — run_code, calculate, convert_units
- **Integration** — call_api, authenticate_service, get_credentials

Tools are available platform-wide. You configure which tools each operator
has access to via the operator settings.

---

## MCP (Model Context Protocol)

OpSoul exposes an MCP-compatible endpoint:

```
http://your-instance:3001/api/mcp/:operatorId
```

This allows MCP-compatible clients (Claude Desktop, Cursor, other IDE tools)
to connect directly to any operator and use its tools.

---

## Data Storage

OpSoul uses PostgreSQL. The schema is managed with Drizzle ORM. Tables:

- `owners` — admin accounts
- `operators` — operator definitions and configuration
- `conversations` — conversation records
- `messages` — individual messages
- `sessions` — auth sessions
- `operator_kb` — operator knowledge base entries
- `owner_kb` — platform-level knowledge base entries
- `grow_state` — GROW engine state per operator

All data is in your database. OpSoul makes no external data calls beyond
the AI provider you configure.

---

## Security Notes

- JWT tokens expire after 24 hours by default
- BYO model API keys are encrypted at rest (AES-256)
- All routes require authentication except `/api/healthz` and `/api/setup/*`
- Rate limiting is applied on all auth endpoints
- CORS is enforced — set `ALLOWED_ORIGIN` to your frontend domain

---

## Support

GitHub: https://github.com/culturesouq/Agent-Hub/issues
