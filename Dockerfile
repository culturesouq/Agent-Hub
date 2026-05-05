FROM node:20-slim AS base

RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json tsconfig.json ./

# Copy all package.json files before install
COPY lib/db/package.json lib/db/
COPY lib/opsoul-utils/package.json lib/opsoul-utils/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY lib/integrations lib/integrations
COPY lib/integrations-openai-ai-react/package.json lib/integrations-openai-ai-react/
COPY lib/integrations-openai-ai-server/package.json lib/integrations-openai-ai-server/
COPY lib/integrations-openrouter-ai/package.json lib/integrations-openrouter-ai/
COPY artifacts/opsoul-api/package.json artifacts/opsoul-api/
COPY artifacts/opsoul-hub/package.json artifacts/opsoul-hub/
COPY scripts/package.json scripts/

# Install all dependencies (including devDeps needed for tsx + vite build)
RUN pnpm install --no-frozen-lockfile

# Copy all source
COPY lib ./lib
COPY artifacts/opsoul-api ./artifacts/opsoul-api
COPY artifacts/opsoul-hub ./artifacts/opsoul-hub
COPY scripts ./scripts

# Build React frontend (PORT + BASE_PATH required by vite.config.ts)
RUN PORT=3001 BASE_PATH=/ pnpm --filter @workspace/opsoul-hub run build

EXPOSE 3001

WORKDIR /app/artifacts/opsoul-api

CMD ["sh", "-c", "pnpm start"]
