#!/usr/bin/env bash
# Upload the consolidated operator-api.md to the Nahil operator's KB as a
# single entry (no chunking — current OpSoul code stores whole docs).
#
# Pre-req: cleanup script ran (2026-06-02-nahil-kb-cleanup.sql) so old
# fragments are gone.
#
# Usage:
#   OPSOUL_HUB_KEY=<your-owner-key> NAHIL_OPERATOR_ID=<uuid> \
#     bash scripts/2026-06-02-nahil-kb-seed-operator-api.sh
#
# OPSOUL_HUB_KEY: owner-level Bearer token from Hub (Settings → API)
# NAHIL_OPERATOR_ID: UUID of the Nahil operator (Hub → Operators → Nahil → URL)

set -euo pipefail

OPSOUL_URL="${OPSOUL_URL:-https://opsoul.mangoforest-5c22eab7.uaenorth.azurecontainerapps.io}"
DOC_PATH="${DOC_PATH:-/Users/bstar/nahil_2/docs/operator-api.md}"

if [ -z "${OPSOUL_HUB_KEY:-}" ]; then
  echo "ERROR: OPSOUL_HUB_KEY env var required (owner Bearer token from Hub)"
  exit 1
fi
if [ -z "${NAHIL_OPERATOR_ID:-}" ]; then
  echo "ERROR: NAHIL_OPERATOR_ID env var required (UUID from Hub URL)"
  exit 1
fi
if [ ! -f "$DOC_PATH" ]; then
  echo "ERROR: doc not found at $DOC_PATH"
  exit 1
fi

DOC_BYTES=$(wc -c < "$DOC_PATH")
DOC_LINES=$(wc -l < "$DOC_PATH")
echo "Uploading $DOC_PATH ($DOC_BYTES bytes, $DOC_LINES lines) to operator $NAHIL_OPERATOR_ID..."

# Build JSON payload — text field is the whole doc, tags required, mark as
# operator API contract for future identification + cleanup.
TEXT_JSON=$(jq -Rs . < "$DOC_PATH")

PAYLOAD=$(jq -n \
  --argjson text "$TEXT_JSON" \
  '{
    text: $text,
    sourceName: "Nahil API Contract — operator-api.md",
    sourceUrl: "https://github.com/culturesouq/nahil_2/blob/main/docs/operator-api.md",
    sourceTrustLevel: "external_verified",
    confidenceScore: 95,
    entityType: "reference_document",
    tags: ["nahil-api", "operator-contract", "endpoints", "authentication"],
    privacyCleared: true,
    contentCleared: true,
    isPipelineIntake: false
  }')

# Hit the operator-kb POST endpoint (owner-only)
RESPONSE=$(curl -sS -X POST \
  -H "Authorization: Bearer $OPSOUL_HUB_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$OPSOUL_URL/api/operators/$NAHIL_OPERATOR_ID/kb")

echo "Response:"
echo "$RESPONSE" | jq .

# Verify success
OK=$(echo "$RESPONSE" | jq -r '.ok // false')
if [ "$OK" = "true" ]; then
  CHUNKS=$(echo "$RESPONSE" | jq -r '.chunksIngested')
  if [ "$CHUNKS" = "1" ]; then
    echo "✓ Upload OK — stored as 1 entry (no chunking applied)"
  else
    echo "⚠ Upload returned chunksIngested=$CHUNKS — chunking was applied unexpectedly"
    echo "   Check operator-kb.ts to confirm 'no chunking' rule is in current code"
    exit 1
  fi
else
  echo "✗ Upload failed"
  exit 1
fi
