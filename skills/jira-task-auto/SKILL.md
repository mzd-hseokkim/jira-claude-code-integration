---
name: jira-task-auto
description: "Auto-run a Jira task up to the next human gate — L2/L3 stop at plan approval, then test-write → impl → verify stops at 'ready for review'. Triggers: jira-task auto, auto run; 자동 실행, 전체 워크플로 자동."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Bash
  - Workflow
  - AskUserQuestion
---

# jira-task-auto: 다음 사람 게이트까지 자동 진행

**공용 규약**: `skills/_shared/conventions.md`를 먼저 Read한다 — 언어, TASK-ID 감지, harness 차이 (한국어 출력, Jira 코멘트 제목은 영어).

**Codex 등 Workflow 도구가 없는 harness**: Step 1~3(등급은 텍스트로 묻는다)까지만 하고 Workflow를 부르지 않는다. 대신 worktree 터미널에서 runner를 실행하라고 안내하고 멈춘다 — runner가 같은 `auto.workflow.js`를 단계마다 새 `codex exec` 세션으로 돌리고 결과 렌더링·run-log까지 한다(설계: `tasks/harness-adapter-design.md` §6):
```
cd <worktreePath>
node "<scriptsDir>/auto-codex.js" <TASK-ID>
```
보호 hook을 `/hooks`에서 trust하지 않았으면 `--bypass-hook-trust`를 붙여야 테스트 보호가 동작한다고 함께 알린다.

## Overview

`scripts/auto.workflow.js`를 Workflow로 실행하는 thin launcher다. 단계 순서·게이트·triage·fix loop는 스크립트가 결정론적으로 정하고, 이 스킬은 등급 확정·args 조립·호출·결과 렌더링만 한다.

| 시작 상태 | 스크립트가 하는 일 | 멈추는 곳 |
|---|---|---|
| L1 | start → test-write → impl → verify(+fix) | 리뷰 요청 준비됨 |
| L2·L3, 산출물 전 또는 승인 전 | start → approach | 승인 대기 (draft PR) |
| L2·L3, plan 승인됨 | test-write(승인 확인) → impl → verify(+fix) | 리뷰 요청 준비됨 |

- 단계마다 새 sub-agent라 test-write / impl / verify는 서로 다른 컨텍스트다. 모델: start haiku / approach opus / test-write·impl·fix sonnet / verify opus(L1 sonnet).
- draft 해제·머지·done은 포함하지 않는다(사람 몫, 외부 공개 행위).
- 설계: `tasks/sdlc-alignment-design.md` §8, triage 근거: `skills/jira-task-auto/refs/review-wrapper.md`.

> Workflow 도구 호출은 이 스킬의 지시에 의한 것으로, 사용자가 `/jira-task auto`(또는 loop)를 실행한 것이 곧 옵트인이다.

## Step 1: Context 로드

cwd(worktree)의 `.jira-context.json`을 Read한다. `worktreePath`가 cwd와 다르면 중단하고 `cd <worktreePath>` 후 재실행을 안내한다.

## Step 2: 등급 확정 (main 세션)

sub-agent는 사용자에게 물을 수 없으므로 등급은 여기서 정한다. context `level`이 있거나 `cachedIssue.labels`에 `sdlc-L*`가 있으면 건너뛴다. 없으면 `skills/_shared/sdlc-level.md`대로 판정·확정·기록(라벨·코멘트·`--patch level/riskSignals`)한다. 사용자가 확정하지 않으면 Workflow를 부르지 않고 멈춘다.

## Step 3: 스크립트 lookup과 args

`skills/_shared/script-lookup.md`를 Read하고 `SCRIPT_NAME="auto.workflow.js"`, `OUT_VAR="AUTO_WF_JS"`로 lookup한다. 디렉터리(`dirname`)가 `scriptsDir`다. 빈 값이면 중단: `❌ Auto 실행 불가: auto.workflow.js를 찾지 못했습니다. 플러그인 설치 상태를 확인하세요.`

```
{ taskId, worktreePath, completedSteps,
  level,                 // Step 2에서 확정한 값
  ctxFiles: [<worktree ctx 절대경로>, <repoRoot aggregate 절대경로>],
  scriptsDir }
```

## Step 4: 실행

```
🚀 Auto 모드: <TASK-ID> (<level>)
완료된 단계: <completedSteps 또는 "없음">
다음 사람 게이트까지 진행합니다.
```

`Workflow({ scriptPath: "<AUTO_WF_JS>", args: <Step 3의 객체> })`를 호출하고 완료 notification을 기다린다. 결과를 예단하지 않는다.

`scriptPath must be a script path this tool returned, or a file you can already read …`로 거부되면 플러그인 경로가 워킹 디렉터리에 없는 것이다. 등록 후 중단한다(재시도하지 않는다 — settings는 세션 시작 시 읽힌다):

