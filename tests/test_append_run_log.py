"""tests/test_append_run_log.py — append-run-log.py 단위 테스트

실행: python -m unittest tests.test_append_run_log
또는: python -m unittest discover tests
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

import importlib.util

REPO_ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "append_run_log", REPO_ROOT / "scripts" / "append-run-log.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StageDurationsTest(unittest.TestCase):
    def test_adjacent_diffs_with_missing_stage(self):
        ctx = {
            "initializedAt": "2026-08-22T15:44:06Z",
            "startAt": "2026-08-22T15:49:22Z",
            "approachAt": "2026-08-22T15:53:29Z",
            # impl 누락 → test는 approach 기준
            "testAt": "2026-08-22T15:59:04Z",
            "reviewAt": "2026-08-22T16:04:35Z",
        }
        d = module.stage_durations(ctx)
        self.assertEqual(d["queueWaitSec"], 316)
        self.assertNotIn("start", d)
        self.assertEqual(d["approach"], 247)
        self.assertNotIn("impl", d)
        self.assertEqual(d["test"], 335)
        self.assertEqual(d["review"], 331)
        self.assertNotIn("init", d)

    def test_startedAt_fallback_is_untrusted(self):
        # startedAt(인라인 패치, 로컬 시각 +9h 오염): start는 null, approach는 init 기준으로 계산
        ctx = {
            "initializedAt": "2026-08-22T15:44:06Z",
            "startedAt": "2026-08-23T00:49:22Z",
            "approachAt": "2026-08-22T15:53:29Z",
        }
        d = module.stage_durations(ctx)
        self.assertIsNone(d["queueWaitSec"])
        self.assertEqual(d["approach"], 563)

    def test_negative_diff_becomes_null(self):
        ctx = {
            "startAt": "2026-08-22T15:49:22Z",
            "approachAt": "2026-08-22T15:40:00Z",
        }
        self.assertIsNone(module.stage_durations(ctx)["approach"])

    def test_startAt_preferred_over_startedAt(self):
        ctx = {
            "initializedAt": "2026-08-22T15:44:06Z",
            "startAt": "2026-08-22T15:49:22Z",
            "startedAt": "2026-08-23T00:49:22Z",
        }
        self.assertEqual(module.stage_durations(ctx)["queueWaitSec"], 316)


class BuildEntryTest(unittest.TestCase):
    def test_entry_shape(self):
        result = {
            "status": "completed",
            "completedSteps": ["init", "start", "approach", "impl", "review"],
            "skipped": {"user": [], "pdca": ["test"]},
            "fixAttempts": 0,
            "metrics": {"matchRate": 100, "criticalCount": 0, "warningCount": 0, "infoCount": 2},
        }
        e = module.build_entry("MAE-453", result, {"breakdownLevel": "L1"}, "auto")
        self.assertEqual(e["taskId"], "MAE-453")
        self.assertEqual(e["kind"], "auto")
        self.assertEqual(e["stagesRun"], ["start", "approach", "impl", "review"])
        self.assertEqual(e["skipped"]["pdca"], ["test"])
        self.assertEqual(e["breakdownLevel"], "L1")
        self.assertIsNone(e["failedStage"])
        self.assertIsNone(e["innerLoopIterations"])
        self.assertTrue(e["timestamp"].endswith("Z"))
        self.assertNotEqual(e["harnessVersion"], "unknown")

    def test_cli_appends_jsonl(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "result.json").write_text(json.dumps({"status": "aborted", "failedStage": "impl+test",
                                                          "completedSteps": ["init", "start"]}), encoding="utf-8")
            (tmp / "ctx.json").write_text(json.dumps({"initializedAt": "2026-08-22T15:44:06Z",
                                                       "startAt": "2026-08-22T15:49:22Z"}), encoding="utf-8")
            log_dir = tmp / "run-log"
            argv = ["append-run-log.py", "MAE-1", str(tmp / "result.json"), str(tmp / "ctx.json"), str(log_dir)]
            with unittest.mock.patch.object(sys, "argv", argv):
                self.assertEqual(module.main(), 0)
                self.assertEqual(module.main(), 0)
            lines = (log_dir / "_index.jsonl").read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(lines), 2)
            e = json.loads(lines[0])
            self.assertEqual(e["status"], "aborted")
            self.assertEqual(e["failedStage"], "impl+test")
            self.assertEqual(e["stageDurationsSec"], {"queueWaitSec": 316})


import unittest.mock  # noqa: E402  (patch.object 사용)

if __name__ == "__main__":
    unittest.main()
