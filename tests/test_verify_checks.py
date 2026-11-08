"""tests/test_verify_checks.py — verify-checks.py 단위 테스트 (임시 디렉터리에 AGENTS.md를 두고 실행)

실행: python -m unittest tests.test_verify_checks
"""

import importlib.util
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("verify_checks", REPO_ROOT / "scripts" / "verify-checks.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)  # type: ignore[union-attr]

# 전사 표준 java-spring ai-kit AGENTS.md와 같은 모양
KIT = """# AGENTS

## 검사

```bash
{cmd}
```

- 컴파일, Checkstyle, 테스트(ArchUnit 포함)를 모두 실행한다.

## 프로젝트 정보

- 검사 명령(위와 다를 때): {override}

## 프로젝트 예외
"""

# 전사 표준 SDLC 템플릿 AGENTS.md — 코드 블록 없이 안내문만 있다
SDLC_TEMPLATE = """# AGENTS

## 검사

<빌드·테스트·린트·구조 검사를 한 번에 돌리는 명령. CI의 필수 검사와 같은 명령>

## 프로젝트 예외
"""


class FindCommandTest(unittest.TestCase):
    def test_code_block(self):
        md = KIT.format(cmd="./gradlew build", override="(프로젝트에서 채움)")
        self.assertEqual(m.find_command(md), ("./gradlew build", "AGENTS.md 검사"))

    def test_override_wins(self):
        md = KIT.format(cmd="./gradlew build", override="`./gradlew check -x integrationTest`")
        self.assertEqual(m.find_command(md), ("./gradlew check -x integrationTest", "AGENTS.md 프로젝트 정보"))

    def test_override_with_trailing_note(self):
        md = KIT.format(cmd="./gradlew build", override="`./gradlew check` (통합 테스트 제외)")
        self.assertEqual(m.find_command(md)[0], "./gradlew check")

    def test_multiline_block_drops_comments(self):
        md = KIT.format(cmd="# 포맷\nnpm run lint\nnpm test", override="(프로젝트에서 채움)")
        self.assertEqual(m.find_command(md)[0], "npm run lint\nnpm test")

    def test_prose_command(self):
        md = "## 검사\n\n프로젝트 루트에서 `pnpm check`를 실행한다. 포맷은 `pnpm format`으로 고친다.\n"
        self.assertEqual(m.find_command(md), ("pnpm check", "AGENTS.md 검사"))

    def test_override_example_placeholder_ignored(self):
        md = KIT.format(cmd="pnpm check", override="(예: `pnpm check` 대신 쓰는 명령)")
        self.assertEqual(m.find_command(md)[0], "pnpm check")

    def test_placeholder_only(self):
        self.assertIsNone(m.find_command(SDLC_TEMPLATE))


class RunTest(unittest.TestCase):
    def run_with(self, agents_md):
        with tempfile.TemporaryDirectory() as d:
            if agents_md is not None:
                (Path(d) / "AGENTS.md").write_text(agents_md, encoding="utf-8")
            return m.run(Path(d))

    def test_pass(self):
        code, out = self.run_with(KIT.format(cmd="true", override="(프로젝트에서 채움)"))
        self.assertEqual((code, out["status"], out["exitCode"]), (0, "pass", 0))
        self.assertNotIn("outputTail", out)

    def test_fail_stops_at_first_failing_line(self):
        code, out = self.run_with(KIT.format(cmd="echo first\nfalse\necho never", override="(프로젝트에서 채움)"))
        self.assertEqual((code, out["status"]), (1, "fail"))
        self.assertIn("first", out["outputTail"])
        self.assertNotIn("never", out["outputTail"])

    def test_tail_is_limited_and_includes_stderr(self):
        cmd = "for i in $(seq 1 200); do echo line$i; done; echo boom >&2; exit 3"
        code, out = self.run_with(KIT.format(cmd=cmd, override="(프로젝트에서 채움)"))
        self.assertEqual((code, out["exitCode"]), (1, 3))
        tail = out["outputTail"].splitlines()
        self.assertEqual(len(tail), m.TAIL_LINES)
        self.assertEqual(tail[-1], "boom")

    def test_no_agents_md(self):
        self.assertEqual(self.run_with(None), (2, {"status": "none", "command": None, "source": None}))


if __name__ == "__main__":
    unittest.main()
