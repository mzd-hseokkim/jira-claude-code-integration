#!/usr/bin/env python3
"""verify-checks.py — 프로젝트 검사 명령을 LLM 리뷰 전에 실행하고 exit code로 판정한다 (v0.74.0+).

검사 통과 여부를 LLM이 판단하지 않게 하려는 스크립트다. 언어·프레임워크를 모른다 —
명령은 프로젝트 AGENTS.md가 정한다(전사 표준 ai-kit의 "## 검사" 절, 예: `./gradlew build`).

Usage (작업 worktree에서 실행):
    python3 verify-checks.py [<project-root>]

명령 출처 (앞의 것이 우선):
    1. AGENTS.md "## 프로젝트 정보"의 `- 검사 명령(위와 다를 때): <명령>` (괄호로 감싼 안내문이면 무시)
    2. AGENTS.md "## 검사" 절의 첫 코드 블록 (여러 줄이면 bash -e로 한 번에 실행)
    3. 코드 블록이 없으면 그 절에서 "`<명령>`을/를 실행" 문장의 첫 명령 (python-fastapi·typescript-fastify kit 형식)

Output: JSON 한 줄
    {status: pass|fail|none, command, source, exitCode, durationSec, outputTail}
    outputTail은 실패일 때만 출력 마지막 80줄.
Exit:   0 통과 / 1 실패 / 2 명령 없음(AGENTS.md나 코드 블록이 없음)
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

TAIL_LINES = 80
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def section(agents_md: str, title: str) -> str:
    # 다음 ## 제목에서 끝낸다. "# "는 코드 블록 안 셸 주석과 구분할 수 없어 끝으로 보지 않는다.
    m = re.search(rf"^##[ \t]+{title}[ \t]*$(.*?)(?=^##[ \t]|\Z)", agents_md, re.M | re.S)
    return m.group(1) if m else ""


def find_command(agents_md: str) -> tuple[str, str] | None:
    """(명령, 출처) 또는 None."""
    info = section(agents_md, "프로젝트 정보")
    m = re.search(r"^[ \t]*[-*][ \t]*검사 명령[^:\n]*:[ \t]*(.+)$", info, re.M)
    if m:
        value = m.group(1).strip()
        code = re.search(r"`([^`\n]+)`", value)
        if code and not value.startswith("("):
            value = code.group(1).strip()
        if value and not (value.startswith("(") and value.endswith(")")):
            return value, "AGENTS.md 프로젝트 정보"
    checks = section(agents_md, "검사")
    m = re.search(r"^```[^\n]*\n(.*?)^```", checks, re.M | re.S)
    if m:
        lines = [x for x in m.group(1).splitlines() if x.strip() and not x.lstrip().startswith("#")]
        if lines:
            return "\n".join(lines), "AGENTS.md 검사"
    m = re.search(r"`([^`\n]+)`[을를][ \t]*실행", checks)
    if m:
        return m.group(1).strip(), "AGENTS.md 검사"
    return None


def run(root: Path) -> tuple[int, dict]:
    agents = root / "AGENTS.md"
    found = find_command(agents.read_text(encoding="utf-8")) if agents.is_file() else None
    if not found:
        return 2, {"status": "none", "command": None, "source": None}
    command, source = found
    # Windows에서 리스트 인자 "bash"는 PATH보다 System32(WSL bash)를 먼저 찾는다 — PATH의 git-bash를 쓴다
    bash = shutil.which("bash")
    if not bash:
        return 1, {"status": "fail", "command": command, "source": source, "exitCode": None,
                   "durationSec": 0, "outputTail": "bash를 찾을 수 없다 (실행 환경 문제)"}
    start = time.monotonic()
    p = subprocess.run([bash, "-e", "-c", command], cwd=root, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    out = {"status": "pass" if p.returncode == 0 else "fail", "command": command, "source": source,
           "exitCode": p.returncode, "durationSec": round(time.monotonic() - start)}
    if p.returncode != 0:
        lines = ANSI_RE.sub("", p.stdout).splitlines()
        out["outputTail"] = "\n".join(lines[-TAIL_LINES:])
    return (0 if p.returncode == 0 else 1), out


def main(argv: list[str]) -> int:
    code, out = run(Path(argv[0] if argv else ".").resolve())
    print(json.dumps(out, ensure_ascii=False))
    return code


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.exit(main(sys.argv[1:]))
