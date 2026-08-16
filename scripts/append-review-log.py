"""append-review-log.py: review-log append CLI.

Usage:
    python3 scripts/append-review-log.py <task_id> <reviewer_version> <subagent_file> <log_dir>

Arguments:
    task_id          Jira task key (e.g. MAE-193)
    reviewer_version 12-char sha256 prefix of SKILL.md, or "unknown"
    subagent_file    Path to JSON file containing subagent review result
    log_dir          Directory for review-log files (e.g. docs/review-log)

Exit codes:
    0  Success (entry appended)
    1  Fatal I/O or invariant failure (SKILL caller uses set+e to stay non-blocking)

Subagent JSON shape:
    { "result": "Approve"|"Request Changes"|"Needs Discussion",
      "findings": [{"severity", "file", "line", "category", "message"}, ...], ... }
"""

import sys
import json
import os
import tempfile
import shutil
from datetime import datetime, timezone


def main():
    if len(sys.argv) < 5:
        print("Usage: append-review-log.py <task_id> <reviewer_version> <subagent_file> <log_dir>",
              file=sys.stderr)
        sys.exit(1)

    task_id       = sys.argv[1]
    reviewer_ver  = sys.argv[2]
    subagent_file = sys.argv[3]
    log_dir       = sys.argv[4]

    # review_log.redact import (scripts/ を PYTHONPATH에 추가)
    scripts_dir = os.path.join(os.getcwd(), "scripts")
    sys.path.insert(0, scripts_dir)
    try:
        from review_log.redact import redact
        redact_import_ok = True
    except ImportError:
        def redact(t): return t
        redact_import_ok = False
        print("⚠️ review-log append: redact 모듈 unavailable, redact 미적용", file=sys.stderr)

    # subagent 결과 로드
    try:
        with open(subagent_file, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError, OSError) as e:
        raw = {}
        print(f"⚠️ review-log append: subagent 결과 파싱 실패 ({e}), 기본값으로 기록", file=sys.stderr)

    # outcome 매핑: Approve→pass, Request Changes→fail, Needs Discussion→warn
    OUTCOME_MAP = {
        "Approve": "pass",
        "Request Changes": "fail",
        "Needs Discussion": "warn",
    }
    raw_result = raw.get("result", "")
    outcome = OUTCOME_MAP.get(raw_result, "warn")
    if raw_result and raw_result not in OUTCOME_MAP:
        print(f"⚠️ review-log append: 알 수 없는 outcome '{raw_result}', 'warn'으로 기록", file=sys.stderr)

    # severity 매핑: Critical→critical, Warning→high, Info→info
    SEV_MAP = {"Critical": "critical", "Warning": "high", "Info": "info"}

    raw_findings = raw.get("findings", []) or []
    findings_out = []
    sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}

    for i, f in enumerate(raw_findings, start=1):
        if not isinstance(f, dict):
            continue
        raw_sev = f.get("severity", "Info")
        mapped_sev = SEV_MAP.get(raw_sev, "info")
        redacted_msg = redact(f.get("message", ""))
        entry_finding = {
            "id": f"F-{i:03d}",
            "severity": mapped_sev,
            "file": f.get("file", ""),
            "line": f.get("line", 0),
            "category": f.get("category", ""),
            "message": redacted_msg,
        }
        findings_out.append(entry_finding)
        if mapped_sev in sev_counts:
            sev_counts[mapped_sev] += 1

    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    entry = {
        "taskId": task_id,
        "timestamp": timestamp,
        "reviewerVersion": reviewer_ver,
        "outcome": outcome,
        "findings": findings_out,
        "severityCounts": sev_counts,
        "falsePositive": None,
        "userOverride": None,
    }
    if isinstance(raw.get("timings"), dict):
        entry["timings"] = raw["timings"]
    if not redact_import_ok:
        entry["redactStatus"] = "import-failed"

    os.makedirs(log_dir, exist_ok=True)
    per_task_path = os.path.join(log_dir, f"{task_id}.json")
    index_path    = os.path.join(log_dir, "_index.jsonl")

    # per-task JSON: read-or-init → entries push → temp rename (원자적 swap)
    if os.path.exists(per_task_path):
        try:
            with open(per_task_path, "r", encoding="utf-8") as f:
                container = json.load(f)
            if not isinstance(container, dict) or "entries" not in container:
                raise ValueError("entries 키 없음")
        except (json.JSONDecodeError, ValueError, OSError) as e:
            ts_label = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup_path = f"{per_task_path}.corrupt-{ts_label}"
            shutil.copy2(per_task_path, backup_path)
            container = {"schemaVersion": 1, "taskId": task_id, "entries": []}
            print(f"⚠️ review-log append: 기존 per-task JSON 손상, 재초기화 ({e}). 백업: {backup_path}",
                  file=sys.stderr)
    else:
        container = {"schemaVersion": 1, "taskId": task_id, "entries": []}

    container["entries"].append(entry)

    # 원자적 rename으로 저장
    tmp_fd, tmp_path = tempfile.mkstemp(dir=log_dir, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(container, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, per_task_path)
    except OSError:
        os.unlink(tmp_path)
        raise

    # _index.jsonl: append-only (POSIX O_APPEND 원자성 의존)
    index_line = json.dumps({
        "taskId": task_id,
        "timestamp": timestamp,
        "outcome": outcome,
        "severityCounts": sev_counts,
    }, ensure_ascii=False)
    with open(index_path, "a", encoding="utf-8") as f:
        f.write(index_line + "\n")

    print(f"review-log append 완료: {per_task_path} (entries={len(container['entries'])}), {index_path}")


if __name__ == "__main__":
    main()
