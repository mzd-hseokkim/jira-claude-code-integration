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


if __name__ == "__main__":
    unittest.main()
