#!/usr/bin/env bash
# append-review-log-wrapper.sh — jira-task-review Step 4.7 wrapper
#
# Wraps scripts/append-review-log.py with:
#   - reviewerVersion 산출 (jira-task-review/SKILL.md sha256 prefix 12자)
#   - SUBAGENT_RESULT_JSON 환경변수 → tmpfile (multi-line/quote 안전)
#   - cleanup
#
# Usage:
#   SUBAGENT_RESULT_JSON='<json>' bash scripts/append-review-log-wrapper.sh <TASK-ID> [<log-dir>]
#
# log-dir 기본값: docs/review-log
# 실패는 워크플로를 차단하지 않도록 caller가 set +e로 감싸 호출한다.

set +e

TASK_ID="${1:?TASK-ID required}"
LOG_DIR="${2:-docs/review-log}"

_GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$_GIT_ROOT" ]; then
    REVIEWER_VERSION=$(shasum -a 256 "$_GIT_ROOT/skills/jira-task-review/SKILL.md" 2>/dev/null | cut -c1-12)
fi
[ -z "$REVIEWER_VERSION" ] && REVIEWER_VERSION="unknown" && echo "⚠️ review-log: reviewerVersion 산출 실패, 'unknown'으로 기록"

# 스크립트 경로: 자기 자신과 같은 디렉토리의 append-review-log.py
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPEND_PY="$SCRIPT_DIR/append-review-log.py"

TMPFILE=$(mktemp /tmp/review_subagent_XXXXXX.json)
printf '%s' "$SUBAGENT_RESULT_JSON" > "$TMPFILE"

python3 "$APPEND_PY" "$TASK_ID" "$REVIEWER_VERSION" "$TMPFILE" "$LOG_DIR"
APPEND_EXIT=$?
rm -f "$TMPFILE" 2>/dev/null
[ $APPEND_EXIT -ne 0 ] && echo "⚠️ review-log append failed: Python 종료코드 $APPEND_EXIT"

exit $APPEND_EXIT
