# ── Stage 1: base ────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

RUN npm install -g pnpm@10

# ── Stage 2: deps ─────────────────────────────────────────────────────────────
FROM base AS deps

# Native modules (bcrypt) need build tools
RUN apk add --no-cache python3 make g++

# Copy workspace config + all package manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/opsoul-api/package.json ./artifacts/opsoul-api/
COPY artifacts/opsoul-hub/package.json ./artifacts/opsoul-hub/

# Install all deps (including devDeps needed for build stages)
RUN npm_config_user_agent="pnpm/10.0.0 npm/? node/v20.0.0 linux x64" \
    pnpm install --frozen-lockfile

# ── Stage 3: build-hub ────────────────────────────────────────────────────────
FROM deps AS build-hub

# Copy frontend source
COPY artifacts/opsoul-hub ./artifacts/opsoul-hub

# Vite requires PORT and BASE_PATH at build time (see vite.config.ts)
RUN PORT=3001 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/opsoul-hub run build
# Output lands in artifacts/opsoul-hub/dist/public/

# ── Stage 4: build-api ────────────────────────────────────────────────────────
FROM deps AS build-api

# Copy API source (tsx runs TypeScript directly — no tsc compile step)
COPY artifacts/opsoul-api ./artifacts/opsoul-api

# ── Stage 5: production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN npm install -g pnpm@10

# Native modules need the runtime build tools at install time
RUN apk add --no-cache python3 make g++

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
COPY lib/ ./lib/
COPY artifacts/opsoul-api/package.json ./artifacts/opsoul-api/
COPY artifacts/opsoul-hub/package.json ./artifacts/opsoul-hub/

# Production-only install
RUN npm_config_user_agent="pnpm/10.0.0 npm/? node/v20.0.0 linux x64" \
    pnpm install --frozen-lockfile --prod

# Copy built frontend dist
COPY --from=build-hub /app/artifacts/opsoul-hub/dist ./artifacts/opsoul-hub/dist

# Copy API source (tsx interprets at runtime)
COPY --from=build-api /app/artifacts/opsoul-api/src ./artifacts/opsoul-api/src
COPY --from=build-api /app/artifacts/opsoul-api/package.json ./artifacts/opsoul-api/package.json

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

# API serves static files from ../../artifacts/opsoul-hub/dist/public
# relative to its own cwd (artifacts/opsoul-api) — that resolves to
# /app/artifacts/opsoul-hub/dist/public, which is where the hub build lands.
WORKDIR /app/artifacts/opsoul-api
CMD ["npx", "tsx", "src/index.ts"]
