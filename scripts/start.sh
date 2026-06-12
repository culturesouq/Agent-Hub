#!/bin/bash
set -e

echo "OpSoul — Self-hosted Setup"
echo "--------------------------"

# Check docker
if ! command -v docker &>/dev/null; then
  echo "Docker is not installed. Install Docker Desktop from https://docker.com/products/docker-desktop"
  exit 1
fi

# First run: copy template
if [ ! -f .env ]; then
  cp .env.template .env
  echo "Created .env — please fill in your API key and other settings, then run this script again."
  open .env 2>/dev/null || xdg-open .env 2>/dev/null || echo "Edit .env in your text editor."
  exit 0
fi

# Check required vars
set -a
source .env
set +a

if [ -z "$OPENROUTER_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
  echo "Add at least one AI model API key to .env (OPENROUTER_API_KEY recommended), then run again."
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "JWT_SECRET is not set. Generate one with: openssl rand -hex 32"
  echo "Then add it to .env and run again."
  exit 1
fi

docker compose pull 2>/dev/null || true
docker compose up -d --build

echo ""
echo "OpSoul is running at http://localhost:${PORT:-3001}"
echo "Open that URL in your browser to complete setup."
