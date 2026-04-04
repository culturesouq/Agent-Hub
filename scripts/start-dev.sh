#!/bin/bash
# OpSoul Platform — Start all development services
# Run this script to start both the API server and the frontend together.
# Both services also auto-start via the Replit artifact system.
#
# Usage: bash scripts/start-dev.sh

pnpm --filter @workspace/opsoul-api run dev &
API_PID=$!

pnpm --filter @workspace/opsoul-hub run dev &
HUB_PID=$!

echo "API server starting (pid $API_PID) — port 3001"
echo "OpSoul Hub frontend starting (pid $HUB_PID) — port 19165 → served at /"

wait
