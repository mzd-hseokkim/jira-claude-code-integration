---
name: jira-task-clean
description: Clean up git worktrees and branches for completed Jira tasks. Removes worktree, deletes feature branch, cleans MCP config, and removes context files. Use when user says "clean task", "remove worktree", "jira-task clean", "워크트리 정리", "브랜치 정리", or wants to clean up after a completed task.
user-invocable: false
argument-hint: "<TASK-ID> [TASK-ID ...] | --all | --list"
allowed-tools:
  - Read
  - Bash
---

# jira-task-clean: Worktree & Branch Cleanup

## Language Rule

모든 출력을 한국어로 작성한다.
예외: 코드, 변수명, 브랜치명, 파일명, 명령어는 영어를 유지한다.

## Overview

완료된 Jira 태스크의 worktree와 branch를 일괄 정리한다.
`scripts/clean-worktree.py` 스크립트를 실행하여 처리.

**반드시 메인 레포(main 브랜치)에서 실행해야 한다.** worktree 안에서 실행하면 자기 자신을 삭제할 수 없어 실패한다.
worktree 세션에서 요청받은 경우, 세션을 종료하고 메인 레포에서 다시 실행하라고 안내한다.

## Script Location

이 스킬은 플러그인 내장 스크립트를 사용한다. 스크립트 경로를 찾는 방법:

```bash
# 플러그인 스크립트 경로 탐색 (캐시 또는 원본)
SCRIPT=$(find ~/.claude/plugins -path "*/jira-integration/*/scripts/clean-worktree.py" 2>/dev/null | head -1)
if [ -z "$SCRIPT" ]; then
  # 직접 설치된 경우
  SCRIPT=$(find . -path "*/scripts/clean-worktree.py" 2>/dev/null | head -1)
fi
```

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
