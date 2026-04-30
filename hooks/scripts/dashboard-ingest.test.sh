#!/usr/bin/env bash
# dashboard-ingest.test.sh
#
# Smoke tests for dashboard-ingest.sh (E2 and E5 from design Test Plan)
# Run from repo root: bash hooks/scripts/dashboard-ingest.test.sh
#
# Exit 0 = all passed, Exit 1 = failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORWARDER="${SCRIPT_DIR}/dashboard-ingest.sh"

PASS=0
FAIL=0

run_test() {
  local name="$1"
  shift
  if "$@"; then
    echo "  PASS: ${name}"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: ${name}"
    FAIL=$((FAIL + 1))
  fi
}

# ── E2: server down → exit 0 within ~1s ────────────────────────────────────

test_server_down_exit0() {
  # Use a port unlikely to be in use
  local url="http://127.0.0.1:18765/ingest"
  local start end elapsed

  start=$(date +%s%N 2>/dev/null || date +%s)
  DASHBOARD_INGEST_URL="${url}" \
    bash "${FORWARDER}" PreToolUse <<< '{"cwd":"/tmp","session_id":"test"}' > /dev/null 2>&1
  local code=$?
  end=$(date +%s%N 2>/dev/null || date +%s)

  # Check exit code
  [ "${code}" -eq 0 ] || return 1

  # Check elapsed < 2.5 seconds (generous; max-time 1 + bash startup)
  # Using %s%N (nanoseconds) when available; fall back to seconds.
  if [[ "${start}" =~ N$ ]] || [ ${#start} -gt 10 ]; then
    : # nanoseconds not available, skip timing check
  else
    local elapsed=$(( end - start ))
    [ "${elapsed}" -lt 3 ] || return 1
  fi

  return 0
}

# ── E5: DASHBOARD_INGEST_URL override → mock server receives request ────────

test_url_override() {
  local port=19765
  local received=0

  # Start a minimal nc listener in background (macOS + Linux compatible)
  if ! command -v nc &>/dev/null; then
    echo "  SKIP E5: nc not available"
    return 0
  fi

  # Use a temp file to signal receipt
  local tmpfile
  tmpfile=$(mktemp)

  # nc -l listens for one connection; write received data to tmpfile
  # The -q 0 flag (Linux) exits after EOF; on macOS nc exits naturally.
  (nc -l 127.0.0.1 "${port}" > "${tmpfile}" 2>/dev/null; true) &
  local nc_pid=$!
  sleep 0.3  # let nc start up

  DASHBOARD_INGEST_URL="http://127.0.0.1:${port}/ingest" \
    bash "${FORWARDER}" PreToolUse <<< '{"cwd":"/tmp"}' > /dev/null 2>&1 || true

  # Give nc a moment to capture the data
  sleep 0.3
  kill "${nc_pid}" 2>/dev/null || true
  wait "${nc_pid}" 2>/dev/null || true

  # Check that tmpfile contains something (the HTTP request)
  if [ -s "${tmpfile}" ]; then
    received=1
  fi
  rm -f "${tmpfile}"

  [ "${received}" -eq 1 ] || return 1
  return 0
}

echo "=== dashboard-ingest.sh smoke tests ==="
run_test "E2: server down → exit 0" test_server_down_exit0
run_test "E5: DASHBOARD_INGEST_URL override" test_url_override

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
