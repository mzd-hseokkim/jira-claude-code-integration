#!/usr/bin/env bash
# Upload one or more files as attachments to a Jira issue.
#
# Usage:
#   scripts/jira-attach.sh <ISSUE-KEY> <FILE> [FILE ...]
#
# Resolves Jira credentials in this order:
#   1. Environment variables (JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN)
#   2. <repo>/.mcp.json (project)
#   3. ~/.claude.json (top-level mcpServers + projects[<path>].mcpServers)
#   4. <repo>/.claude/settings.local.json
#   5. ~/.claude/settings.json
#
# In a worktree, repo root is read from .jira-context.json's `repoRoot` if present.
# Prints `HTTP <code>: <file>` per upload, exit 0 always (caller decides on failure).

set -u

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <ISSUE-KEY> <FILE> [FILE ...]" >&2
  exit 2
fi

ISSUE_KEY="$1"
shift

JIRA_URL="${JIRA_URL:-}"
JIRA_USERNAME="${JIRA_USERNAME:-}"
JIRA_API_TOKEN="${JIRA_API_TOKEN:-}"

if [ -z "$JIRA_URL" ]; then
  _root="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
  if [ -f ".jira-context.json" ]; then
    _ctx_root=$(node -e "try{console.log(require('./.jira-context.json').repoRoot||'')}catch{console.log('')}" 2>/dev/null)
    [ -n "$_ctx_root" ] && _root="$_ctx_root"
  fi
  _top='const m=s.mcpServers?.atlassian||s.mcpServers?.jira||{};'
  _proj='const p=Object.values(s.projects||{}).find(p=>p.mcpServers?.atlassian||p.mcpServers?.jira);const pm=p?(p.mcpServers.atlassian||p.mcpServers.jira):{};'
  _env='const e=(m.env&&m.env.JIRA_URL?m:pm).env||{}'
  _extract="${_top}${_proj}${_env}"
  _home=$(node -p "require('os').homedir().split(String.fromCharCode(92)).join('/')")
  for _f in "${_root}/.mcp.json" "${_home}/.claude.json" "${_root}/.claude/settings.local.json" "${_home}/.claude/settings.json"; do
    [ -f "$_f" ] || continue
    JIRA_URL=$(node -e "const s=require('$_f');${_extract};console.log(e.JIRA_URL||'')" 2>/dev/null)
    [ -n "$JIRA_URL" ] || continue
    JIRA_USERNAME=$(node -e "const s=require('$_f');${_extract};console.log(e.JIRA_USERNAME||'')" 2>/dev/null)
    JIRA_API_TOKEN=$(node -e "const s=require('$_f');${_extract};console.log(e.JIRA_API_TOKEN||'')" 2>/dev/null)
    break
  done
fi

if [ -z "$JIRA_URL" ] || [ -z "$JIRA_USERNAME" ] || [ -z "$JIRA_API_TOKEN" ]; then
  echo "ERROR: Jira credentials not found (JIRA_URL/JIRA_USERNAME/JIRA_API_TOKEN)" >&2
  exit 3
fi

AUTH=$(printf '%s:%s' "$JIRA_USERNAME" "$JIRA_API_TOKEN" | base64 | tr -d '\n')

for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "SKIP (missing): $f" >&2
    continue
  fi
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Basic $AUTH" \
    -H "X-Atlassian-Token: no-check" \
    -F "file=@${f}" \
    "${JIRA_URL}/rest/api/3/issue/${ISSUE_KEY}/attachments")
  echo "HTTP ${code}: ${f}"
done
