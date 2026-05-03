---
name: jira-task-auto
description: "Auto-execute the full Jira task workflow (start → plan → design → impl → test → review) sequentially. Triggers: jira-task auto, auto run; 자동 실행, 전체 워크플로 자동."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Edit
  - Agent
---

# jira-task-auto: Auto-Execute Full Workflow

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

`start → plan → design → impl → test → review` 단계를 자동으로 순차 실행하는 **경량 오케스트레이터**.

- 각 단계는 **독립된 sub-agent(`Agent` 도구)**로 실행 → 컨텍스트 격리 + 페르소나 격리
- 단계별로 적합한 모델 배정 (모델 차등)
- `merge`, `pr`, `done`은 포함하지 않음 (worktree 경계 + 외부 공개 행위)
- 이미 완료된 단계는 건너뜀 (`.jira-context.json`의 `completedSteps` 기반)
- review에서 문제 발견 시 → 수정 sub-agent → test → review 재시도 (최대 2회)
- 그 외 단계 실패 시 즉시 중단

**핵심 원칙: 오케스트레이터는 가볍게 유지한다.** `.jira-context.json` 확인, Agent 호출, 결과 판정만 수행. 단계별 작업은 모두 sub-agent에 위임. 부모 컨텍스트로 산출물 본문이 들어오지 않는다 (path만 추적).

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

각 단계를 독립 sub-agent로 순차 실행합니다 (모델 차등 적용).
```

## Step 2: Sequential Execution

아래 순서로 각 단계를 실행. **각 단계는 `Agent` 도구로 독립 sub-agent를 생성하여 위임한다.** Skill 도구로 부모 컨텍스트에서 직접 호출하지 않는다.

**중요 규칙:**
- 각 단계 호출 전, `.jira-context.json`을 `Read`로 다시 읽어 이미 완료되었으면 건너뜀
- 각 Agent는 foreground 실행 (결과를 받아야 다음 단계 진행 가능)
- Agent 완료 후, `.jira-context.json`을 `Read`로 다시 읽어 `completedSteps`에 추가되었는지 확인
- 추가되지 않았으면 해당 단계 실패로 판단 → 중단 (review만 예외, Step 3 참조)

### Sub-agent 호출 표준 계약

각 단계가 `completedSteps`에 없으면, 아래 패턴으로 `Agent`를 호출:

```
Agent({
  description: "Jira-task <step> for <TASK-ID>",
  subagent_type: <단계별 subagent_type>,
  model: <단계별 모델>,
  prompt: <단계별 prompt — 아래 표준 prompt 형식 참조>
})
```

### 단계별 subagent_type 및 모델

| 순서 | 단계 | subagent_type | 모델 | 사고 유형 |
|------|------|---------------|------|----------|
| 1 | start | `general-purpose` | haiku | 상태 전이 + 브랜치 셋업, 판단 거의 없음 |
| 2 | plan | `general-purpose` | opus | 스코프 결정 — 사고 집약적 |
| 3 | design | `general-purpose` | opus | 결정·아키텍처, 가장 사고 집약적 |
| 4 | impl | `general-purpose` | sonnet | 코드 생성, 토큰 다량 소비 |
| 5 | test | `general-purpose` | sonnet | 실행 + 결과 정리 |
| 6 | review | `general-purpose` | opus | 오케스트레이션만 — 실제 리뷰 작업은 inner `jira-reviewer` agent가 수행 |

전 단계 `general-purpose`로 통일한다. review의 self-praise bias 차단은 `jira-task-review` Skill 내부에서 자체적으로 띄우는 `jira-reviewer` subagent가 담당한다 (Step 2, `Reviewer Independence Rule`).

> review wrapper를 `jira-integration:jira-reviewer`로 두면 inner reviewer와 2단 nesting이 발생해 부팅이 두 번 든다. wrapper는 `general-purpose`로 두고 실제 리뷰는 inner agent에 맡긴다.

### 표준 Prompt 형식

review 외 단계 (start/plan/design/impl/test):

```
Jira task <TASK-ID>의 <단계명> 단계를 수행하라.

