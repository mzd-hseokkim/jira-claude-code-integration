---
name: jira-task-loop
description: "Drain the initialized Jira task queue — auto + local merge per task, with base rebase between tasks. Triggers: jira-task loop; 루프 실행, 큐 소진."
user-invocable: false
argument-hint: "[--skip <단계,...>]"
allowed-tools:
  - Read
  - Edit
  - Bash
  - Skill
---

# jira-task-loop: Drain Task Queue

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

init된 태스크 큐를 순차 소진하는 **태스크 레벨 오케스트레이터**. `auto`가 한 태스크 안의 단계 루프라면, `loop`는 태스크 사이의 루프다.

- 태스크마다: `auto`(start→approach→impl+test→review) → review 게이트 확인 → `jira-local-merge`(In Review 전이)
- 머지 직후, 큐에 남은 worktree 브랜치를 최신 base로 rebase (stale base 방지).
- `done` / `pr` / `clean`은 포함하지 않음 — "merge 후 main에서 사람이 확인"하는 게이트를 보존. 루프가 끝나면 모든 처리 태스크는 Jira "In Review" 상태로 정렬된다.
- **태스크-로컬 실패는 격리(quarantine)하고 계속, 시스템 실패만 전체 중단.** auto 게이트 미통과·scope shortfall·단계 실패·merge 충돌·rebase 충돌은 전부 그 태스크만 `deferred`로 보류하고 다음 태스크로 간다 (Step 2.5). 연속 동일 단계 실패 2건이나 인프라 시그니처(인증/MCP/base 손상)만 전체 중단 (Step 4). 사람의 역할은 루프 끝의 **예외 리포트** 검토다 (Step 3). 설계: `tasks/loop-quarantine-design.md`.
- 재진입 가능: 큐는 매번 `completedSteps`에서 재계산 — 중단·격리 후 `/jira-task loop` 재실행하면 격리 태스크를 포함해 이어서 진행.

**핵심 원칙: 오케스트레이터는 가볍게 유지한다.** context 읽기, Skill 호출, rebase, 판정만 수행. 단계별 작업·산출물은 모두 auto/merge 스킬(과 그 sub-agent)에 위임하고, 산출물 본문을 컨텍스트로 가져오지 않는다.

## Step 1: Load Queue

1. cwd의 `.jira-context.json`을 `Read`. `tasks[]` 배열이 있으면 aggregate. 없으면(worktree-local) 그 안의 `repoRoot`로 `<repoRoot>/.jira-context.json`을 다시 `Read`. 이 시점에 `REPO_ROOT`와 aggregate **절대 경로**를 확정한다 — 루프 중 cwd가 각 worktree로 이동하므로, 이후 모든 aggregate `Read`/`Edit`은 반드시 이 절대 경로를 사용.
2. aggregate가 없거나 `tasks[]`가 비어 있으면 중단:

   ```
   ❌ Loop 실행 불가: init된 태스크 큐가 없습니다.
   먼저 /jira-task init [count|ISSUE-KEY]로 작업 환경을 세팅하세요.
   ```

3. **deferred 초기화**: `tasks[]`에 `deferred` / `deferredKind` / `deferredReason`이 남아 있으면 **셋 다** 제거(`Edit`, JSON 유효성 유지) — 새 run은 보류 태스크를 재시도한다 (사유가 여전하면 다시 보류될 뿐).
4. **큐 계산**: `tasks[]` 중 `completedSteps`(없으면 빈 배열로 간주)에 `"merge"`가 없고 `status`가 Done/완료가 아닌 태스크. 배열 순서 유지 (init이 priority 순으로 기록).
5. 인자에 `--skip <단계,...>`가 있으면 보관해 두고 모든 auto 호출에 그대로 전달한다 (단계 검증은 auto가 수행). **단, `review`가 포함되어 있으면 목록에서 제거하고 경고**: review 완료가 merge 게이트 조건이므로 loop에서는 review 스킵 불가.

   ```
   ⚠ loop에서는 review를 스킵할 수 없습니다 (merge 게이트 조건) — review는 실행됩니다.
   ```

큐가 비어 있으면:

```
✅ 큐가 비어 있습니다 — 모든 태스크가 이미 merge 완료.
main에서 동작 확인 후 /jira-task done <TASK-ID>로 마무리하세요.
```

큐가 있으면 실행 계획을 보여주고 바로 시작:

