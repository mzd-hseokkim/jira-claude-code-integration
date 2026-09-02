#!/usr/bin/env python3
"""Register the plugin directory in Claude Code's `permissions.additionalDirectories`.

Usage:
    python3 scripts/ensure-workflow-dir.py [--settings <path>] [--check]

Claude Code의 Workflow 도구는 `scriptPath`로 **cwd 또는 추가된 워킹 디렉터리 안의 파일**만
받는다. 플러그인은 `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/scripts/`에
설치되므로 auto 워크플로(`auto.workflow.js`)가 거부된다. 이 스크립트는 그 상위 디렉터리
(버전 디렉터리의 부모 — 업데이트로 버전이 바뀌어도 유효)를 사용자 settings.json의
`permissions.additionalDirectories`에 1회 등록한다.

--check는 등록 여부만 판정하고 파일을 쓰지 않는다.

출력(JSON 1줄): {"dir":..., "settings":..., "registered":bool, "added":bool}
  added=true면 settings.json이 갱신된 것이며 **세션 재시작 후** 적용된다
  (현재 세션에는 `/add-dir <dir>`).
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path


def plugin_dir() -> Path:
    """등록 대상 디렉터리. 캐시 설치면 버전 디렉터리의 부모, 개발 체크아웃이면 레포 루트."""
    version_dir = Path(__file__).resolve().parent.parent
    parts = version_dir.parts  # .../plugins/cache/<marketplace>/<plugin>/<version>
    if len(parts) >= 5 and parts[-4] == "cache" and parts[-5] == "plugins":
        return version_dir.parent
    return version_dir


def same_path(a: str, b: Path) -> bool:
    try:
        norm = os.path.normcase(os.path.normpath(os.path.expanduser(a)))
    except (TypeError, ValueError):
        return False
    return norm == os.path.normcase(os.path.normpath(str(b)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--settings", default=str(Path.home() / ".claude" / "settings.json"))
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    target = plugin_dir()
    settings_path = Path(args.settings)

    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"ensure-workflow-dir: settings.json을 읽지 못함: {e}", file=sys.stderr)
            return 1
        if not isinstance(settings, dict):
            print("ensure-workflow-dir: settings.json 최상위가 객체가 아님", file=sys.stderr)
            return 1
    else:
        settings = {}

    dirs = settings.get("permissions", {}).get("additionalDirectories", [])
    registered = any(same_path(d, target) for d in dirs if isinstance(d, str))

    added = False
    if not registered and not args.check:
        settings.setdefault("permissions", {}).setdefault("additionalDirectories", []).append(str(target))
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(settings_path.parent), suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, settings_path)
        registered = True
        added = True

    print(json.dumps(
        {"dir": str(target), "settings": str(settings_path), "registered": registered, "added": added},
        ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
