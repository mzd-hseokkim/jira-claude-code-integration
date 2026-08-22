#!/usr/bin/env bash
# detect-lint.sh — 프로젝트가 *선언한* lint/format 도구만 판정해 한 줄씩 출력한다 (v0.58.0).
#
# Usage: bash detect-lint.sh [<project-root>]
# Output (stdout, 한 줄 = 도구 하나):
#   LINT   <name> <command prefix>      예: LINT eslint npx --no-install eslint
#   FORMAT <name> <command prefix>      예: FORMAT prettier npx --no-install prettier --check
#   NONE                                 선언된 도구 없음
#
# 판정 규칙은 impl Step 2.5 / review Lint & Format과 동일:
#   - Node: package.json dependencies/devDependencies 선언 또는 node_modules/<tool> 존재 (npx 자동 설치 방지 → --no-install)
#   - prettier: 설정 파일(.prettierrc*, prettier.config.*) 또는 package.json "prettier" 키가 있을 때만
#   - Python: ruff 설정([tool.ruff] in pyproject.toml / ruff.toml) → ruff; 없으면 .flake8 / setup.cfg [flake8] → flake8
#   - Java/Kotlin: pom.xml / build.gradle* 에 checkstyle 언급
# 호출자(LLM)는 이 출력만 보고 명령을 실행한다 — 탐지를 위해 별도 cat/grep/ls를 하지 않는다.

ROOT="${1:-.}"
found=0

has_node_dep() {
  [ -f "$ROOT/package.json" ] && grep -Eq "\"$1\"[[:space:]]*:" "$ROOT/package.json" && return 0
  [ -d "$ROOT/node_modules/$1" ]
}

if has_node_dep eslint; then
  echo "LINT eslint npx --no-install eslint"; found=1
fi

if has_node_dep prettier; then
  if ls "$ROOT"/.prettierrc* >/dev/null 2>&1 || ls "$ROOT"/prettier.config.* >/dev/null 2>&1 \
     || grep -Eq '"prettier"[[:space:]]*:[[:space:]]*\{' "$ROOT/package.json" 2>/dev/null; then
    echo "FORMAT prettier npx --no-install prettier --check"; found=1
  fi
fi

if [ -f "$ROOT/ruff.toml" ] || { [ -f "$ROOT/pyproject.toml" ] && grep -q '^\[tool\.ruff' "$ROOT/pyproject.toml"; }; then
  echo "LINT ruff ruff check"; echo "FORMAT ruff ruff format --check"; found=1
elif [ -f "$ROOT/.flake8" ] || { [ -f "$ROOT/setup.cfg" ] && grep -q '^\[flake8\]' "$ROOT/setup.cfg"; }; then
  echo "LINT flake8 flake8"; found=1
fi

if { [ -f "$ROOT/pom.xml" ] && grep -qi checkstyle "$ROOT/pom.xml"; } \
   || ls "$ROOT"/build.gradle* >/dev/null 2>&1 && grep -qi checkstyle "$ROOT"/build.gradle* 2>/dev/null; then
  echo "LINT checkstyle checkstyle"; found=1
fi

[ "$found" -eq 0 ] && echo "NONE"
exit 0