```
🔁 Loop 모드: <N>개 태스크 처리 예정
큐: <TASK-ID-1> → <TASK-ID-2> → ...
태스크당: auto(start→review) → local merge(In Review) | done은 수동 (main 확인 후)
```

## Step 2: Per-Task Loop

큐의 각 태스크에 대해 순서대로 (한 번에 한 태스크, 병렬 금지 — merge 순서 의존성):

### 2-a. worktree로 이동 + auto 실행

**먼저 해당 태스크의 worktree로 이동한다** (`Bash`):

```bash
cd "<worktreePath>"
```

> ⛔ **main repo cwd에서 auto를 호출하지 마라.** auto가 띄우는 내부 스킬(start/approach/impl/test/review)과 phase-gate 훅은 모두 **cwd의 worktree-local `.jira-context.json`**을 기준으로 동작한다. main repo에서 부르면 start가 이미 존재하는 worktree를 재생성하려다 실패하거나, impl이 main repo 작업 트리를 수정하고, aggregate 최상위가 worktree-local 필드로 오염된다. 2-b(merge)까지 같은 worktree cwd에서 호출한다.

aggregate(절대 경로)를 다시 `Read`해 해당 태스크의 `completedSteps`에 `"review"`가 이미 있으면 auto를 건너뛰고 2-b로.

아니면: `Skill({ skill: "jira-integration:jira-task-auto", args: "<TASK-ID>[ --skip <단계,...>]" })`

완료 후 aggregate를 다시 `Read`해 `"review"`가 `completedSteps`에 들어왔는지 확인.
- 없으면 → auto가 중단된 것. **종류 판정**: worktree의 `docs/run-log/_index.jsonl` 마지막 줄(해당 taskId)의 `status`/`failedStage`/`reason`을 읽는다 (auto launcher Step 5.5가 기록). run-log가 없으면 auto가 출력한 중단 메시지의 status 키워드로 판정.

  | auto status | deferredKind |
  |---|---|
  | `scope_shortfall` | `scope-shortfall` |
  | `fix_exhausted` / `fix_unconverged` | `gate-exhausted` |
  | `aborted` (단계 실패) | `stage-failed` |

  → Step 4의 **시스템 실패 판정**을 먼저 거친다. 시스템 실패가 아니면 Step 2.5로 격리하고 다음 태스크로.

### 2-b. local merge

`Skill({ skill: "jira-integration:jira-local-merge", args: "<TASK-ID>" })`

완료 후 aggregate를 다시 `Read`해 `"merge"`가 `completedSteps`에 들어왔는지 확인. 없으면 → merge 실패. **base 브랜치 원상 복구가 필수**다 (더러워진 base는 이후 모든 태스크를 오염시킨다):

```bash
git -C "<REPO_ROOT>" merge --abort 2>/dev/null || true
git -C "<REPO_ROOT>" status --porcelain   # 비어 있어야 함 — 아니면 Step 4 시스템 실패(base 손상)
```

base가 깨끗하면 `deferredKind: "merge-failed"`로 Step 2.5 격리 후 다음 태스크로.

### 2.5. 격리 (quarantine)

aggregate의 해당 태스크 항목에 `Edit`으로 기록하고 이번 run의 큐에서 제외한다:

```json
"deferred": true,
"deferredKind": "<scope-shortfall | gate-exhausted | stage-failed | merge-failed | rebase-conflict>",
"deferredReason": "<한 줄 — auto/merge/git 출력 기반 실제 사유>"
```

- worktree의 작업 트리는 **건드리지 않는다** (사람이 볼 증거).
- Jira는 손대지 않는다 (상태 전이·코멘트 없음 — 격리는 로컬 워크플로 상태).
- 격리된 태스크는 2-c rebase 대상에서도 제외.
- 같은 run 안에서 재시도하지 않는다 (사유가 그대로면 무한 루프). 재시도 단위는 다음 run.

출력:

```
⛔ <TASK-ID> 격리 [<deferredKind>]: <사유 한 줄> — 다음 태스크로 계속합니다.
```

### 2-c. 잔여 worktree rebase

큐에서 아직 처리하지 않은 (deferred 아닌) 각 태스크에 대해:

```bash
git -C "<worktreePath>" rebase <baseBranch>
```

실패 시:

```bash
git -C "<worktreePath>" rebase --abort 2>/dev/null || true
```

(rebase가 시작조차 못 한 경우 — dirty worktree 등 — abort할 대상이 없으므로 에러는 무시한다.)

