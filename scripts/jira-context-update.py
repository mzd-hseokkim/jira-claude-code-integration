#!/usr/bin/env python3
"""Update jira-context.json files (worktree-local and/or aggregate) for a workflow step.

Usage:
    python3 scripts/jira-context-update.py <TASK-ID> <step> <status> <ctx-file> [<ctx-file>...] [--patch '<json>']
    python3 scripts/jira-context-update.py --migrate-approach <ctx-file> [<ctx-file>...]

--patch '<json>' (v0.58.0): worktree-local 파일에만 top-level 키를 병합한다 (aggregate에는 적용 안 함 —
    pollution 규칙). implSelfCheck / fixSelfCheck 객체에 ranAt이 없으면 현재 UTC로 채운다.
    용도: impl/fix 단계가 self-check 기록과 completedSteps 갱신을 Bash 1회로 끝내기.
    step에 "-"를 주면 completedSteps 추가·타임스탬프 기록 없이 patch만 적용한다 (fix loop의 test/review 제거용).
    갱신 후 worktree 파일의 completedSteps를 `completedSteps=[...]`로 출력하므로 재-Read가 필요 없다.

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
    "implSelfCheck", "fixSelfCheck",
})


def _strip_aggregate_pollution(ctx: dict) -> list[str]:
    removed = sorted(
        k for k in ctx
        if k in _AGGREGATE_POLLUTION_KEYS or k.endswith("At")
    )
    for k in removed:
        del ctx[k]
    return removed


def update_context(ctx_file: str, task_id: str, step: str, status: str, ts: str,
                   patch: dict | None = None) -> str:
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
            if t.get("taskId") == task_id and step != "-":
                _apply_step(t, step, status, ts)
                updated = True
                break
        if updated or removed:
            with open(ctx_file, "w", encoding="utf-8") as f:
                json.dump(ctx, f, indent=2, ensure_ascii=False)
        if updated:
            return f"aggregate updated ({task_id}): {ctx_file}"
        return f"no {task_id} in aggregate, skipped: {ctx_file}"
    if step != "-":
        _apply_step(ctx, step, status, ts)
    if patch:
        for k, v in patch.items():
            if k in ("implSelfCheck", "fixSelfCheck") and isinstance(v, dict) and not v.get("ranAt"):
                v = {**v, "ranAt": ts}
            ctx[k] = v
    with open(ctx_file, "w", encoding="utf-8") as f:
        json.dump(ctx, f, indent=2, ensure_ascii=False)
    steps = json.dumps(ctx.get("completedSteps", []), ensure_ascii=False)
    return f"worktree updated: {ctx_file}\ncompletedSteps={steps}"


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
    patch = None
    if "--patch" in argv:
        i = argv.index("--patch")
        if i + 1 >= len(argv):
            print("error: --patch requires a JSON argument", file=sys.stderr)
            return 2
        try:
            patch = json.loads(argv[i + 1])
        except ValueError as e:
            print(f"error: --patch JSON 파싱 실패: {e}", file=sys.stderr)
            return 2
        argv = argv[:i] + argv[i + 2:]
    if len(argv) < 5:
        print(__doc__, file=sys.stderr)
        return 2
    task_id, step, status = argv[1], argv[2], argv[3]
    if step == "-" and not patch:
        print("error: step '-' (record-only)는 --patch와 함께만 쓸 수 있다", file=sys.stderr)
        return 2
    if step != "-" and step not in VALID_STEPS:
        print(
            f"error: invalid step '{step}'. Valid steps: {sorted(VALID_STEPS)}",
            file=sys.stderr,
        )
        return 2
    ts = _now_utc_iso()
    for ctx_file in argv[4:]:
        print(update_context(ctx_file, task_id, step, status, ts, patch))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
