#!/usr/bin/env bash
# dashboard-ingest.sh <HOOK_NAME>
#
# Claude Code hook forwarder: stdin(hook payload JSON) → POST /ingest
#
# Design ref: docs/design/MAE-210.design.md (Key Decisions #1–3)
# Principles:
#   - fail-silent: exit 0 always, no stdout/stderr output
#   - stdin passthrough: no parsing, no jq dependency
#   - timeout: --connect-timeout 0.5 --max-time 1

set +e

HOOK_NAME="${1:-}"
INGEST_URL="${DASHBOARD_INGEST_URL:-http://127.0.0.1:8765/ingest}"

# Read stdin into a variable so we can pass it to curl
# (piping directly from stdin works too, but -d @- is simpler and avoids
#  curl trying to read a closed stdin in some shells)
PAYLOAD="$(cat)"

curl \
  --connect-timeout 0.5 \
  --max-time 1 \
  --noproxy '*' \
  -s \
  -o /dev/null \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-binary "${PAYLOAD}" \
  "${INGEST_URL}?hook=${HOOK_NAME}" \
  || true

exit 0
