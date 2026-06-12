# Self-hosting OpSoul

## Quick start (Mac / Linux)
1. Download and unzip this package
2. Run: `./scripts/start.sh`
3. Follow the prompts — you'll need an OpenRouter API key (or OpenAI / Anthropic)
4. Open http://localhost:3001

## Quick start (Windows)
1. Download and unzip this package
2. Right-click `scripts/start.ps1` → Run with PowerShell
3. Follow the prompts
4. Open http://localhost:3001

## Developer path (Docker Compose directly)
1. `cp .env.template .env` and edit `.env`
2. `docker compose up -d --build`
3. Open http://localhost:3001

## What gets stored
- **Database**: PostgreSQL (runs in Docker, data persists in a Docker volume)
- **Files**: uploaded files stored in a Docker volume
- Nothing leaves your server — zero telemetry, zero callbacks

## Updating
```
docker compose pull && docker compose up -d
```

## Environment variables
See `.env.template` for the full list. Required to start:
- `OPENROUTER_API_KEY` — AI model routing (get one free at https://openrouter.ai)
- `JWT_SECRET` — generate with `openssl rand -hex 32`
- `SOVEREIGN_ADMIN_EMAIL` — the email address that gets admin rights on first run

## Port
Default port is **3001**. Override by setting `PORT=` in `.env`.
