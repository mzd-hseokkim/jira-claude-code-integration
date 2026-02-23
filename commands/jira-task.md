---
name: jira-task
description: Main workflow command for Jira-integrated development. Routes to specialized skills based on the action argument. Usage /jira-task [action] [TASK-ID]. Actions init, start, plan, design, impl, test, review, pr, done, report, status. Triggers jira-task, jira task, init tasks, setup tasks, start task, begin task, implement task, test task, review task, create PR, complete task, task report, 현황 리포트, 작업 환경 세팅, 작업 시작, 구현 시작, 테스트 실행, 코드 리뷰, PR 만들어, 작업 완료
user-invocable: true
argument-hint: "[init|start|plan|design|impl|test|review|pr|merge|done|report] [TASK-ID]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - Skill
  - mcp__atlassian
---

# /jira-task - Jira Development Workflow

Parse the user's argument to determine the action and task ID, then execute the corresponding workflow.

## Argument Parsing

The argument format is: `[action] [TASK-ID]`

- **action**: One of `init`, `start`, `plan`, `design`, `impl`, `test`, `review`, `pr`, `merge`, `done`, `report`, `status`
- **TASK-ID**: Jira issue key (e.g., `PROJ-123`). Optional — if omitted, auto-detect from context. Not required for `init`, `report`, `status`.

If no action is provided, show the help text (same as `/jira` command).

## TASK-ID Auto-Detection

When TASK-ID is not provided, detect it automatically in the following priority order:

1. **Git branch name**: Run `git branch --show-current`. If the branch matches `feature/<TASK-ID>`, extract the TASK-ID.
2. **Current directory name**: Check if the current directory name matches a Jira issue key pattern (`[A-Z]+-\d+`, e.g., `PROJ-123`).
3. **`.jira-context.json`**: Read the file and use the active task ID if present.

If auto-detection succeeds, proceed with the detected TASK-ID. If it fails and the action requires a TASK-ID, ask the user to provide it.

## Action Routing

각 action은 대응하는 스킬의 워크플로를 그대로 따른다. 세부 절차는 각 스킬의 SKILL.md를 참조.

### `init [count]`
Execute the `jira-task-init` skill. 할당된 태스크를 가져와 worktree를 일괄 생성한다.

### `start <TASK-ID>`
Execute the `jira-task-start` skill. 이슈 조회, "In Progress" 전환, 브랜치/worktree 생성.

### `plan <TASK-ID>`
Execute the `jira-task-plan` skill. Jira 컨텍스트 기반 기획 문서를 `docs/plan/<TASK-ID>.plan.md`에 생성.

### `design <TASK-ID>`
Execute the `jira-task-design` skill. 코드베이스 분석 기반 설계 문서를 `docs/design/<TASK-ID>.design.md`에 생성.

### `impl <TASK-ID>`
Execute the `jira-task-impl` skill. 설계 문서(또는 Jira 이슈) 기반으로 구현.

### `test <TASK-ID>`
Execute the `jira-task-test` skill. 테스트 실행, 리포트 생성(`docs/test/<TASK-ID>.test-report.md`), Jira에 결과 게시.

### `review <TASK-ID>`
Execute the `jira-task-review` skill. Gap 분석 + 코드 품질 리뷰, 리포트 저장(`docs/review/<TASK-ID>.review.md`), Jira에 게시.

### `pr <TASK-ID>`
Execute the `jira-task-pr` skill. `gh` CLI로 PR 생성, Jira에 PR 링크 게시.

### `merge <TASK-ID>`
Execute the `jira-local-merge` skill. remote 없이 로컬 병합 (전략 선택 → merge → Jira 전환 → worktree 정리).
`pr` + `done` 대신 사용하는 no-remote 워크플로.

### `done <TASK-ID>`
Execute the `jira-task-done` skill. 완료 리포트 게시, 상태 전이, 컨텍스트 정리.

### `report`
Execute the `jira-task-report` skill. 내 할당 이슈 현황 리포트 생성.

### `status`
Quick status check — `.jira-context.json`에서 활성 태스크 정보를 읽고, Jira에서 최신 상태를 조회하여 표시.

## Error Handling

- If TASK-ID is not provided and auto-detection fails, ask the user to provide it
- If Jira MCP server is not connected, guide user to check `/jira` for setup
- If transition fails (e.g., invalid transition name), use `mcp__atlassian__jira_get_transitions` to list available transitions for the issue

## Response Summary

모든 응답 끝에 아래 형식의 요약을 출력한다:

```
─────────────────────────────────────────
📋 Jira Workflow Summary
─────────────────────────────────────────
✅ Done: [이번 응답에서 수행한 작업]
🔧 Used: [사용한 스킬, 에이전트, Jira MCP 도구]
💡 Next: [다음 추천 작업]
─────────────────────────────────────────
```

규칙:
- **Done**: 실제로 수행한 작업을 간결하게 기술 (예: "PROJ-123 기획 문서 생성")
- **Used**: 사용한 스킬(`jira-task-plan` 등), 에이전트(`jira-planner` 등), Jira MCP 도구(`get-issue`, `add-comment` 등)를 나열. 사용하지 않았으면 생략
- **Next**: `.jira-context.json`의 `completedSteps` 기반으로 다음 워크플로 단계를 추천. 워크플로 외 작업이면 맥락에 맞는 다음 작업 추천
- 워크플로와 무관한 단순 질의응답에서는 생략 가능
