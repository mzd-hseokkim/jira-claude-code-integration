"""tests/test_analyze_review_log.py — analyze-review-log.py 단위 테스트

실행: python -m unittest tests.test_analyze_review_log
또는: python -m unittest discover tests
"""

import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timezone
from unittest.mock import patch

# 스크립트 경로를 sys.path에 추가 (scripts/ 디렉터리)
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import importlib.util
spec = importlib.util.spec_from_file_location(
    "analyze_review_log",
    REPO_ROOT / "scripts" / "analyze-review-log.py",
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

build_parser = module.build_parser
parse_since = module.parse_since
iter_entries = module.iter_entries
aggregate = module.aggregate
format_report = module.format_report
main = module.main
AggregateResult = module.AggregateResult


def make_entry(
    task_id="MAE-001",
    timestamp="2026-04-01T00:00:00Z",
    outcome="pass",
    severity_counts=None,
    **extra,
):
    entry = {
        "taskId": task_id,
        "timestamp": timestamp,
        "outcome": outcome,
        "severityCounts": severity_counts or {"critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0},
    }
    entry.update(extra)
    return entry


def write_jsonl(path: Path, entries: list) -> None:
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        for e in entries:
            fh.write(json.dumps(e) + "\n")


class TestU1NormalAggregation(unittest.TestCase):
    """U1: 정상 5건 entry 집계"""

    def test_cumulative_and_severity(self):
        entries = [
            make_entry(severity_counts={"critical": 1, "high": 2, "medium": 0, "low": 0, "info": 0}),
            make_entry(severity_counts={"critical": 0, "high": 0, "medium": 3, "low": 1, "info": 0}),
            make_entry(outcome="fail", severity_counts={"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 2}),
            make_entry(outcome="warn", severity_counts={"critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0}),
            make_entry(severity_counts={"critical": 0, "high": 0, "medium": 0, "low": 2, "info": 0}),
        ]
        result = aggregate(iter(entries), since=None)
        self.assertEqual(result.cumulative_review_count, 5)
        self.assertEqual(result.severity_dist["critical"], 1)
        self.assertEqual(result.severity_dist["high"], 3)
        self.assertEqual(result.severity_dist["medium"], 3)
        self.assertEqual(result.severity_dist["low"], 3)
        self.assertEqual(result.severity_dist["info"], 2)
        self.assertEqual(result.outcome_freq["pass"], 3)
        self.assertEqual(result.outcome_freq["fail"], 1)
        self.assertEqual(result.outcome_freq["warn"], 1)


class TestU2CorruptLineSkip(unittest.TestCase):
    """U2: 손상 라인 skip + warn"""

    def test_invalid_json_lines_skipped(self):
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
        ) as fh:
            fh.write(json.dumps(make_entry()) + "\n")
            fh.write("this is not json\n")
            fh.write(json.dumps(make_entry()) + "\n")
            fh.write("{broken json\n")
            fh.write(json.dumps(make_entry()) + "\n")
            tmp_path = Path(fh.name)

        skipped_out = [0]
        stderr_capture = io.StringIO()
        with patch("sys.stderr", stderr_capture):
            entries_list = list(iter_entries(tmp_path, skipped_out))

        tmp_path.unlink()

        self.assertEqual(len(entries_list), 3)
        self.assertEqual(skipped_out[0], 2)

        stderr_output = stderr_capture.getvalue()
        self.assertIn("[warn]", stderr_output)
        self.assertIn("line 2", stderr_output)
        self.assertIn("line 4", stderr_output)


class TestU3SinceUTCFilter(unittest.TestCase):
    """U3: --since UTC 경계 필터"""

    def test_since_boundary(self):
        since = datetime(2026, 1, 1, tzinfo=timezone.utc)
        entries = [
            make_entry(timestamp="2025-12-31T23:59:59Z"),  # 제외
            make_entry(timestamp="2026-01-01T00:00:00Z"),  # 포함 (경계 포함)
            make_entry(timestamp="2026-01-01T00:00:01Z"),  # 포함
            make_entry(timestamp="2026-06-15T12:00:00Z"),  # 포함
        ]
        result = aggregate(iter(entries), since=since)
        self.assertEqual(result.cumulative_review_count, 3)


class TestU4SinceFormatError(unittest.TestCase):
    """U4: --since 형식 오류 → argparse SystemExit code 2"""

    def test_invalid_since_format(self):
        with self.assertRaises(SystemExit) as ctx:
            main(["--since", "2026/01/01", "--input", "_index.jsonl"])
        self.assertEqual(ctx.exception.code, 2)


class TestU5TopN(unittest.TestCase):
    """U5: --top N 적용"""

    def test_top_n_limits_outcome_output(self):
        entries = [
            make_entry(outcome="pass"),
            make_entry(outcome="fail"),
            make_entry(outcome="warn"),
            make_entry(outcome="pass"),
            make_entry(outcome="pass"),
        ]
        result = aggregate(iter(entries), since=None)
        report = format_report(result, top=2, skipped=0)
        # "상위 2개"가 헤더에 표시됨
        self.assertIn("2", report)
        # outcome_freq에 pass(3), fail(1), warn(1)이 있지만 top=2이면 pass, fail만 표시됨
        lines = report.split("\n")
        outcome_lines = [l for l in lines if "pass" in l or "fail" in l or "warn" in l]
        # most_common(2)이면 최대 2줄
        # format_report가 top 제한을 반영하므로 warn이 없어야 함
        # (pass=3, fail=1이 상위 2개 → warn=1은 3번째라 제외)
        # 단, "warn"이 헤더 등 다른 곳에 없어야 함
        outcome_section_lines = [l for l in lines if "warn" in l]
        self.assertEqual(len(outcome_section_lines), 0)


class TestU6EmptyFindings(unittest.TestCase):
    """U6: findings 빈 entry — cumulative count에 +1, finding 집계는 0"""

    def test_empty_severity_counts(self):
        entries = [
            make_entry(severity_counts={"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}),
        ]
        result = aggregate(iter(entries), since=None)
        self.assertEqual(result.cumulative_review_count, 1)
        self.assertEqual(result.findings_total, 0)
        self.assertEqual(sum(result.severity_dist.values()), 0)


class TestU7FPRatio(unittest.TestCase):
    """U7: FP 비율 계산 (falsePositive 필드 사용)"""

    def test_fp_ratio(self):
        # 현재 스키마에서 falsePositive는 entry 레벨 필드 (미정의)
        # 스크립트는 `entry.get("falsePositive") is True` 시 fp_total++ 처리
        entries = [
            make_entry(
                severity_counts={"critical": 0, "high": 2, "medium": 1, "low": 1, "info": 0},
                falsePositive=True,
            ),
            make_entry(
                severity_counts={"critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0},
            ),
        ]
        result = aggregate(iter(entries), since=None)
        self.assertEqual(result.fp_total, 1)
        self.assertEqual(result.findings_total, 5)

        report = format_report(result, top=10, skipped=0)
        self.assertIn("20.0%", report)
        self.assertIn("(1/5", report)


class TestU8EmptyFile(unittest.TestCase):
    """U8: 빈 파일 → exit 0, count=0"""

    def test_empty_file(self):
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
        ) as fh:
            tmp_path = Path(fh.name)

        try:
            exit_code = main(["--input", str(tmp_path)])
        finally:
            tmp_path.unlink()

        self.assertEqual(exit_code, 0)

    def test_empty_aggregate(self):
        result = aggregate(iter([]), since=None)
        self.assertEqual(result.cumulative_review_count, 0)
        self.assertEqual(result.findings_total, 0)


class TestU9UnknownSeverity(unittest.TestCase):
    """U9: severity/category 부재 시 0 카운트 (severityCounts 누락 entry)"""

    def test_missing_severity_counts(self):
        entries = [
            {
                "taskId": "MAE-001",
                "timestamp": "2026-04-01T00:00:00Z",
                "outcome": "pass",
                # severityCounts 없음
            },
        ]
        result = aggregate(iter(entries), since=None)
        # cumulative에는 반영
        self.assertEqual(result.cumulative_review_count, 1)
        # severity_dist는 비어있음
        self.assertEqual(sum(result.severity_dist.values()), 0)


class TestU10NaiveTimestamp(unittest.TestCase):
    """U10: timezone 미포함 timestamp → UTC로 간주하여 --since 비교 정상"""

    def test_naive_timestamp_treated_as_utc(self):
        since = datetime(2026, 4, 1, tzinfo=timezone.utc)
        entries = [
            # timezone 없는 naive timestamp — UTC로 간주되어야 함
            make_entry(timestamp="2026-04-01T00:00:00"),  # 포함
            make_entry(timestamp="2026-03-31T23:59:59"),  # 제외
        ]
        result = aggregate(iter(entries), since=since)
        self.assertEqual(result.cumulative_review_count, 1)


class TestParseSince(unittest.TestCase):
    """parse_since 함수 단위 테스트"""

    def test_valid_date(self):
        dt = parse_since("2026-01-15")
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 1)
        self.assertEqual(dt.day, 15)
        self.assertEqual(dt.tzinfo, timezone.utc)

    def test_invalid_format_raises(self):
        with self.assertRaises(argparse.ArgumentTypeError):
            parse_since("2026/01/15")


class TestMissingTimestampSkipped(unittest.TestCase):
    """timestamp 필드 누락 라인은 skip + warn"""

    def test_missing_timestamp(self):
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".jsonl", delete=False, encoding="utf-8"
        ) as fh:
            fh.write(json.dumps({"taskId": "MAE-001", "outcome": "pass"}) + "\n")  # timestamp 없음
            fh.write(json.dumps(make_entry()) + "\n")
            tmp_path = Path(fh.name)

        skipped_out = [0]
        stderr_capture = io.StringIO()
        with patch("sys.stderr", stderr_capture):
            entries_list = list(iter_entries(tmp_path, skipped_out))

        tmp_path.unlink()

        self.assertEqual(len(entries_list), 1)
        self.assertEqual(skipped_out[0], 1)
        self.assertIn("missing required field 'timestamp'", stderr_capture.getvalue())


import argparse  # noqa: E402 (필요 시 모듈 내 참조)

if __name__ == "__main__":
    unittest.main()
