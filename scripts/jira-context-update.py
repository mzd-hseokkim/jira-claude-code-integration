#!/usr/bin/env python3
"""Update jira-context.json files (worktree-local and/or aggregate) for a workflow step.

Usage:
    python3 scripts/jira-context-update.py <TASK-ID> <step> <status> <ctx-file> [<ctx-file>...]
    python3 scripts/jira-context-update.py --migrate-approach <ctx-file> [<ctx-file>...]

The --migrate-approach mode is a one-shot migration (MAE-357): for each task
that has both 'plan' and 'design' in completedSteps but is missing 'approach',
inserts 'approach' after the later of the two. No-op if already migrated.

Args:
    TASK-ID    Jira issue key (e.g. MAE-279).
    step       Workflow step name to append to completedSteps (e.g. "merge", "done").
               Must be one of: discover, create, init, start, approach, impl, test,
               review, merge, pr, done. Also drives the timestamp field name:
               "<step>At" (e.g. mergedAt, doneAt).
    status     Value to set as top-level `status` and (if present) `cachedIssue.status`.
               **Must be a Jira-verified value** — caller is responsible for fetching
               the post-transition status from Jira (`jira_get_issue` after
               `jira_transition_issue`) and passing the actual `fields.status.name`.
               Do NOT pass the transition target name (e.g. "Done") as-is, since the
               resulting status may differ ("완료", "검토중", etc. depending on workflow).
               Pass "-" to keep the existing status fields untouched (used by
               record-only steps like approach/impl/review that don't transition Jira).
    ctx-file   One or more .jira-context.json paths. Format auto-detected:
               - Aggregate: {"tasks": [...], ...}  → updates the matching tasks[i] entry.
               - Worktree:  {"taskId": ..., ...}   → updates top-level fields.

Behavior:
    - completedSteps: appends `step` (no-op if already present).
    - status: replaced.
    - <step>At: set to current UTC ISO 8601 (Z suffix). TZ-naive timestamps are
      treated as stale by the dashboard reader.
    - cachedIssue.status / cachedIssue.fetchedAt: updated when cachedIssue exists
      (never created from scratch — leave None as-is).

Exit codes:
    0  All requested files processed (missing files are skipped with a notice).
    2  Wrong arg count.
"""

from __future__ import annotations

import datetime
import json
import os
import sys


# Valid workflow step whitelist. Keep in sync with skill SKILL.md Progress lines
# and dashboard SDLC_STEPS. `plan`/`design`은 통합되어 `approach`로 대체됨.
VALID_STEPS = frozenset({
    "discover", "create", "init", "start", "approach",
    "impl", "test", "review", "merge", "pr", "done",
})


def _now_utc_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _apply_step(target: dict, step: str, status: str, ts: str) -> None:
    steps = target.get("completedSteps", [])
    if step not in steps:
        steps.append(step)
    target["completedSteps"] = steps
    target[f"{step}At"] = ts
    keep_status = status == "-"
    if not keep_status:
        target["status"] = status
    ci = target.get("cachedIssue")
    if isinstance(ci, dict):
        if not keep_status:
            ci["status"] = status
        ci["fetchedAt"] = ts


# Worktree-local fields that must never appear at the aggregate top level.
# A skill running with main-repo cwd can leak these into the aggregate
# (schema pollution); stripped on every aggregate update (self-healing).
# Step timestamps ("<step>At") are covered by the endswith check — the
# aggregate's own timestamp is "initialized" (no "At" suffix).
_AGGREGATE_POLLUTION_KEYS = frozenset({
    "taskId", "branch", "worktreePath", "summary", "priority",
    "status", "completedSteps", "cachedIssue", "parentEpic", "parentStory",
})


def _strip_aggregate_pollution(ctx: dict) -> list[str]:
    removed = sorted(
        k for k in ctx
        if k in _AGGREGATE_POLLUTION_KEYS or k.endswith("At")
    )
    for k in removed:
        del ctx[k]
    return removed


def update_context(ctx_file: str, task_id: str, step: str, status: str, ts: str) -> str:
    if not os.path.isfile(ctx_file):
        return f"missing: {ctx_file}"
    with open(ctx_file, "r", encoding="utf-8") as f:
        ctx = json.load(f)
    if isinstance(ctx.get("tasks"), list):
        removed = _strip_aggregate_pollution(ctx)
        if removed:
            print(
                f"warn: stripped worktree-local fields from aggregate top level: {removed}",
                file=sys.stderr,
            )
        updated = False
        for t in ctx["tasks"]:
            if t.get("taskId") == task_id:
                _apply_step(t, step, status, ts)
                updated = True
                break
        if updated or removed:
            with open(ctx_file, "w", encoding="utf-8") as f:
                json.dump(ctx, f, indent=2, ensure_ascii=False)
        if updated:
            return f"aggregate updated ({task_id}): {ctx_file}"
        return f"no {task_id} in aggregate, skipped: {ctx_file}"
    _apply_step(ctx, step, status, ts)
    with open(ctx_file, "w", encoding="utf-8") as f:
        json.dump(ctx, f, indent=2, ensure_ascii=False)
    return f"worktree updated: {ctx_file}"


def _migrate_target(t: dict) -> bool:
    """MAE-357 one-shot: insert 'approach' after plan+design when missing."""
    steps = t.get("completedSteps")
    if not isinstance(steps, list):
        return False
    if "plan" in steps and "design" in steps and "approach" not in steps:
        idx = max(steps.index("plan"), steps.index("design"))
        steps.insert(idx + 1, "approach")
        t["completedSteps"] = steps
        return True
    return False


def migrate_approach(ctx_file: str) -> str:
    if not os.path.isfile(ctx_file):
        return f"missing: {ctx_file}"
    with open(ctx_file, "r", encoding="utf-8") as f:
        ctx = json.load(f)
    migrated = 0
    if isinstance(ctx.get("tasks"), list):
        for t in ctx["tasks"]:
            if _migrate_target(t):
                migrated += 1
    elif _migrate_target(ctx):
        migrated = 1
    if migrated:
        with open(ctx_file, "w", encoding="utf-8") as f:
            json.dump(ctx, f, indent=2, ensure_ascii=False)
    return f"migrated {migrated} task(s): {ctx_file}"


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] == "--migrate-approach":
        for ctx_file in argv[2:]:
            print(migrate_approach(ctx_file))
        return 0
    if len(argv) < 5:
        print(__doc__, file=sys.stderr)
        return 2
    task_id, step, status = argv[1], argv[2], argv[3]
    if step not in VALID_STEPS:
        print(
            f"error: invalid step '{step}'. Valid steps: {sorted(VALID_STEPS)}",
            file=sys.stderr,
        )
        return 2
    ts = _now_utc_iso()
    for ctx_file in argv[4:]:
        print(update_context(ctx_file, task_id, step, status, ts))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
