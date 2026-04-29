"""gen_review_log.py — 1000건 _index.jsonl fixture 생성 스크립트

재현성을 위해 random seed를 고정합니다.

사용법:
    python tests/fixtures/gen_review_log.py
    python tests/fixtures/gen_review_log.py --count 1000 --output tests/fixtures/review-log-1000.jsonl
"""

import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

SEED = 42
OUTCOMES = ["pass", "fail", "warn"]
OUTCOME_WEIGHTS = [0.6, 0.25, 0.15]

SEVERITY_KEYS = ["critical", "high", "medium", "low", "info"]
# severity별 평균 count (Poisson 분포 λ)
SEVERITY_LAMBDAS = {"critical": 0.1, "high": 1.5, "medium": 3.0, "low": 4.0, "info": 2.0}


def gen_entry(rng: random.Random, index: int) -> dict:
    # timestamp: 2025-01-01 ~ 2026-04-29 범위에서 균등 분포
    base = datetime(2025, 1, 1, tzinfo=timezone.utc)
    offset_days = rng.randint(0, 483)  # 약 16개월
    offset_secs = rng.randint(0, 86399)
    ts = base + timedelta(days=offset_days, seconds=offset_secs)

    outcome = rng.choices(OUTCOMES, weights=OUTCOME_WEIGHTS, k=1)[0]

    severity_counts = {}
    for sev in SEVERITY_KEYS:
        lam = SEVERITY_LAMBDAS[sev]
        # 간단한 Poisson 근사: 평균 lam의 정수 샘플
        count = max(0, int(rng.gauss(lam, lam ** 0.5)))
        severity_counts[sev] = count

    return {
        "taskId": f"MAE-{200 + (index % 50)}",
        "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "outcome": outcome,
        "severityCounts": severity_counts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="review-log fixture 생성")
    parser.add_argument("--count", type=int, default=1000, help="생성할 entry 수 (기본값: 1000)")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parent / "review-log-1000.jsonl",
        help="출력 파일 경로",
    )
    args = parser.parse_args()

    rng = random.Random(SEED)
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with open(args.output, "w", encoding="utf-8", newline="\n") as fh:
        for i in range(args.count):
            entry = gen_entry(rng, i)
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"생성 완료: {args.output} ({args.count}건)")


if __name__ == "__main__":
    main()
