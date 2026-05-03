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

# stdin → curl via pipe (--data-binary @-).
# Windows(Git Bash/MSYS2)에서는 비-ASCII 인자를 native exe에 넘기면
# UTF-8 → ANSI(CP949) 변환이 일어나 한글이 깨진다. argv 대신 stdin으로
# 흘려 변환을 우회한다.
PAYLOAD="$(cat)"

printf '%s' "${PAYLOAD}" | curl \
  --connect-timeout 0.5 \
  --max-time 1 \
  --noproxy '*' \
  -s \
  -o /dev/null \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-binary @- \
  "${INGEST_URL}?hook=${HOOK_NAME}" \
  || true

exit 0
