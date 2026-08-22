"""append-run-log.py: auto/loop 실행 기록(run-log) append CLI.

Usage:
    python3 scripts/append-run-log.py <task_id> <result_file> <ctx_file> <log_dir> [--kind auto|loop-run]

Arguments:
    task_id      Jira task key (e.g. MAE-453). loop-run이면 "-" 허용.
    result_file  Workflow 반환 객체(JSON) 파일 경로. "-"이면 stdin.
    ctx_file     worktree-local .jira-context.json (단계 타임스탬프 소스). loop-run이면 "-" 허용.
    log_dir      run-log 디렉터리 (e.g. docs/run-log)

Exit codes:
    0  Success (1 line appended to <log_dir>/_index.jsonl)
    1  Fatal I/O failure (caller는 non-blocking으로 취급)

설계: tasks/retro-skill-design.md §2. 한 줄 스키마:
    { taskId, timestamp, kind, status, failedStage, reason, stagesRun, skipped,
      fixAttempts, innerLoopIterations, breakdownLevel,
      stageDurationsSec, harnessVersion }
"""

import sys
import json
import os
from datetime import datetime, timezone

# 단계 타임스탬프 키 — 이 순서로 인접 차분해 단계 소요(초)를 구한다.
# startedAt은 구버전/인라인 패치 폴백 (로컬 시각일 수 있어 신뢰도 낮음 → startAt 우선).
_STAGE_KEYS = [
    ("init", ("initializedAt",)),
    ("start", ("startAt", "startedAt")),
    ("approach", ("approachAt",)),
    ("impl", ("implAt",)),
    ("test", ("testAt",)),
    ("review", ("reviewAt",)),
]


def _parse_ts(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def stage_durations(ctx):
    """ctx의 <step>At 타임스탬프를 순서대로 차분. 누락 단계는 건너뛰고 이전 가용 시각 기준."""
    out = {}
    prev = None
    for stage, keys in _STAGE_KEYS:
        ts = None
        for k in keys:
            ts = _parse_ts(ctx.get(k))
            if ts:
                if k == "startedAt":
                    # 인라인 패치 폴백 — 로컬 시각일 수 있어 신뢰 불가. 기록은 null, 기준 시각으로도 쓰지 않음.
                    out["queueWaitSec"] = None
                    ts = None
                break
        if ts is None:
            continue
        if prev is not None and stage != "init":
            sec = int((ts - prev).total_seconds())
            sec = sec if sec >= 0 else None  # 음수 = 시계 불일치(로컬 시각 오염) → null
            if stage == "start":
                out["queueWaitSec"] = sec  # init→start 간격 = 큐 대기 (loop) — 단계 소요가 아님
            else:
                out[stage] = sec
        prev = ts
    return out


def harness_version():
    here = os.path.dirname(os.path.abspath(__file__))
    p = os.path.join(here, "..", ".claude-plugin", "plugin.json")
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f).get("version", "unknown")
    except (OSError, ValueError):
        return "unknown"


def build_entry(task_id, result, ctx, kind):
    completed = result.get("completedSteps") or []
    skipped = result.get("skipped") or {}
    return {
        "taskId": task_id,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "kind": kind,
        "status": result.get("status"),
        "failedStage": result.get("failedStage"),
        "reason": result.get("reason"),  # aborted 사유 — loop 격리 분류·인프라 시그니처 판정 입력
        "stagesRun": [s for s in completed if s != "init"],
        "skipped": {"user": skipped.get("user") or [], "pdca": skipped.get("pdca") or []},
        "fixAttempts": result.get("fixAttempts", 0),
        "innerLoopIterations": result.get("innerLoopIterations"),
        "breakdownLevel": ctx.get("breakdownLevel") or result.get("breakdownLevel"),
        "metrics": result.get("metrics"),
        "stageDurationsSec": stage_durations(ctx),
        "harnessVersion": harness_version(),
        # loop-run 전용 (auto에서는 None)
        "quarantined": result.get("quarantined"),
        "passed": result.get("passed"),
    }


def _load_json(path):
    if path == "-":
        # Windows 콘솔 stdin은 기본 인코딩이 cp949/surrogateescape일 수 있어 한국어 JSON이 깨진다 → UTF-8 강제
        try:
            sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--kind")]
    kind = "auto"
    for a in sys.argv[1:]:
        if a.startswith("--kind="):
            kind = a.split("=", 1)[1]
    if len(args) < 4:
        print(__doc__, file=sys.stderr)
        return 1
    task_id, result_file, ctx_file, log_dir = args[:4]

    try:
        result = _load_json(result_file)
    except (OSError, ValueError) as e:
        print(f"append-run-log: result 읽기 실패: {e}", file=sys.stderr)
        return 1

    ctx = {}
    if ctx_file != "-":
        try:
            ctx = _load_json(ctx_file)
        except (OSError, ValueError) as e:
            print(f"append-run-log: ctx 읽기 실패 (소요시간 생략): {e}", file=sys.stderr)

    entry = build_entry(task_id, result, ctx, kind)

    try:
        os.makedirs(log_dir, exist_ok=True)
        with open(os.path.join(log_dir, "_index.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError as e:
        print(f"append-run-log: 쓰기 실패: {e}", file=sys.stderr)
        return 1

    print(f"run-log appended ({task_id}, {entry['status']}): {os.path.join(log_dir, '_index.jsonl')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