다음 절차를 따른다:
1. `jira-integration:jira-task-<단계명>` Skill을 호출 (인자: "<TASK-ID>").
2. Skill이 정의한 모든 단계를 그대로 수행.
3. 완료 후, 부모 컨텍스트로 다음 형식의 *최소 요약*만 반환하라:

---
- step: <단계명>
- result: success | failed
- artifactPath: <docs/.../<TASK-ID>.<type>.md 등 또는 null>
- jiraCommentPosted: yes | no
- nextStepHint: <옵션, 한 줄. 부모가 다음 단계에 전달할 만한 권고가 있을 때만>
- failureReason: <result=failed일 때만, 한 줄>
---

산출물 본문(plan/design/test/review 문서 내용 등)을 부모에 그대로 출력하지 마라 — 부모 컨텍스트 오염 방지.
```

review 단계 (general-purpose wrapper, **`[review-self-mode]` 마커 필수**):

```
[review-self-mode]

Jira task <TASK-ID>의 review 단계를 수행하라. `jira-integration:jira-task-review` Skill을 호출하고, 동일한 *최소 요약* 형식으로 결과만 반환하라. 산출물 본문 미반환.

주의: 본 wrapper는 이미 격리된 sub-agent 컨텍스트이므로 추가 `Agent` 도구 사용 권한이 없다. `[review-self-mode]` 마커에 따라 Skill의 Step 2를 self-mode(직접 수행)로 진행한다 — gap analysis / lint / code quality 검토를 wrapper agent가 직접 수행. 이미 plan/design/impl과 분리된 fresh context이므로 self-praise bias 우려 없음.
```

> `[review-self-mode]` 마커는 필수다. 누락 시 Skill이 Mode A(Agent delegation)로 돌입했다가 sub-agent 환경의 Agent 도구 부재로 fail한다.

### 단계 간 진행 메시지

각 단계 완료 후 다음 단계 시작 전에 출력:

```
✅ <단계명> 완료 → 다음: <다음단계명> 시작 중...
```

## Step 3: Review Quality Gate

review sub-agent 완료 후 `.jira-context.json`을 `Read`로 읽어 `completedSteps`에 `"review"`가 있는지 확인.

### 통과 (Approve)

`"review"`가 `completedSteps`에 있으면 → Step 5(Completion Summary)로 진행.

### 미통과 (Request Changes) — Scope 분기 + 자동 수정 루프

`"review"`가 `completedSteps`에 없으면 → 품질 게이트 미통과. **fix loop 진입 전** 다음 휴리스틱으로 scope shortfall 여부를 판정한다.

#### Scope Shortfall Triage

`docs/review/<TASK-ID>.review.md`를 `Read`로 읽고 다음 신호를 추출한다:
- **Gap matchRate**: "설계-구현 매칭률" 또는 "Implementation Plan 매칭" 등에 기재된 백분율 (정규식: `매칭률[^0-9]*([0-9]+)%` 또는 `(\d+)\s*/\s*\d+\s*\(([0-9.]+)%\)`).
- **Critical count**: "Critical" 섹션 항목 수.
- **Warning count**: "Warning" 섹션 항목 수.

**분기 규칙**:

| 조건 | 판정 | 동작 |
|------|------|------|
| matchRate < 70% **또는** Critical count ≥ 3 | **Scope shortfall** | fix loop 진입 안 함, 즉시 중단 (아래 Scope Shortfall Bail) |
| matchRate ≥ 70% **그리고** Critical count < 3 | **Trivial fix** | 기존 fix loop 진입 (최대 2회) |
| 위 두 신호 추출 실패 (parse error) | 기존 동작 보존 | fix loop 진입 (fail-safe) |

**근거**: matchRate가 낮거나 Critical이 많으면 scope 자체가 누락된 상태. fix sub-agent 한 번에 부족분을 다 메우기 어렵고, fix loop이 동일하게 실패하며 시간만 소진된다. 이런 경우 사용자가 의식적으로 추가 작업을 결정해야 한다.

#### Scope Shortfall Bail (즉시 중단)

```
❌ Auto 모드 중단 (scope shortfall): review 품질 게이트가 부분 구현 신호를 보였습니다.

