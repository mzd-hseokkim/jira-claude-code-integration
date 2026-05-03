#!/usr/bin/env python3
"""Update jira-context.json files (worktree-local and/or aggregate) for a workflow step.

Usage:
    python3 scripts/jira-context-update.py <TASK-ID> <step> <status> <ctx-file> [<ctx-file>...]

Args:
    TASK-ID    Jira issue key (e.g. MAE-279).
    step       Workflow step name to append to completedSteps (e.g. "merge", "done").
               Also drives the timestamp field name: "<step>At" (e.g. mergedAt, doneAt).
    status     Value to set as top-level `status` and (if present) `cachedIssue.status`.
               **Must be a Jira-verified value** — caller is responsible for fetching
               the post-transition status from Jira (`jira_get_issue` after
               `jira_transition_issue`) and passing the actual `fields.status.name`.
               Do NOT pass the transition target name (e.g. "Done") as-is, since the
               resulting status may differ ("완료", "검토중", etc. depending on workflow).
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


def _now_utc_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _apply_step(target: dict, step: str, status: str, ts: str) -> None:
    steps = target.get("completedSteps", [])
    if step not in steps:
        steps.append(step)
    target["completedSteps"] = steps
    target["status"] = status
    target[f"{step}At"] = ts
    ci = target.get("cachedIssue")
    if isinstance(ci, dict):
        ci["status"] = status
        ci["fetchedAt"] = ts


def update_context(ctx_file: str, task_id: str, step: str, status: str, ts: str) -> str:
    if not os.path.isfile(ctx_file):
        return f"missing: {ctx_file}"
    with open(ctx_file, "r", encoding="utf-8") as f:
        ctx = json.load(f)
    if isinstance(ctx.get("tasks"), list):
        for t in ctx["tasks"]:
            if t.get("taskId") == task_id:
                _apply_step(t, step, status, ts)
                with open(ctx_file, "w", encoding="utf-8") as f:
                    json.dump(ctx, f, indent=2, ensure_ascii=False)
                return f"aggregate updated ({task_id}): {ctx_file}"
        return f"no {task_id} in aggregate, skipped: {ctx_file}"
    _apply_step(ctx, step, status, ts)
    with open(ctx_file, "w", encoding="utf-8") as f:
        json.dump(ctx, f, indent=2, ensure_ascii=False)
    return f"worktree updated: {ctx_file}"


def main(argv: list[str]) -> int:
    if len(argv) < 5:
        print(__doc__, file=sys.stderr)
        return 2
    task_id, step, status = argv[1], argv[2], argv[3]
    ts = _now_utc_iso()
    for ctx_file in argv[4:]:
        print(update_context(ctx_file, task_id, step, status, ts))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
