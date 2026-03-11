---
name: jira-task-auto
description: Auto-execute the full Jira task workflow (start → plan → design → impl → test → review) sequentially. Resumes from completedSteps if already partially done. Use when user says "auto", "jira-task auto", "자동 실행", "전체 워크플로 자동", or wants to run the full workflow without manual steps.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Edit
  - Agent
---

# jira-task-auto: Auto-Execute Full Workflow

## Language Rule

모든 출력을 한국어로 작성한다: 사용자 응답, 생성 문서, Jira 코멘트 내용 등 모든 텍스트가 대상이다.
예외: 코드, 변수명, 브랜치명, 파일명, 명령어는 영어를 유지한다.
Jira 코멘트: 섹션 제목(##, ###)은 영어로, 내용(설명·요약·노트)은 한국어로 작성한다.

## Overview

`start → plan → design → impl → test → review` 단계를 자동으로 순차 실행하는 **경량 오케스트레이터**.

- 각 단계는 **독립된 sub-agent(`Agent` 도구)**로 실행 → 컨텍스트 격리
- `merge`, `pr`, `done`은 포함하지 않음 (worktree 경계 + 외부 공개 행위)
- 이미 완료된 단계는 건너뜀 (`.jira-context.json`의 `completedSteps` 기반)
- review에서 문제 발견 시 → 수정 agent → test → review 재시도 (최대 2회)
- 그 외 단계 실패 시 즉시 중단

**핵심 원칙: 오케스트레이터는 가볍게 유지한다.** `.jira-context.json` 확인, Agent 호출, 결과 판정만 수행. 실제 작업은 모두 sub-agent에 위임.

## Step 1: Load Context and Plan Execution

`.jira-context.json`을 `Read` 도구로 읽어 `completedSteps`를 확인.

**실행 대상 단계**: `["start", "plan", "design", "impl", "test", "review"]`

이미 완료된 단계를 제외한 나머지를 실행 계획으로 결정.

사용자에게 실행 계획을 보여준다:

```
🚀 Auto 모드: <TASK-ID>

실행할 단계: start → plan → design → impl → test → review
완료된 단계: <completedSteps 목록 또는 "없음">
건너뛸 단계: <이미 완료된 단계 목록 또는 "없음">

각 단계를 독립 sub-agent로 순차 실행합니다.
```

## Step 2: Sequential Execution

아래 순서로 각 단계를 실행. **각 단계는 `Agent` 도구로 독립 sub-agent를 생성하여 실행한다.**

**중요 규칙:**
- 각 단계 호출 전, `.jira-context.json`을 `Read`로 다시 읽어 이미 완료되었으면 건너뜀
- 각 Agent는 foreground로 실행 (결과를 받아야 다음 단계 진행 가능)
- Agent 완료 후, `.jira-context.json`을 `Read`로 다시 읽어 `completedSteps`에 추가되었는지 확인
- 추가되지 않았으면 해당 단계 실패로 판단 → 중단

### Agent 호출 패턴

각 단계가 `completedSteps`에 없으면, 아래 패턴으로 Agent를 호출:

```
Agent({
  subagent_type: "general-purpose",
  description: "jira-task <단계명> <TASK-ID>",
  prompt: "Jira 작업 <TASK-ID>의 <단계명> 단계를 실행해주세요. Skill 도구를 사용하여 `jira-integration:jira-task-<스킬명>`을 args: \"<TASK-ID>\"로 호출하세요. 스킬의 지시를 끝까지 따라 완료해주세요. 모든 출력은 한국어로 작성하세요."
})
```

**단계별 매핑:**

| 순서 | 단계명 | 스킬 | Agent description |
|------|--------|------|-------------------|
| 1 | start | `jira-integration:jira-task-start` | `jira-task start <TASK-ID>` |
| 2 | plan | `jira-integration:jira-task-plan` | `jira-task plan <TASK-ID>` |
| 3 | design | `jira-integration:jira-task-design` | `jira-task design <TASK-ID>` |
| 4 | impl | `jira-integration:jira-task-impl` | `jira-task impl <TASK-ID>` |
| 5 | test | `jira-integration:jira-task-test` | `jira-task test <TASK-ID>` |
| 6 | review | `jira-integration:jira-task-review` | `jira-task review <TASK-ID>` |

### 단계 간 진행 메시지

각 단계 완료 후 다음 단계 시작 전에 출력:

```
✅ <단계명> 완료 → 다음: <다음단계명> 시작 중...
```

## Step 3: Review Quality Gate

review 단계 Agent 완료 후 `.jira-context.json`을 읽어 `completedSteps`에 `"review"`가 있는지 확인.

### 통과 (Approve)

`"review"`가 `completedSteps`에 있으면 → Step 5(Completion Summary)로 진행.

### 미통과 (Request Changes) — 자동 수정 루프

`"review"`가 `completedSteps`에 없으면 → 품질 게이트 미통과. 최대 **2회** 자동 수정 후 재검증한다.

**품질 기준:**
- 설계-구현 매칭률 100%
- Code Quality에서 Critical / Warning 이슈 없음

**루프 절차 (회차별):**

1. **수정 Agent 실행**: 리뷰 리포트를 분석하고 코드를 수정하는 Agent를 실행
   ```
   Agent({
     subagent_type: "general-purpose",
     description: "auto-fix review issues <TASK-ID>",
     prompt: "Jira 작업 <TASK-ID>의 리뷰에서 지적된 이슈를 수정해주세요.
   1. `docs/review/<TASK-ID>.review.md`를 읽어 Critical/Warning 항목과 Gap Analysis 미충족 항목을 파악하세요.
   2. 지적된 이슈를 Edit 도구로 직접 수정하세요. 수정 범위는 리뷰 지적 사항에 한정합니다.
   3. `.jira-context.json`을 읽고, completedSteps 배열에서 \"test\"와 \"review\"를 제거하세요 (재실행 가능하게).
   모든 출력은 한국어로 작성하세요."
   })
   ```

2. **test 재실행**: test Agent 호출 (Step 2와 동일 패턴)
3. **review 재실행**: review Agent 호출 (Step 2와 동일 패턴)
4. **품질 게이트 재확인**: `.jira-context.json`을 읽어 `completedSteps`에 `"review"` 존재 여부 확인

수정 루프 진행 시 출력:

```
🔄 Review 품질 게이트 미통과 (시도 <N>/2) — 수정 Agent 실행 후 재검증합니다.
```

### 2회 실패 시 중단

2회 자동 수정 후에도 review가 통과하지 않으면 중단하고 사용자에게 보고:

```
❌ Auto 모드 중단: review 품질 게이트를 2회 시도 후에도 통과하지 못했습니다.

미해결 이슈:
- <남은 Critical/Warning 항목>

현재 진행 상황: <completedSteps>

수동으로 수정 후 재실행하세요: /jira-task review <TASK-ID>
```

## Step 4: Failure Handling (review 외)

review를 제외한 단계 실패 시 즉시 중단하고 안내:

```
❌ Auto 모드 중단: <단계명> 단계에서 실패했습니다.

원인: <Agent가 반환한 실패 사유>
현재 진행 상황: <completedSteps>

수동으로 문제를 해결한 후 재실행하거나,
해당 단계부터 직접 실행하세요: /jira-task <단계명> <TASK-ID>
```

## Step 5: Completion Summary

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
