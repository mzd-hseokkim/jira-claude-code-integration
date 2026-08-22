---
name: jira-task-auto
description: "Auto-execute the full Jira task workflow (start → approach → impl → test → review) sequentially. Triggers: jira-task auto, auto run; 자동 실행, 전체 워크플로 자동."
user-invocable: false
argument-hint: "<TASK-ID> [--skip <단계,...>]"
allowed-tools:
  - Read
  - Bash
  - Workflow
---

# jira-task-auto: Auto-Execute Full Workflow

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

`start → approach → impl+test → review` 파이프라인을 **Workflow 스크립트**(`scripts/auto.workflow.js`)로 실행하는 thin launcher.

- 제어 흐름(단계 순서·게이트 판정·scope shortfall triage·fix loop 최대 2회)은 전부 스크립트가 결정론적으로 수행한다. 이 스킬은 인자 파싱, args 조립, Workflow 호출, 결과 렌더링만 담당.
- 각 단계는 스크립트가 `agent()`(general-purpose)로 격리 실행 — 모델 차등(start haiku / approach opus / impl+test sonnet / review는 L1이면 sonnet, 그 외 opus)은 스크립트에 코드로 박혀 있다.
- `merge`/`pr`/`done`은 포함하지 않음 (worktree 경계 + 외부 공개 행위).
- 설계 근거: `tasks/auto-workflow-design.md`, triage 임계값 근거: `skills/jira-task-auto/refs/review-wrapper.md`.

> Workflow 도구 호출은 이 스킬의 지시에 의한 것으로, 사용자가 `/jira-task auto`(또는 loop)를 실행한 것이 곧 옵트인이다.

## Step 1: 인자 파싱

- `<TASK-ID>` 필수.
- `--skip <단계,...>` 또는 자연어("test 스킵", "test 빼고") → `USER_SKIP_STEPS` 목록. 스킵 가능 단계: `approach`, `impl`, `test`, `review` (start는 스킵 불가). 유효하지 않은 단계명은 무시하고 경고 한 줄: `⚠ 알 수 없는 단계 '<X>'는 스킵 목록에서 제외됩니다.`

## Step 2: Context 로드 + args 조립

cwd(worktree)의 `.jira-context.json`을 `Read`로 읽어 다음을 조립한다:

```
{ taskId, worktreePath, completedSteps, userSkipSteps,
  breakdownLevel,        // 없으면 null
  issueType,             // cachedIssue.issuetype 이름, 없으면 null
  ctxFiles: [<worktree ctx 절대경로>, <repoRoot aggregate 절대경로>] }
```

`worktreePath`가 cwd와 다르면 중단하고 안내: worktree로 이동 후 재실행 (`cd <worktreePath>`).

## Step 3: 스크립트 lookup

`skills/_shared/script-lookup.md`를 Read하고 `SCRIPT_NAME="auto.workflow.js"`, `OUT_VAR="AUTO_WF_JS"`로 lookup 블록을 실행한다. 빈 값이면 중단:

```
❌ Auto 실행 불가: auto.workflow.js를 찾지 못했습니다. 플러그인 설치 상태를 확인하세요.
```

## Step 4: 실행 계획 표시 + Workflow 호출

```
🚀 Auto 모드: <TASK-ID>

완료된 단계: <completedSteps 또는 "없음">
건너뛸 단계 (사용자 요청): <USER_SKIP_STEPS 또는 "없음">
남은 단계는 Workflow 스크립트가 순차 실행합니다 (PDCA 권고 자동 적용 — 사용자 명시 스킵이 우선).
```

`Workflow({ scriptPath: "<AUTO_WF_JS>", args: <Step 2의 객체> })`를 호출하고 완료 notification을 기다린다. 완료 전에 결과를 예단하지 않는다.

## Step 5: 결과 렌더링

Workflow 반환 객체의 `status`별로 렌더링한다. 공통: `<completedSteps>`는 반환값의 목록.

**`completed`**:

