"""analyze-review-log.py — 누적 review 로그 통계 분석 스크립트

_index.jsonl 을 입력으로 받아 누적 review 통계를 출력합니다.
외부 의존성 없음 (Python 표준 라이브러리만).

## 사용 예시

# 기본 실행 (현재 디렉터리의 _index.jsonl)
    python scripts/analyze-review-log.py

# 입력 파일 명시
    python scripts/analyze-review-log.py --input docs/review-log/_index.jsonl

# 특정 날짜 이후만 집계 + category 상위 5개
    python scripts/analyze-review-log.py --input docs/review-log/_index.jsonl --since 2026-01-01 --top 5

## 옵션

    --input PATH    입력 JSONL 파일 경로 (기본값: _index.jsonl)
    --top N         outcome/severity 상위 N개 출력 (기본값: 10)
    --since DATE    YYYY-MM-DD 형식의 UTC 기준 시작 날짜 (이 날짜 자정 UTC 이후만 포함)

## 출력 항목

    1. 누적 review 횟수
    2. severity별 finding 분포 (severityCounts 합산)
    3. outcome 빈도 (pass/fail/warn)
    4. FP 비율 (현 단계: 0.0% — 스키마 확장 시 자동 반영)

## 주의

    --since 비교 기준은 UTC 입니다. 로컬 타임존과 다를 수 있습니다.
    손상된 라인(JSON 파싱 실패, 필수 필드 누락)은 stderr에 경고 후 skip됩니다.
"""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, NamedTuple


# ---------------------------------------------------------------------------
# Data container
# ---------------------------------------------------------------------------

class AggregateResult(NamedTuple):
    cumulative_review_count: int
    severity_dist: Counter
    outcome_freq: Counter
    findings_total: int
    fp_total: int
    skipped: int


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_since(s: str) -> datetime:
    """YYYY-MM-DD 문자열을 UTC 자정 aware datetime으로 변환."""
    try:
        d = datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"날짜 형식이 올바르지 않습니다: '{s}'. YYYY-MM-DD (UTC) 형식을 사용하세요."
        )
    return d.replace(tzinfo=timezone.utc)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="analyze-review-log",
        description="_index.jsonl 누적 review 통계 분석 (표준 라이브러리만 사용)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "예시:\n"
            "  python scripts/analyze-review-log.py\n"
            "  python scripts/analyze-review-log.py --input docs/review-log/_index.jsonl\n"
            "  python scripts/analyze-review-log.py --since 2026-01-01 --top 5\n"
            "\n"
            "주의: --since 비교 기준은 UTC입니다."
        ),
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("_index.jsonl"),
        metavar="PATH",
        help="입력 JSONL 파일 경로 (기본값: _index.jsonl)",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=10,
        metavar="N",
        help="severity/outcome 상위 N개 출력 (기본값: 10)",
    )
    parser.add_argument(
        "--since",
        type=parse_since,
        default=None,
        metavar="YYYY-MM-DD",
        help="UTC 기준 시작 날짜 (이 날짜 자정 UTC 이후 entry만 포함)",
    )
    return parser


# ---------------------------------------------------------------------------
# Entry iteration
# ---------------------------------------------------------------------------