```bash
python3 "<scriptsDir>/ensure-workflow-dir.py"
```
```
❌ Auto 실행 불가: 플러그인 경로가 워킹 디렉터리에 없어 Workflow 도구가 거부했습니다.
settings.json에 등록했습니다 — 새 세션부터 자동 적용됩니다.
지금 세션에서 이어서 하려면: /add-dir <출력의 dir> 실행 후 `/jira-task auto <TASK-ID>` 재실행.
```

## Step 5: 결과 렌더링

공통: `<completedSteps>`, `<prUrl>`은 반환값.

**`completed`** — 리뷰 요청 준비됨:
```
✅ 리뷰 요청 준비됨 — <TASK-ID>
- 수용 조건: <metrics.acMet>/<metrics.acTotal> 충족 (미확인 <acUnverified>)
- fix loop: <fixAttempts>회
- PR: <prUrl> (draft)

diff와 검증 결과를 직접 확인한 뒤 `gh pr ready <번호>`로 리뷰를 요청하세요. 머지는 코드 오너가 합니다.
머지 뒤: `/jira-task done <TASK-ID>` (loop라면 `loop sync`)
```

**`awaiting_approval`**:
```
⏸ 승인 대기 — <TASK-ID> (<artifact>)
- PR: <prUrl> (draft)
- <gateDetail가 있으면: 승인 확인 결과 — <gateDetail>>

승인자가 PR에 `APPROVE <plan|intent|spec> <SHA>` 한 줄을 남기면 `/jira-task auto <TASK-ID>`로 이어서 진행합니다.
```
`awaitingKind`가 `answers`면 제목을 `⏸ 답변 대기`로 하고 마지막 줄을 "승인자가 PR의 질문에 답하면 `/jira-task auto <TASK-ID>`가 spec에 반영하고 승인을 요청합니다."로 바꾼다.

**`level_unconfirmed`**: `⏸ 등급이 확정되지 않아 멈췄습니다. /jira-task start <TASK-ID>로 등급을 확정하세요.`

**`aborted`**:
```
❌ Auto 모드 중단: <failedStage> 단계 실패
원인: <reason>
현재 진행: <completedSteps>
해결 후 재실행하거나 해당 단계를 직접 실행하세요: /jira-task <단계> <TASK-ID>
```

**`scope_shortfall`**:
```
❌ Auto 모드 중단 (scope shortfall): 미충족 수용 조건 <acUnmet>/<acTotal>, Critical <criticalCount>건 (기준: 미충족 2건 이상이면서 30% 초과, 또는 Critical 3건 이상)
<unmet 목록>
단일 수정으로 메우기 어려운 누락으로 보여 자동 수정을 건너뜁니다. 선택지:
1. 계획을 고친다 — plan.md·spec.md 수정 후 재승인 (수용 조건을 바꾸면 spec도 다시 승인받습니다)
2. 직접 구현을 보완한다 → `/jira-task verify <TASK-ID>`
3. 작업을 나눈다 — 미충족 범위를 새 이슈로
```

**`fix_unconverged`**:
```
❌ Auto 모드 중단: 수정이 lint/typecheck/이 작업의 테스트로 수렴하지 않았습니다 (inner loop <innerLoopIterations>회)
마지막 센서 출력: <sensorSummary>
worktree에서 직접 고친 뒤: /jira-task verify <TASK-ID>
```

**`fix_exhausted`**:
```
❌ Auto 모드 중단: 검증을 2회 수정 후에도 통과하지 못했습니다.
미해결: <unmet 목록>
검증 결과: work/<TASK-ID>/evidence/verification.md (L1은 PR 본문)
```

**`test_dispute`**:
```
⏸ 테스트 이견 — 구현 세션이 테스트가 틀렸다고 판단했습니다 (테스트는 고치지 않았습니다).
사유: <testDispute>
테스트를 고칠지 사용자가 정합니다: 고치려면 사유를 남기고 `/jira-task test-write <TASK-ID>`, 아니면 `/jira-task impl <TASK-ID>`.
```

## Step 6: run-log 기록 (관측용, non-blocking)

어떤 status든 반환 객체를 run-log에 1줄 기록한다. Bash 1회:

```bash
printf '%s' '<Workflow 반환 객체 JSON 그대로>' | python3 "<scriptsDir>/append-run-log.py" <TASK-ID> - ".jira-context.json" "<repoRoot>/docs/run-log"
```

실패해도 결과에는 영향 없음 — 경고 한 줄만. loop가 EnterWorktree 안에서 부른 경우 메인 레포 경로 쓰기가 막힐 수 있는데, 그때는 loop가 main에 돌아와 대신 기록한다.

## 재개

`/jira-task auto <TASK-ID>` 재실행이 정본 경로다 — 최신 `completedSteps`로 남은 단계만 진행하고, 승인 대기였다면 test-write가 승인부터 다시 확인한다.
