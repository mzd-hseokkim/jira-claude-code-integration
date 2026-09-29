#!/usr/bin/env bash
# Upload one or more files as attachments to a Jira issue.
#
# Usage:
#   scripts/jira-attach.sh <ISSUE-KEY> <FILE> [FILE ...]
#
# Thin compatibility wrapper over `jira-cli.py attach` — credentials are resolved
# by jira-cli.py (.jira-context.json `jira` block → env → legacy MCP config).
# Prints `HTTP <code>: <file>` per upload, exit 0 always (caller decides on failure).

set -u

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <ISSUE-KEY> <FILE> [FILE ...]" >&2
  exit 2
fi

ISSUE_KEY="$1"
shift

JIRA_CLI="$(cd "$(dirname "$0")" && pwd)/jira-cli.py"

for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "SKIP (missing): $f" >&2
    continue
  fi
  if err=$(python3 "$JIRA_CLI" attach "$ISSUE_KEY" "$f" 2>&1 >/dev/null); then
    code=200
  else
    code=$(printf '%s' "$err" | sed -n 's/^jira-cli: \([0-9][0-9][0-9]\) .*/\1/p' | head -n1)
    [ -n "$code" ] || code=000
    printf '%s\n' "$err" >&2
  fi
  echo "HTTP ${code}: ${f}"
done
