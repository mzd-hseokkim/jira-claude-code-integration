#!/usr/bin/env python3
"""Clean up git worktrees and branches for completed Jira tasks.

Usage:
    python clean-worktree.py <TASK-ID> [TASK-ID ...]
    python clean-worktree.py --all          # clean all worktrees with merged/done status
    python clean-worktree.py --list         # list worktrees and their status
    python clean-worktree.py --dry-run <TASK-ID>  # show what would be done

The script:
  1. Removes the git worktree for each TASK-ID
  2. Deletes the feature/<TASK-ID> branch
  3. Removes the MCP config entry from ~/.claude.json
  4. Cleans up .jira-context.json entries
"""

import argparse
import json
import os
import subprocess
import sys


def get_repo_root():
    """Get the main repo root from git worktree list."""
    result = subprocess.run(
        ["git", "worktree", "list", "--porcelain"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        # Fallback: try from current directory
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True
        )
        return result.stdout.strip().replace("\\", "/") if result.returncode == 0 else None

    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            return line[len("worktree "):].strip().replace("\\", "/")
    return None


def get_worktree_base(repo_root):
    """Derive the worktree base directory from repo root.

    Convention: ../<project-name>_worktree/
    """
    parent = os.path.dirname(repo_root)
    project_name = os.path.basename(repo_root)
    return os.path.join(parent, f"{project_name}_worktree").replace("\\", "/")


def norm(p):
    return p.replace("\\", "/").rstrip("/")


def list_worktrees(repo_root):
    """List all worktrees with their branch and status info."""
    result = subprocess.run(
        ["git", "-C", repo_root, "worktree", "list", "--porcelain"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        return []

    worktrees = []
    current = {}
    for line in result.stdout.splitlines():
        if line.startswith("worktree "):
            if current:
                worktrees.append(current)
            current = {"path": norm(line[len("worktree "):])}
        elif line.startswith("branch "):
            current["branch"] = line[len("branch "):]
        elif line == "bare":
            current["bare"] = True
    if current:
        worktrees.append(current)

    return worktrees


def extract_task_id(branch):
    """Extract TASK-ID from refs/heads/feature/<TASK-ID>."""
    prefix = "refs/heads/feature/"
    if branch and branch.startswith(prefix):
        return branch[len(prefix):]
    return None


def load_context(repo_root):
    """Load .jira-context.json from repo root."""
    ctx_path = os.path.join(repo_root, ".jira-context.json")
    if os.path.exists(ctx_path):
        with open(ctx_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_context(repo_root, ctx):
    """Save .jira-context.json to repo root."""
    ctx_path = os.path.join(repo_root, ".jira-context.json")
    with open(ctx_path, "w", encoding="utf-8") as f:
        json.dump(ctx, f, indent=2, ensure_ascii=False)


def remove_mcp_config(worktree_path):
    """Remove MCP server config for this worktree from ~/.claude.json."""
    claude_json = os.path.expanduser("~/.claude.json")
    if not os.path.exists(claude_json):
        return

    with open(claude_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    projects = data.get("projects", {})
    target = norm(worktree_path)

    matched_key = None
    for k in list(projects.keys()):
        if norm(k) == target:
            matched_key = k
            break

    if matched_key and isinstance(projects[matched_key], dict):
        if "mcpServers" in projects[matched_key]:
            projects[matched_key].pop("mcpServers")
            # If the entry is now empty, remove it entirely
            if not projects[matched_key]:
                del projects[matched_key]
            with open(claude_json, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"  MCP config removed from ~/.claude.json for {target}")
        else:
            print(f"  No MCP config found for {target}")
    else:
        print(f"  No ~/.claude.json entry for {target}")


def clean_task(repo_root, task_id, dry_run=False):
    """Clean up worktree and branch for a single task."""
    worktree_base = get_worktree_base(repo_root)
    worktree_path = os.path.join(worktree_base, task_id).replace("\\", "/")
    branch_name = f"feature/{task_id}"

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Cleaning {task_id}:")

    # 1. Remove worktree
    if os.path.exists(worktree_path):
        print(f"  Removing worktree: {worktree_path}")
        if not dry_run:
            result = subprocess.run(
                ["git", "-C", repo_root, "worktree", "remove", worktree_path, "--force"],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                print(f"  WARNING: worktree remove failed: {result.stderr.strip()}")
            else:
                print(f"  Worktree removed.")
    else:
        # Worktree dir might not exist but git may still track it
        result = subprocess.run(
            ["git", "-C", repo_root, "worktree", "remove", worktree_path, "--force"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"  Worktree reference removed (dir already gone).")
        else:
            print(f"  No worktree found at {worktree_path}")

    # 2. Delete branch
    result = subprocess.run(
        ["git", "-C", repo_root, "branch", "--list", branch_name],
        capture_output=True, text=True
    )
    if result.stdout.strip():
        print(f"  Deleting branch: {branch_name}")
        if not dry_run:
            result = subprocess.run(
                ["git", "-C", repo_root, "branch", "-D", branch_name],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                print(f"  WARNING: branch delete failed: {result.stderr.strip()}")
            else:
                print(f"  Branch deleted.")
    else:
        print(f"  No branch found: {branch_name}")

    # 3. Remove MCP config
    if not dry_run:
        remove_mcp_config(worktree_path)
    else:
        print(f"  Would remove MCP config for {worktree_path}")

    # 4. Clean .jira-context.json
    ctx_path = os.path.join(repo_root, ".jira-context.json")
    if os.path.exists(ctx_path):
        with open(ctx_path, "r", encoding="utf-8") as f:
            ctx = json.load(f)

        if ctx.get("taskId") == task_id:
            print(f"  Clearing .jira-context.json (active task: {task_id})")
            if not dry_run:
                os.remove(ctx_path)
                print(f"  Context file removed.")
        else:
            print(f"  .jira-context.json belongs to {ctx.get('taskId', '?')}, skipping")

    # Also clean worktree-local context
    wt_ctx_path = os.path.join(worktree_path, ".jira-context.json")
    if os.path.exists(wt_ctx_path) and not dry_run:
        os.remove(wt_ctx_path)

    print(f"  Done." if not dry_run else f"  [DRY RUN] No changes made.")


def find_cleanable_tasks(repo_root):
    """Find tasks whose worktrees can be cleaned (merged or done status)."""
    worktrees = list_worktrees(repo_root)
    cleanable = []

    for wt in worktrees:
        if wt.get("bare") or norm(wt["path"]) == norm(repo_root):
            continue
        task_id = extract_task_id(wt.get("branch", ""))
        if not task_id:
            continue

        # Check context in the worktree
        ctx_path = os.path.join(wt["path"], ".jira-context.json")
        status = None
        completed_steps = []
        if os.path.exists(ctx_path):
            with open(ctx_path, "r", encoding="utf-8") as f:
                ctx = json.load(f)
            status = ctx.get("status", "")
            completed_steps = ctx.get("completedSteps", [])

        cleanable.append({
            "task_id": task_id,
            "path": wt["path"],
            "branch": wt.get("branch", ""),
            "status": status,
            "completedSteps": completed_steps,
        })

    return cleanable


def main():
    parser = argparse.ArgumentParser(description="Clean up Jira task worktrees and branches")
    parser.add_argument("tasks", nargs="*", help="TASK-ID(s) to clean")
    parser.add_argument("--all", action="store_true", help="Clean all worktrees with merged/done status")
    parser.add_argument("--list", action="store_true", help="List worktrees and their status")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without executing")
    args = parser.parse_args()

    repo_root = get_repo_root()
    if not repo_root:
        print("ERROR: Could not determine git repo root.", file=sys.stderr)
        sys.exit(1)

    print(f"Repo root: {repo_root}")

    if args.list:
        tasks = find_cleanable_tasks(repo_root)
        if not tasks:
            print("\nNo task worktrees found.")
            return

        print(f"\nTask worktrees ({len(tasks)}):")
        print(f"{'TASK-ID':<15} {'STATUS':<15} {'STEPS':<40} PATH")
        print("-" * 100)
        for t in tasks:
            steps = ", ".join(t["completedSteps"]) if t["completedSteps"] else "-"
            status = t["status"] or "-"
            print(f"{t['task_id']:<15} {status:<15} {steps:<40} {t['path']}")
        return

    if args.all:
        tasks = find_cleanable_tasks(repo_root)
        done_tasks = [t for t in tasks if t.get("status") in ("Done", "In Review")
                      or "merge" in t.get("completedSteps", [])
                      or "done" in t.get("completedSteps", [])]

        if not done_tasks:
            print("\nNo merged/done worktrees to clean.")
            return

        print(f"\nFound {len(done_tasks)} cleanable task(s):")
        for t in done_tasks:
            print(f"  - {t['task_id']} (status: {t.get('status', '-')})")

        if not args.dry_run:
            answer = input("\nProceed? [y/N] ")
            if answer.lower() != "y":
                print("Aborted.")
                return

        for t in done_tasks:
            clean_task(repo_root, t["task_id"], dry_run=args.dry_run)

        print(f"\n{'[DRY RUN] ' if args.dry_run else ''}All done.")
        return

    if not args.tasks:
        parser.print_help()
        sys.exit(1)

    for task_id in args.tasks:
        clean_task(repo_root, task_id, dry_run=args.dry_run)

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}All done.")


if __name__ == "__main__":
    main()
