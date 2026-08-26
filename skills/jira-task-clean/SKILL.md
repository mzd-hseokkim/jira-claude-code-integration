---
name: jira-task-clean
description: "Clean up git worktrees and branches for completed Jira tasks. Triggers: jira-task clean, remove worktree; 워크트리 정리, 브랜치 정리."
user-invocable: false
argument-hint: "<TASK-ID> [TASK-ID ...] | --all | --list"
allowed-tools:
  - Read
  - Bash
---

# jira-task-clean: Worktree & Branch Cleanup

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력).

## Overview

완료된 Jira 태스크의 worktree와 branch를 일괄 정리한다.
`scripts/clean-worktree.py` 스크립트를 실행하여 처리.

**반드시 메인 레포(main 브랜치)에서 실행해야 한다.** worktree 안에서 실행하면 자기 자신을 삭제할 수 없어 실패한다.
worktree 세션에서 요청받은 경우, 세션을 종료하고 메인 레포에서 다시 실행하라고 안내한다.

**`git worktree remove`·`rm -rf`·`Remove-Item -Recurse`를 직접 실행하지 않는다 — 항상 스크립트를 쓴다.**
`git worktree remove`는 Windows에서 worktree 안의 junction/symlink(예: `node_modules` → 메인 레포)를 **따라 들어가 대상까지 지운다**(`--force` 없이도). 그 경로로 메인 레포의 `node_modules`와 `packages/**` 소스가 실제로 소실된 적이 있다. 스크립트는 링크를 먼저 끊고 0개임을 검증한 뒤에만 git을 호출하며, 실행 후 메인 레포의 tracked 파일 소실을 감지하면 `!!! MAIN REPO DAMAGED`를 출력한다 — 그 줄이 보이면 즉시 사용자에게 보고하고 복구 명령(출력에 포함)을 안내한다. 플러그인 PreToolUse 훅이 수동 `git worktree remove`를 차단한다.
스크립트가 `ERROR: ... link(s) still present`로 멈추면 더 센 수단으로 재시도하지 말고 남은 링크 목록을 사용자에게 보고한다.

## Script Location

이 스킬은 플러그인 내장 스크립트를 사용한다. 스크립트 경로를 찾는 방법:

```bash
# 1) CLAUDE_PLUGIN_ROOT가 있으면 (스킬 실행 컨텍스트의 정확한 버전) 그것을 사용
# 2) 없으면 cwd 기준 직접 설치 경로
# 3) 그래도 없으면 캐시에서 최신 semver 버전 선택 (sort -V | tail -1)
SCRIPT=""
if [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/scripts/clean-worktree.py" ]; then
  SCRIPT="$CLAUDE_PLUGIN_ROOT/scripts/clean-worktree.py"
elif [ -f "scripts/clean-worktree.py" ]; then
  SCRIPT="scripts/clean-worktree.py"
else
  SCRIPT=$(find ~/.claude/plugins -path "*/jira-integration/*/scripts/clean-worktree.py" 2>/dev/null | sort -V | tail -1)
fi
[ -z "$SCRIPT" ] && { echo "clean-worktree.py를 찾을 수 없습니다." >&2; exit 1; }
```

**중요**: 절대 `find ... | head -1`로 잡지 말 것 — 파일시스템 순서로 가장 오래된 캐시 버전을 잡아서 stale 스크립트가 실행되는 사고가 있었음.

## Workflow

### Case 1: `clean <TASK-ID> [TASK-ID ...]`

특정 태스크의 worktree와 branch를 정리한다.

```bash
python3 "$SCRIPT" <TASK-ID> [TASK-ID ...]
```

**주의**: 사용자에게 정리 대상을 확인한 후 실행한다. `--dry-run`으로 먼저 보여주고 확인 후 실행:

```bash
# 1. 먼저 dry-run으로 대상 확인
python3 "$SCRIPT" --dry-run <TASK-ID>

# 2. 사용자 확인 후 실제 실행
python3 "$SCRIPT" <TASK-ID>
```

### Case 2: `clean --all`

병합/완료된 모든 worktree를 일괄 정리한다.

```bash
# dry-run으로 먼저 확인
python3 "$SCRIPT" --all --dry-run

# 사용자 확인 후 실제 실행
python3 "$SCRIPT" --all
```

### Case 3: `clean --list`

현재 worktree 목록과 상태를 표시한다.

```bash
python3 "$SCRIPT" --list
```

## Completion Summary

```
---
🧹 **Worktree Cleanup Complete**

- 정리된 태스크: <TASK-ID list>
- 삭제된 worktree: <count>개
- 삭제된 branch: <count>개
- MCP config 정리: <count>개
---
```
