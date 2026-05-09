FROM node:20-slim AS base
WORKDIR /app

RUN npm install -g pnpm@10

# ── Copy workspace root config ────────────────────────────────────
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./

# ── Copy all package.json files for install ───────────────────────
COPY lib/ ./lib/
COPY artifacts/opsoul-api/package.json ./artifacts/opsoul-api/
COPY artifacts/opsoul-hub/package.json ./artifacts/opsoul-hub/

# ── Install all dependencies ──────────────────────────────────────
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm_config_user_agent="pnpm/10.0.0 npm/? node/v20.0.0 linux x64" \
    pnpm install --no-frozen-lockfile

# ── Copy full source ──────────────────────────────────────────────
COPY artifacts/opsoul-api ./artifacts/opsoul-api
COPY artifacts/opsoul-hub ./artifacts/opsoul-hub

# ── Build frontend ────────────────────────────────────────────────
RUN npm_config_user_agent="pnpm/10.0.0 npm/? node/v20.0.0 linux x64" \
    PORT=5000 BASE_PATH=/ \
    pnpm --filter @workspace/opsoul-hub run build

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

WORKDIR /app/artifacts/opsoul-api
CMD ["npx", "tsx", "src/index.ts"]