def _parse_timestamp(ts_str: str) -> datetime:
    """ISO8601 문자열을 UTC aware datetime으로 변환.

    timezone 정보가 없으면 UTC로 간주합니다 (MAE-179 스키마 정책).
    """
    # Python 3.7+: datetime.fromisoformat는 'Z' suffix를 지원하지 않으므로 교체
    normalized = ts_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def iter_entries(path: Path, skipped_out: list) -> Iterator[dict]:
    """JSONL 파일에서 유효한 entry를 yield합니다.

    손상된 라인은 stderr에 경고를 출력하고 skip합니다.
    skipped_out[0]에 skip된 라인 수를 누적합니다.
    """
    try:
        fh = open(path, encoding="utf-8", newline="")
    except FileNotFoundError:
        print(f"오류: 파일을 찾을 수 없습니다: {path}", file=sys.stderr)
        sys.exit(2)
    except OSError as exc:
        print(f"오류: 파일을 열 수 없습니다: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        for lineno, line in enumerate(fh, start=1):
            line = line.rstrip("\r\n")
            if not line:
                continue  # 빈 줄 skip (경고 없음)

            # JSON 파싱
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"[warn] line {lineno}: invalid JSON — {exc.msg}", file=sys.stderr)
                skipped_out[0] += 1
                continue

            # 필수 필드 검증: timestamp
            if "timestamp" not in entry:
                print(f"[warn] line {lineno}: missing required field 'timestamp'", file=sys.stderr)
                skipped_out[0] += 1
                continue

            # timestamp 파싱 가능 여부 검증
            try:
                _parse_timestamp(entry["timestamp"])
            except (ValueError, TypeError) as exc:
                print(f"[warn] line {lineno}: invalid timestamp '{entry.get('timestamp')}' — {exc}", file=sys.stderr)
                skipped_out[0] += 1
                continue

            yield entry
    finally:
        fh.close()


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def aggregate(
    entries: Iterator[dict],
    since: datetime | None,
) -> AggregateResult:
    """1-pass 집계.

    _index.jsonl 스키마 (MAE-179):
      taskId, timestamp, outcome, severityCounts{critical,high,medium,low,info}

    severity 분포는 severityCounts 값을 합산합니다.
    FP 비율은 현 단계 항상 0.0% (스키마에 falsePositive 미포함).
    """
    cumulative = 0
    severity_dist: Counter = Counter()
    outcome_freq: Counter = Counter()
    findings_total = 0
    fp_total = 0

    SEVERITY_KEYS = ("critical", "high", "medium", "low", "info")

    for entry in entries:
        # --since 필터 (UTC 비교)
        if since is not None:
            try:
                ts = _parse_timestamp(entry["timestamp"])
            except (ValueError, TypeError):
                # iter_entries에서 이미 검증했으므로 여기 도달하지 않음
                continue
            if ts < since:
                continue

        cumulative += 1

        # outcome 집계
        outcome = entry.get("outcome", "unknown")
        if not isinstance(outcome, str):
            outcome = "unknown"
        outcome_freq[outcome] += 1

        # severityCounts 집계
        sc = entry.get("severityCounts")
        if isinstance(sc, dict):
            for key in SEVERITY_KEYS:
                val = sc.get(key, 0)
                if isinstance(val, int) and val > 0:
                    severity_dist[key] += val
                    findings_total += val
        # severityCounts 누락/비dict 시: severity 집계 없이 count에만 반영

        # FP 집계 (현 단계 스키마에 falsePositive 없음 → 항상 0)
        fp = entry.get("falsePositive")
        if fp is True:
            fp_total += 1

    return AggregateResult(
        cumulative_review_count=cumulative,
        severity_dist=severity_dist,
        outcome_freq=outcome_freq,
        findings_total=findings_total,
        fp_total=fp_total,
        skipped=0,  # skipped는 외부에서 주입 (iter_entries의 skipped_out)
    )


# ---------------------------------------------------------------------------
# Report formatting
# ---------------------------------------------------------------------------

def format_report(result: AggregateResult, top: int, skipped: int) -> str:
    lines = []
    lines.append("=" * 50)
    lines.append("  Review Log 누적 통계 분석")
    lines.append("=" * 50)

    # 1. 누적 review 횟수
    lines.append(f"\n[1] 누적 Review 횟수: {result.cumulative_review_count}건")

    # 2. severity별 finding 분포
    lines.append("\n[2] Severity별 Finding 분포")
    SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"]
    if result.severity_dist:
        total = sum(result.severity_dist.values())
        for sev in SEVERITY_ORDER:
            count = result.severity_dist.get(sev, 0)
            pct = count / total * 100 if total > 0 else 0.0
            lines.append(f"    {sev:<10}: {count:>6}건  ({pct:5.1f}%)")
        # SEVERITY_ORDER에 없는 severity ("unknown" 등)
        for sev, count in result.severity_dist.most_common():
            if sev not in SEVERITY_ORDER:
                pct = count / total * 100 if total > 0 else 0.0
                lines.append(f"    {sev:<10}: {count:>6}건  ({pct:5.1f}%)")
    else:
        lines.append("    (finding 없음)")

    # 3. outcome 빈도 (Top N)
    lines.append(f"\n[3] Outcome 빈도 (상위 {top}개)")
    if result.outcome_freq:
        for outcome, count in result.outcome_freq.most_common(top):
            lines.append(f"    {outcome:<10}: {count:>6}건")
    else:
        lines.append("    (outcome 없음)")

    # 4. FP 비율
    lines.append("\n[4] False Positive 비율")
    if result.findings_total > 0:
        fp_rate = result.fp_total / result.findings_total * 100
        lines.append(
            f"    {fp_rate:.1f}%  ({result.fp_total}/{result.findings_total} findings)"
        )
    else:
        lines.append("    0.0%  (0/0 findings)")

    # 풋터
    lines.append("\n" + "-" * 50)
    if skipped > 0:
        lines.append(f"  skipped: {skipped}건 (손상된 라인, stderr 경고 확인)")
    else:
        lines.append("  skipped: 0건")
    lines.append("=" * 50)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(argv: list | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    # --top 유효성 검사
    if args.top <= 0:
        parser.error(f"--top 값은 1 이상이어야 합니다: {args.top}")

    # 파일 존재 확인
    if not args.input.exists():
        parser.error(f"입력 파일을 찾을 수 없습니다: {args.input}")

    skipped_out = [0]
    entries = iter_entries(args.input, skipped_out)
    result = aggregate(entries, since=args.since)

    # skipped 수를 result에 반영 (NamedTuple이므로 _replace 사용)
    result = result._replace(skipped=skipped_out[0])

    report = format_report(result, top=args.top, skipped=skipped_out[0])
    print(report)

    return 0


if __name__ == "__main__":
    sys.exit(main())
