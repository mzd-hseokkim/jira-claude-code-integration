#!/usr/bin/env bash
# Propagate MCP server config from main repo to a git worktree.
#
# Usage:
#   scripts/propagate-mcp-config.sh <REPO_ROOT_ABS> <WORKTREE_ABS>
#
# Exit codes:
#   0  success or skipped (caller does not need to branch)
#   2  wrong number of arguments
#
# Stdout: progress messages
# Stderr: warnings (atlassian server missing, propagation skipped, etc.)
#
# Source priority order:
#   1. <repo>/.mcp.json          → copy to <worktree>/.mcp.json
#   2. ~/.claude.json projects[repo].mcpServers  → inject into worktree entry
#   3. ~/.claude.json top-level mcpServers        → inject into worktree entry
#   4. none found → print guidance and exit 0 (skip)

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <REPO_ROOT_ABS> <WORKTREE_ABS>" >&2
  exit 2
fi

REPO_ROOT_ABS="$1"
WORKTREE_ABS="$2"

python3 - "$REPO_ROOT_ABS" "$WORKTREE_ABS" << 'PYEOF'
import json, os, re, shutil, sys

repo_root_arg = sys.argv[1]
worktree_path_arg = sys.argv[2]

def norm(p):
    p = p.replace("\\", "/").rstrip("/")
    m = re.match(r'^/([a-zA-Z])(/.*)', p)
    if m:
        p = m.group(1).upper() + ':' + m.group(2)
    return p

repo_root = norm(repo_root_arg)
worktree_path = norm(worktree_path_arg)

# Source candidates (priority order)
src_mcp_json = os.path.join(repo_root_arg, ".mcp.json")
claude_json_path = os.path.expanduser("~/.claude.json")
claude_data = None
if os.path.exists(claude_json_path):
    with open(claude_json_path, "r", encoding="utf-8") as f:
        claude_data = json.load(f)

mcp_servers = None
source = None

# 1) project-scoped .mcp.json
if os.path.exists(src_mcp_json):
    with open(src_mcp_json, "r", encoding="utf-8") as f:
        mcp_servers = json.load(f).get("mcpServers", {}) or None
    if mcp_servers:
        source = "project_mcp_json"

# 2) ~/.claude.json projects[repo].mcpServers
if not mcp_servers and claude_data:
    for k, v in claude_data.get("projects", {}).items():
        if isinstance(v, dict) and norm(k) == repo_root:
            cand = v.get("mcpServers") or None
            if cand:
                mcp_servers = cand
                source = "claude_json_project"
            break

# 3) ~/.claude.json top-level mcpServers (user scope)
if not mcp_servers and claude_data:
    cand = claude_data.get("mcpServers") or None
    if cand:
        mcp_servers = cand
        source = "claude_json_user"

if not mcp_servers:
    print("No MCP servers found in .mcp.json or ~/.claude.json — skipping propagation")
    print("WARNING: this plugin requires the 'atlassian' MCP server. Run /jira setup if needed.", file=sys.stderr)
    sys.exit(0)

if "atlassian" not in mcp_servers:
    print(f"WARNING: 'atlassian' server not found in {source}; this plugin will not work in the worktree.", file=sys.stderr)
    print(f"Found servers: {list(mcp_servers.keys())}", file=sys.stderr)

# Propagate
if source == "project_mcp_json":
    shutil.copyfile(src_mcp_json, os.path.join(worktree_path_arg, ".mcp.json"))
    print(f"Copied .mcp.json to worktree (servers: {list(mcp_servers.keys())})")
else:
    # Inject into ~/.claude.json projects[worktree]
    projects = claude_data.setdefault("projects", {})
    matched = False
    for k in list(projects.keys()):
        if norm(k) == worktree_path:
            if isinstance(projects[k], dict):
                projects[k]["mcpServers"] = mcp_servers
            matched = True
            break
    if not matched:
        projects[worktree_path_arg] = {"mcpServers": mcp_servers}
    with open(claude_json_path, "w", encoding="utf-8") as f:
        json.dump(claude_data, f, indent=2, ensure_ascii=False)
    print(f"Injected mcpServers into ~/.claude.json for worktree (source: {source}, servers: {list(mcp_servers.keys())})")
PYEOF