신호:
- 설계-구현 매칭률: <matchRate>% (임계값 70%)
- Critical 이슈: <count>건 (임계값 3건)

판단: 단일 fix sub-agent로 메우기 어려운 scope 누락으로 보입니다. 자동 fix loop을 건너뛰고 사용자 결정에 위임합니다.

현재 진행 상황: <completedSteps>

다음 권장 흐름 중 택일:
1. 부분 구현을 그대로 수용하고 Phase 1으로 종료 → `/jira-task merge <TASK-ID>` 후 미구현 subtask는 별도 init
2. 추가 구현 직접 수행 → 해당 worktree에서 추가 작업 후 `/jira-task review <TASK-ID>` 재실행
3. impl/test/review 단계만 수동 재실행 → 단계별로 `/jira-task <단계> <TASK-ID>` 호출
```

#### Trivial Fix Path — 자동 수정 루프

위 분기가 "Trivial fix"이면 최대 **2회** 자동 수정 후 재검증한다.

**품질 기준:**
- 설계-구현 매칭률 100%
- Code Quality에서 Critical / Warning 이슈 없음

**루프 절차 (회차별, 모두 sub-agent로 위임):**

1. **수정 sub-agent** (`general-purpose`, sonnet):

   ```
   Agent({
     description: "Apply review fixes for <TASK-ID>",
     subagent_type: "general-purpose",
     model: "sonnet",
     prompt: <아래 prompt>
   })
   ```

   prompt:
   ```
   Jira task <TASK-ID>의 리뷰 지적사항을 직접 수정하라.

   1. `docs/review/<TASK-ID>.review.md`를 Read로 읽는다.
   2. Critical / Warning 항목과 Gap Analysis 미충족 항목을 식별한다.
   3. 지적된 이슈를 Edit으로 코드에 직접 반영한다. 수정 범위는 리뷰 지적 사항에 한정 — 무관한 리팩토링 금지.
   4. `.jira-context.json`을 Read로 읽고, completedSteps에서 "test"와 "review"를 제거한 뒤 Edit으로 다시 쓴다 (재실행 가능하게).
   5. 부모에 다음 최소 요약만 반환:
      - step: review-fix
      - result: success | failed
      - filesEdited: <수정한 파일 수>
      - failureReason: <실패 시 한 줄>
   ```

2. **test 재실행**: Step 2의 표준 호출로 test sub-agent 재호출.
3. **review 재실행**: Step 2의 표준 호출로 review sub-agent (`jira-integration:jira-reviewer`) 재호출.
4. **품질 게이트 재확인**: `.jira-context.json`을 읽어 `completedSteps`에 `"review"` 존재 여부 확인.

수정 루프 진행 시 출력:

```
🔄 Review 품질 게이트 미통과 (시도 <N>/2) — 수정 sub-agent에 위임 후 재검증합니다.
```

### 2회 실패 시 중단

2회 자동 수정 후에도 review가 통과하지 않으면 중단하고 사용자에게 보고:

```
❌ Auto 모드 중단: review 품질 게이트를 2회 시도 후에도 통과하지 못했습니다.

미해결 이슈:
- <남은 Critical/Warning 항목 — sub-agent 반환 요약에서 추출>

현재 진행 상황: <completedSteps>

수동으로 수정 후 재실행하세요: /jira-task review <TASK-ID>
```

## Step 4: Failure Handling (review 외)

review를 제외한 단계 실패 시 즉시 중단하고 안내:

```
❌ Auto 모드 중단: <단계명> 단계에서 실패했습니다.

원인: <sub-agent 반환 요약의 failureReason>
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
- merge: `/jira-task merge <TASK-ID>` — worktree에서 로컬 병합
- pr:    `/jira-task pr <TASK-ID>`    — Pull Request 생성
- done:  `/jira-task done <TASK-ID>`  — 작업 완료 처리
─────────────────────────────────────────
```
