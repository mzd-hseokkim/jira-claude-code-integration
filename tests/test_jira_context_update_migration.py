"""tests/test_jira_context_update_migration.py — MAE-357 migration 모드 단위 테스트.

실행: python -m unittest tests.test_jira_context_update_migration
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

spec = importlib.util.spec_from_file_location(
    "jira_context_update",
    REPO_ROOT / "scripts" / "jira-context-update.py",
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)  # type: ignore[union-attr]


class MigrateApproachTest(unittest.TestCase):
    def _write(self, content: dict) -> Path:
        f = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        json.dump(content, f, ensure_ascii=False)
        f.close()
        return Path(f.name)

    def test_worktree_context_with_plan_and_design_inserts_approach(self):
        path = self._write(
            {"taskId": "T-1", "completedSteps": ["init", "start", "plan", "design", "impl"]}
        )
        result = module.migrate_approach(str(path))
        self.assertIn("migrated 1", result)
        with open(path, encoding="utf-8") as f:
            ctx = json.load(f)
        self.assertEqual(
            ctx["completedSteps"],
            ["init", "start", "plan", "design", "approach", "impl"],
        )

    def test_idempotent_when_approach_already_present(self):
        path = self._write(
            {
                "taskId": "T-1",
                "completedSteps": ["init", "start", "plan", "design", "approach"],
            }
        )
        result = module.migrate_approach(str(path))
        self.assertIn("migrated 0", result)

    def test_skips_when_only_one_legacy_step(self):
        path = self._write(
            {"taskId": "T-1", "completedSteps": ["init", "start", "plan"]}
        )
        module.migrate_approach(str(path))
        with open(path, encoding="utf-8") as f:
            ctx = json.load(f)
        self.assertNotIn("approach", ctx["completedSteps"])

    def test_aggregate_context_migrates_per_task(self):
        path = self._write(
            {
                "tasks": [
                    {"taskId": "T-1", "completedSteps": ["plan", "design"]},
                    {"taskId": "T-2", "completedSteps": ["start"]},
                    {"taskId": "T-3", "completedSteps": ["plan", "design", "approach"]},
                ]
            }
        )
        result = module.migrate_approach(str(path))
        self.assertIn("migrated 1", result)
        with open(path, encoding="utf-8") as f:
            ctx = json.load(f)
        self.assertIn("approach", ctx["tasks"][0]["completedSteps"])
        self.assertNotIn("approach", ctx["tasks"][1]["completedSteps"])
        # T-3 already had approach — preserved order
        self.assertEqual(
            ctx["tasks"][2]["completedSteps"], ["plan", "design", "approach"]
        )


class StripAggregatePollutionTest(unittest.TestCase):
    def _write(self, content: dict) -> Path:
        f = tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        )
        json.dump(content, f, ensure_ascii=False)
        f.close()
        return Path(f.name)

    def test_polluted_aggregate_is_self_healed_on_update(self):
        path = self._write(
            {
                "initialized": "2026-01-01T00:00:00Z",
                "repoRoot": "/repo",
                "baseBranch": "main",
                "worktreeBase": "/repo_worktree",
                # worktree-local pollution at top level
                "status": "In Progress",
                "completedSteps": ["start", "design"],
                "startedAt": "2026-01-01T00:00:00Z",
                "cachedIssue": {"key": "T-1"},
                "parentEpic": "T-0",
                "implSelfCheck": {"planMatched": "1/1"},
                "fixSelfCheck": {"iterations": 2},
                "tasks": [{"taskId": "T-1", "completedSteps": ["init"]}],
            }
        )
        result = module.update_context(str(path), "T-1", "start", "In Progress", "2026-01-02T00:00:00Z")
        self.assertIn("aggregate updated", result)
        with open(path, encoding="utf-8") as f:
            ctx = json.load(f)
        for key in ("status", "completedSteps", "startedAt", "cachedIssue", "parentEpic",
                    "implSelfCheck", "fixSelfCheck"):
            self.assertNotIn(key, ctx)
        # legit aggregate fields preserved, task entry updated normally
        self.assertEqual(ctx["initialized"], "2026-01-01T00:00:00Z")
        self.assertEqual(ctx["tasks"][0]["completedSteps"], ["init", "start"])

    def test_pollution_stripped_even_when_task_id_not_found(self):
        path = self._write(
            {
                "repoRoot": "/repo",
                "cachedIssue": {"key": "T-9"},
                "tasks": [{"taskId": "T-1"}],
            }
        )
        result = module.update_context(str(path), "T-9", "start", "-", "2026-01-02T00:00:00Z")
        self.assertIn("skipped", result)
        with open(path, encoding="utf-8") as f:
            ctx = json.load(f)
        self.assertNotIn("cachedIssue", ctx)

    def test_clean_aggregate_and_worktree_files_untouched_by_strip(self):
        agg = self._write(
            {"repoRoot": "/repo", "tasks": [{"taskId": "T-1", "deferred": True, "deferredReason": "x"}]}
        )
        module.update_context(str(agg), "T-1", "start", "-", "2026-01-02T00:00:00Z")
        with open(agg, encoding="utf-8") as f:
            ctx = json.load(f)
        # loop's per-task deferred fields survive (unknown-key preservation)
        self.assertTrue(ctx["tasks"][0]["deferred"])
        # worktree-local file: top-level step fields are the schema, never stripped
        wt = self._write({"taskId": "T-1", "status": "To Do", "completedSteps": []})
        module.update_context(str(wt), "T-1", "start", "In Progress", "2026-01-02T00:00:00Z")
        with open(wt, encoding="utf-8") as f:
            ctx = json.load(f)
        self.assertEqual(ctx["status"], "In Progress")
        self.assertEqual(ctx["completedSteps"], ["start"])


if __name__ == "__main__":
    unittest.main()