→ Step 2.5 격리 (`deferredKind: "rebase-conflict"`). 사유는 git 출력에서 판별해 정확히 기록한다 — 예: `"rebase conflict after <방금 merge한 TASK-ID>"` / `"dirty worktree — rebase 시작 불가"`.

> 아직 시작 전인 브랜치(커밋 없음)는 rebase가 fast-forward로 끝난다 — 항상 시도한다.

### 2-d. 진행 메시지

```
✅ <TASK-ID> merged (<i>/<N>) → 다음: <NEXT-TASK-ID>
```

## Step 3: 예외 리포트 (Completion Summary)

큐 소진 시, 먼저 `cd "<REPO_ROOT>"`로 복귀한 뒤 **사람의 결정 목록** 형태로 보고한다. 클린 통과 줄의 수치는 merge 스킬이 Jira 코멘트에 쓴 commit/file/line 카운트를 재사용:

```
─────────────────────────────────────────
🔁 Loop 완료 — 통과 <N> / 격리 <M> / 미착수 <K>
─────────────────────────────────────────
✅ 클린 통과 (In Review, 사람 확인만 필요):
   <TASK-ID>  +<add>/-<del>, <n> files — <merge 코멘트의 한 줄 요약>
⛔ 격리 — 결정 필요:
   <TASK-ID>  [<deferredKind>] <사유> — 권장: <kind별 한 줄>
─────────────────────────────────────────
격리 태스크는 사유 해결 후 /jira-task loop 재실행 시 자동 재시도됩니다.
클린 통과는 main에서 동작 확인 후 /jira-task done <TASK-ID>.
```

kind별 권장 한 줄 (고정 템플릿):

| deferredKind | 권장 |
|---|---|
| scope-shortfall | 부분 수용 `merge` 후 미구현분 별도 init, 또는 worktree에서 추가 구현 후 `review` 재실행 |
| gate-exhausted | `docs/review/<TASK-ID>.review.md` 확인 → worktree에서 수동 수정 → `test` → `review` |
| stage-failed | 실패 단계부터 직접 실행: `/jira-task <단계> <TASK-ID>` |
| merge-failed | worktree에서 base 충돌 해결 후 loop 재실행 |
| rebase-conflict | worktree에서 rebase 충돌 해결(또는 미커밋 정리) 후 loop 재실행 |

격리가 0건이면 "⛔ 격리" 블록을 생략한다.

### 3.5. run-log 기록 (관측용, non-blocking)

`script-lookup.md`로 `append-run-log.py`를 해석한 뒤, REPO_ROOT에서 Bash 1회:

```bash
printf '%s' '{"status":"loop-run","passed":[<통과 TASK-ID>],"quarantined":[{"taskId":"<ID>","deferredKind":"<kind>"}]}' \
  | python3 "$APPEND_RUN_LOG_PY" - - - "docs/run-log" --kind=loop-run
```

## Step 4: 시스템 실패 판정 + Abort Report

태스크-로컬로 위장한 시스템 문제(깨진 base, Jira 인증 만료, MCP 다운)는 격리-계속하면 큐 전체가 무의미하게 소진된다. 다음 중 하나면 **전체 중단**, 아니면 Step 2.5 격리:

1. **연속 동일-단계 실패 2건** — 서로 다른 태스크가 같은 `failedStage`(또는 같은 deferredKind가 `merge-failed`)로 연속 실패.
2. **인프라 시그니처** — auto/merge 실패 사유에 다음이 포함: HTTP 401/403·`Unauthorized`·`authentication`, MCP 연결 실패(`mcp`+`connect`/`not available`), base 브랜치 checkout/상태 복구 실패. 목록은 보수적으로 짧게 유지 — 과잉 매칭이 격리의 가치를 죽인다.

전체 중단 시 `cd "<REPO_ROOT>"`로 복귀한 뒤 보고:

```
❌ Loop 중단 (시스템 실패 의심): <판정 근거 — 연속 <단계> 실패 2건 | 인프라 시그니처 "<매칭 문자열>">

마지막 실패: <TASK-ID> — <사유>
처리 완료: <이번 run에서 merge까지 끝난 TASK-ID 목록 또는 "없음">
격리: <TASK-ID [kind] 목록 또는 "없음">
남은 큐: <미처리 TASK-ID 목록>

원인을 해결한 뒤 /jira-task loop를 재실행하세요 — 완료된 태스크는 건너뛰고 격리 태스크는 재시도됩니다.
```
