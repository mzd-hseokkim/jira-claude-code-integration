#!/usr/bin/env python3
"""Clean up git worktrees and branches for completed Jira tasks.

Usage:
    python clean-worktree.py <TASK-ID> [TASK-ID ...]
    python clean-worktree.py --all          # clean all worktrees with merged/done status
    python clean-worktree.py --list         # list worktrees and their status
    python clean-worktree.py --dry-run <TASK-ID>  # show what would be done

The script:
  1. Unlinks every junction/symlink inside the worktree (link only, target kept)
  2. Removes the git worktree for each TASK-ID
  3. Deletes the feature/<TASK-ID> branch
  4. Removes the MCP config entry from ~/.claude.json
  5. Cleans up .jira-context.json entries

Why step 1 exists (verified 2026-08-26, git 2.53 / Windows):
  `git worktree remove` FOLLOWS directory junctions (and dir symlinks) while
  deleting the worktree. A worktree whose `node_modules` is a junction to the
  main repo's `node_modules` therefore wipes the main repo's node_modules — and,
  through npm-workspace links such as `node_modules/@scope/pkg -> packages/pkg`,
  the main repo's `packages/**` source too. `--force` is not required for this
  when the linked dir is gitignored. rm -rf / Remove-Item / fs.rmSync /
  shutil.rmtree all unlink correctly; only git recurses. So links are removed
  first and git is only invoked once the tree is verified link-free.
"""

import argparse
import json
import os
import stat
import subprocess
import sys

FILE_ATTRIBUTE_REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


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


def is_reparse_point(path):
    """True for junctions, directory symlinks and file symlinks (never follows)."""
    try:
        st = os.lstat(path)
    except OSError:
        return False
    if stat.S_ISLNK(st.st_mode):
        return True
    return bool(getattr(st, "st_file_attributes", 0) & FILE_ATTRIBUTE_REPARSE_POINT)


def find_reparse_points(root):
    """List every junction/symlink under root WITHOUT descending into any of them.

    os.walk would descend into junctions (Python does not treat them as symlinks),
    so this uses an explicit scandir stack and checks the reparse attribute first.
    """
    found = []
    stack = [root]
    while stack:
        d = stack.pop()
        try:
            entries = list(os.scandir(d))
        except OSError:
            continue
        for e in entries:
            if is_reparse_point(e.path):
                try:
                    target = os.readlink(e.path)
                except OSError:
                    target = "?"
                found.append((e.path.replace("\\", "/"), target))
            elif e.is_dir(follow_symlinks=False):
                stack.append(e.path)
    return found


def unlink_reparse_points(worktree_path, dry_run=False):
    """Remove links inside the worktree (link only). Returns False if any remain."""
    links = find_reparse_points(worktree_path)
    if not links:
        return True
    print(f"  {len(links)} link(s) inside worktree — unlinking (targets are kept):")
    for p, target in links:
        print(f"    {p}  ->  {target}")
        if dry_run:
            continue
        try:
            if os.path.isdir(p):
                os.rmdir(p)      # junction / directory symlink: removes the link only
            else:
                os.unlink(p)     # file symlink
        except OSError as exc:
            print(f"  ERROR: could not unlink {p}: {exc}")
    if dry_run:
        return True
    remaining = find_reparse_points(worktree_path)
    if remaining:
        print(f"  ERROR: {len(remaining)} link(s) still present — refusing to run "
              f"`git worktree remove` (it would follow them into their targets).")
        for p, target in remaining:
            print(f"    {p}  ->  {target}")
        return False
    return True


def assert_safe_worktree_path(repo_root, worktree_base, worktree_path):
    """Hard guard: never operate on the main repo or anything outside worktree_base."""
    r, b, w = norm(repo_root).lower(), norm(worktree_base).lower(), norm(worktree_path).lower()
    if w == r or r.startswith(w + "/"):
        raise SystemExit(f"REFUSED: worktree path {worktree_path} is (or contains) the main repo {repo_root}")
    if not w.startswith(b + "/"):
        raise SystemExit(f"REFUSED: worktree path {worktree_path} is outside worktree base {worktree_base}")