```
─────────────────────────────────────────
🎉 Auto 모드 완료 — <TASK-ID>
─────────────────────────────────────────
✅ 완료된 단계: <completedSteps, → 구분>
⏭ 스킵: <skipped.user + skipped.pdca, 없으면 줄 생략>
🔄 fix loop: <fixAttempts>회

**다음 단계** (수동 실행 필요):
- merge: `/jira-task merge <TASK-ID>` — worktree에서 로컬 병합
- pr:    `/jira-task pr <TASK-ID>`    — Pull Request 생성
- done:  `/jira-task done <TASK-ID>`  — 작업 완료 처리
─────────────────────────────────────────
```

**`aborted`** (단계 실패):

```
❌ Auto 모드 중단: <failedStage> 단계에서 실패했습니다.

원인: <reason>
현재 진행 상황: <completedSteps>

수동으로 문제를 해결한 후 재실행하거나, 해당 단계부터 직접 실행하세요: /jira-task <단계> <TASK-ID>
```

**`scope_shortfall`**:

```
❌ Auto 모드 중단 (scope shortfall): review 품질 게이트가 부분 구현 신호를 보였습니다.

신호:
- 설계-구현 매칭률: <metrics.matchRate>% (임계값 70%)
- Critical 이슈: <metrics.criticalCount>건 (임계값 3건)

판단: 단일 fix sub-agent로 메우기 어려운 scope 누락으로 보입니다. 자동 fix loop을 건너뛰고 사용자 결정에 위임합니다.

현재 진행 상황: <completedSteps>

다음 권장 흐름 중 택일:
1. 부분 구현을 그대로 수용하고 Phase 1으로 종료 → `/jira-task merge <TASK-ID>` 후 미구현 subtask는 별도 init
2. 추가 구현 직접 수행 → 해당 worktree에서 추가 작업 후 `/jira-task review <TASK-ID>` 재실행
3. impl/test/review 단계만 수동 재실행 → 단계별로 `/jira-task <단계> <TASK-ID>` 호출
```

**`fix_unconverged`** (fix agent의 inner sensor loop이 5회 내 green 실패 — 재리뷰 없이 중단):

```
❌ Auto 모드 중단: 리뷰 지적 수정이 lint/typecheck/관련 테스트로 수렴하지 않았습니다 (inner loop <innerLoopIterations>회).

마지막 센서 출력:
<sensorSummary>

판단: computational sensor로 잡히지 않는 종류의 문제(설계 갭 등)로 보입니다. 사용자 결정에 위임합니다.
현재 진행 상황: <completedSteps>

worktree에서 직접 수정 후 재실행하세요: /jira-task test <TASK-ID> → /jira-task review <TASK-ID>
```

**`fix_exhausted`**:

```
❌ Auto 모드 중단: review 품질 게이트를 2회 시도 후에도 통과하지 못했습니다.

미해결 신호: Critical <metrics.criticalCount>건, 매칭률 <metrics.matchRate>%
현재 진행 상황: <completedSteps>

리뷰 리포트 확인: docs/review/<TASK-ID>.review.md
수동으로 수정 후 재실행하세요: /jira-task review <TASK-ID>
```

## Step 5.5: run-log 기록 (관측용, non-blocking)

렌더링 후 Workflow 반환 객체를 **어떤 status든** run-log에 1줄 기록한다 (retro의 입력 — `tasks/retro-skill-design.md` §2). `script-lookup.md`로 `append-run-log.py`를 해석한 뒤 Bash 1회:

```bash
printf '%s' '<Workflow 반환 객체 JSON 그대로>' | python3 "$APPEND_RUN_LOG_PY" <TASK-ID> - ".jira-context.json" "docs/run-log"
```

단계 소요시간은 스크립트가 worktree context의 `<step>At` 타임스탬프로 계산한다. 실패해도 워크플로 결과에는 영향 없음 — 경고 한 줄만 출력.

## 재개(Resume)

중단 후 `/jira-task auto <TASK-ID>` 재실행이 정본 경로다 — Step 2가 최신 `completedSteps`를 읽어 남은 단계만 실행 계획에 들어간다. (같은 세션에서 스크립트를 수정하며 재시도하는 플러그인 개발 상황에서만 Workflow `resumeFromRunId`를 쓴다.)
