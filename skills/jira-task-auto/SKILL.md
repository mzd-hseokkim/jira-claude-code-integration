---
name: jira-task-auto
description: Auto-execute the full Jira task workflow (start → plan → design → impl → test → review) sequentially. Resumes from completedSteps if already partially done. Use when user says "auto", "jira-task auto", "자동 실행", "전체 워크플로 자동", or wants to run the full workflow without manual steps.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Skill
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_search
  - mcp__atlassian__jira_add_comment
---

# jira-task-auto: Auto-Execute Full Workflow

## Language Rule

모든 출력을 한국어로 작성한다: 사용자 응답, 생성 문서, Jira 코멘트 내용 등 모든 텍스트가 대상이다.
예외: 코드, 변수명, 브랜치명, 파일명, 명령어는 영어를 유지한다.
Jira 코멘트: 섹션 제목(##, ###)은 영어로, 내용(설명·요약·노트)은 한국어로 작성한다.

## Overview

`start → plan → design → impl → test → review` 단계를 자동으로 순차 실행하는 오케스트레이터.

- `merge`, `pr`, `done`은 포함하지 않음 (worktree 경계 + 외부 공개 행위)
- 이미 완료된 단계는 건너뜀 (`.jira-context.json`의 `completedSteps` 기반)
- 각 단계 실패 시 즉시 중단

## Step 1: Load Context and Plan Execution

`.jira-context.json`을 읽어 `completedSteps`를 확인:

```bash
cat .jira-context.json 2>/dev/null || echo "{}"
```

**실행 대상 단계**: `["start", "plan", "design", "impl", "test", "review"]`

이미 완료된 단계를 제외한 나머지를 실행 계획으로 결정.

사용자에게 실행 계획을 보여준다:

```
🚀 Auto 모드: <TASK-ID>

실행할 단계: start → plan → design → impl → test → review
완료된 단계: <completedSteps 목록 또는 "없음">
건너뛸 단계: <이미 완료된 단계 목록 또는 "없음">

단계별로 순차 실행합니다. 각 단계가 완료되면 다음으로 진행합니다.
```

## Step 2: Sequential Execution

아래 순서로 각 단계를 실행. **각 단계는 `Skill` 도구로 호출한다.**

**중요 규칙:**
- 각 단계 호출 전, `.jira-context.json`을 다시 읽어 이미 완료되었으면 건너뜀
- 각 단계 호출 후, `.jira-context.json`을 다시 읽어 `completedSteps`에 추가되었는지 확인
- 추가되지 않았으면 해당 단계 실패로 판단 → 중단
- 서브 스킬이 사용자에게 질문하면 자연스럽게 대기하고 답변 후 계속 진행

### 단계별 실행

각 단계가 `completedSteps`에 없으면 실행:

1. **start**: `Skill({ skill: "jira-integration:jira-task-start", args: "<TASK-ID>" })`
2. **plan**: `Skill({ skill: "jira-integration:jira-task-plan", args: "<TASK-ID>" })`
3. **design**: `Skill({ skill: "jira-integration:jira-task-design", args: "<TASK-ID>" })`
4. **impl**: `Skill({ skill: "jira-integration:jira-task-impl", args: "<TASK-ID>" })`
5. **test**: `Skill({ skill: "jira-integration:jira-task-test", args: "<TASK-ID>" })`
6. **review**: `Skill({ skill: "jira-integration:jira-task-review", args: "<TASK-ID>" })`

### 단계 간 진행 메시지

각 단계 완료 후 다음 단계 시작 전에 출력:

```
✅ <단계명> 완료 → 다음: <다음단계명> 시작 중...
```

## Step 3: Failure Handling

단계 실패 시 즉시 중단하고 안내:

```
❌ Auto 모드 중단: <단계명> 단계에서 실패했습니다.

원인: <실패 이유>
현재 진행 상황: <completedSteps>

수동으로 문제를 해결한 후 재실행하거나,
해당 단계부터 직접 실행하세요: /jira-task <단계명> <TASK-ID>
```

**test 실패**: 테스트 실패는 정상적인 중단 사유. 사용자에게 테스트 수정 후 재실행 안내.
**review 거부**: 리뷰에서 심각한 문제 발견 시 중단. 수정 후 재실행 안내.

## Step 4: Completion Summary

모든 단계 완료 시:

```
─────────────────────────────────────────
🎉 Auto 모드 완료 — <TASK-ID>
─────────────────────────────────────────
✅ 완료된 단계: start → plan → design → impl → test → review

**다음 단계** (수동 실행 필요):
- merge: `/jira-local-merge <TASK-ID>` — worktree에서 로컬 병합
- pr:    `/jira-task pr <TASK-ID>`    — Pull Request 생성
- done:  `/jira-task done <TASK-ID>`  — 작업 완료 처리
─────────────────────────────────────────
```