def count_missing_tracked(repo_root):
    """Number of tracked files deleted from the main repo's working tree."""
    result = subprocess.run(
        ["git", "-C", repo_root, "ls-files", "--deleted"],
        capture_output=True, text=True
    )
    return len(result.stdout.split()) if result.returncode == 0 else 0


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
    assert_safe_worktree_path(repo_root, worktree_base, worktree_path)

    # 1. Remove worktree — links first, git second (see module docstring)
    if os.path.exists(worktree_path):
        print(f"  Removing worktree: {worktree_path}")
        if not unlink_reparse_points(worktree_path, dry_run=dry_run):
            print(f"  Skipping {task_id}: worktree left in place, nothing else changed.")
            return
        if not dry_run:
            missing_before = count_missing_tracked(repo_root)
            result = subprocess.run(
                ["git", "-C", repo_root, "worktree", "remove", worktree_path, "--force"],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                print(f"  WARNING: worktree remove failed: {result.stderr.strip()}")
            else:
                print(f"  Worktree removed.")
            missing_after = count_missing_tracked(repo_root)
            if missing_after > missing_before:
                print(f"  !!! MAIN REPO DAMAGED: {missing_after - missing_before} tracked file(s) "
                      f"disappeared from {repo_root} during worktree removal.")
                print(f"  !!! Restore with: git -C \"{repo_root}\" checkout -- .   "
                      f"(then re-run npm ci / equivalent for ignored dirs)")
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

    # 4. Clean .jira-context.json (repo root)
    #
    # 두 가지 형태가 있다:
    #  - 워크트리 컨텍스트: {"taskId": ..., "branch": ..., ...}  단일 태스크용
    #  - 메인 레포 통합 컨텍스트: {"tasks": [...], "worktreeBase": ..., ...}  태스크 이력 누적
    # 메인 레포에서 실행되는 clean이 메인 컨텍스트를 통째로 삭제하면 누적 이력이 전부 날아간다.
    # 따라서 메인 컨텍스트(`tasks` 배열 보유)는 절대 삭제하지 않고, 해당 태스크 항목만 제거한다.
    # 워크트리 컨텍스트가 우연히 repo root에 있는 경우(taskId 일치)에만 파일 자체를 삭제.
    ctx_path = os.path.join(repo_root, ".jira-context.json")
    if os.path.exists(ctx_path):
        with open(ctx_path, "r", encoding="utf-8") as f:
            ctx = json.load(f)

        is_aggregate = isinstance(ctx.get("tasks"), list)

        if is_aggregate:
            before = len(ctx["tasks"])
            ctx["tasks"] = [t for t in ctx["tasks"] if t.get("taskId") != task_id]
            removed = before - len(ctx["tasks"])
            # 메인 컨텍스트 최상위에 워크트리 필드가 섞여 들어간 경우(과거 스킬의 사이드 이펙트) 정리
            wt_field_keys = ("taskId", "branch", "worktreePath", "summary",
                             "priority", "status", "completedSteps",
                             "startedAt", "mergedAt", "completedAt", "cachedIssue")
            stale_keys = [k for k in wt_field_keys
                          if k in ctx and (k != "taskId" or ctx.get(k) == task_id)]
            for k in stale_keys:
                ctx.pop(k, None)
            if not dry_run and (removed or stale_keys):
                save_context(repo_root, ctx)
            if removed:
                print(f"  Removed {task_id} entry from aggregate .jira-context.json ({before} → {len(ctx['tasks'])})")
            else:
                print(f"  No {task_id} entry in aggregate .jira-context.json")
            if stale_keys:
                print(f"  Cleaned stale top-level keys: {stale_keys}")
        elif ctx.get("taskId") == task_id:
            print(f"  Clearing worktree-style .jira-context.json (taskId: {task_id})")
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
