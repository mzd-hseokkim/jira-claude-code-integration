---
name: jira-task-test-write
description: "Test-writer session: confirm plan approval (L2/L3), write tests per acceptance criterion, check they fail for the right reason, and commit them before implementation. Triggers: jira-task test-write, write tests first; 테스트 먼저, 실패 테스트 작성."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# jira-task-test-write: 실패 테스트 먼저 커밋

**공용 규약**: `skills/_shared/conventions.md`를 먼저 Read한다 — 언어, TASK-ID 감지, harness 차이 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

테스트 작성 세션(역할 `test-writer`)이 수용 조건마다 테스트를 쓰고, 구현 전 코드에서 **올바른 이유로 실패**하는지 확인한 뒤 테스트만 따로 커밋한다(TA-COM-AGT-001·002). 구현 세션은 이 테스트를 고칠 수 없다(`guard-test-files.js`).

**비목표**: 운영 코드 수정, 전체 스위트 실행(verify), 승인 판단.

## Workflow

### Step 0: 진입 조건과 역할 표시

1. context `level`이 없으면 멈추고 `/jira-task start <TASK-ID>`를 안내한다.
2. **L2·L3 — 승인 확인** (스크립트 판정만 믿는다):
   ```bash
   python3 "<scripts>/sdlc-gate.py" check <TASK-ID> plan
   ```
   - exit 1: 멈춘다. 출력의 `rejected`(사유)·`allowed`(승인자)·`howto`를 그대로 보여 준다. 운영 코드도 테스트도 쓰지 않는다(SD-COM-GAT-004).
   - exit 2: 오류 메시지를 보여 주고 멈춘다. 통과로 처리하지 않는다.
   - exit 0: 출력의 `approver`·`sha`·`url`을 context `planApproval`로 기록하고(Step 5 patch), Jira에 1회 남긴다:
     ```markdown
     ## Plan Approved
     - 승인자: @<approver> / 대상 커밋: <sha> / 기록: <url>
     ```
     `warnings`가 있으면 코멘트에 함께 적는다. PR 본문의 "산출물 승인 기록"도 갱신한다(`skills/_shared/pr-body.md`).
   - context에 `planApproval`이 이미 있으면 재실행이므로 다시 확인하지 않는다.
3. 역할 표시 (`JIRA_CTX_UPDATE_PY`는 prompt에 경로가 없을 때만 `skills/_shared/script-lookup.md`로 찾는다):
   ```bash
   python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> - - "<worktree>/.jira-context.json" --patch '{"activeRole":"test-writer"}'
   ```

### Step 1: 테스트 대상 정리

- **L2·L3**: `work/<TASK-ID>/spec.md`의 수용 조건과 `plan.md`의 "검증 방법" 표. 표에 테스트 이름·위치가 있으면 따른다.
- **L1**: 이슈 description·AC와 사용자 지시. 바뀌는 동작을 한 문장으로 적어 둔다.
- **L1 생략 조건**: 동작이 바뀌지 않는 변경(오타, 로그 문구, 주석, 이름 바꾸기)이면 테스트를 쓰지 않는다. 사유 1줄을 context `testWriteSkipped`로 남기고 Step 5로 간다. 사유는 impl이 PR 본문 "검증"에 옮긴다.
- 기존 테스트를 Glob/Grep으로 확인한다(이슈 키, 기능 키워드, `*.test.*`·`*.spec.*`·`tests/`·`__tests__/`). 이미 있는 테스트는 보존하고 빠진 AC만 쓴다.
- 테스트 도구가 프로젝트에 없으면 멈추고 알린다. 도구 도입은 이 작업의 범위가 아니다 — 사용자가 정한다.

### Step 2: 테스트 쓰기

- 프로젝트의 테스트 표준을 따른다(`skills/_shared/conventions.md` "프로젝트 표준" — 테스트 파일이 들어갈 폴더의 `AGENTS.md`가 가리키는 테스트 지침 포함). 표준이 없으면 같은 폴더의 기존 테스트에서 프레임워크·위치·이름 규칙을 따른다. 테스트 이름이나 설명에 AC 번호를 넣는다(예: `AC-02 PAID 주문은 관리자만 취소한다`).
- 버그 수정은 두 종류를 쓴다: 지금 코드에서 실패하는 재현 테스트(기대 동작), 지금도 통과해야 하는 회귀 방지 테스트("바뀌면 안 되는 동작").
- E2E가 계획에 있으면 Playwright 등 프로젝트 도구로 쓴다.
- **운영 코드는 고치지 않는다.** 테스트가 컴파일되도록 운영 코드에 빈 껍데기를 만드는 것도 구현 세션 몫이다.
- 기존 테스트의 기대값을 바꿔야 하면 값마다 근거를 남긴다 — context `testExpectationChanges: [{test, before, after, reason}]`(TA-COM-AGT-003). 근거가 spec·정책에 없으면 바꾸지 말고 멈춰서 묻는다.

### Step 3: 실패 확인

새로 쓴 테스트만 골라 실행한다(전체 스위트는 verify가 돈다).

| 결과 | 판단 |
|---|---|
| 단언(assertion)이 기대값과 달라 실패 | 올바른 실패 |
| 아직 없는 함수·모듈 때문에 실패 | 올바른 실패로 본다. 단 오타·잘못된 import 경로면 테스트를 고친다 |
| 문법 오류, 픽스처·환경 문제 | 테스트를 고친다 |
| 재현 테스트가 지금 통과 | 테스트가 틀렸거나 이미 구현됨. 원인을 확인하고, 이미 충족이면 그 AC를 보고에 적는다 |
| 회귀 방지 테스트가 실패 | 테스트를 고친다(지금 동작을 지키는 테스트여야 한다) |

결과를 AC별로 정리한다: `AC-01 실패(올바른 이유) / AC-03 회귀 방지 통과 / …`.

### Step 3.5: Lint (커밋 전 필수)

구현 세션은 테스트 파일을 고칠 수 없으므로, 여기서 lint 오류를 남기면 impl·verify가 막힌다. 테스트 쓰기와 실패 확인이 끝난 뒤 커밋 전에 한 번 돌린다.

1. 명령은 `skills/_shared/conventions.md` "Lint"로 정하고 lint와 format을 새로 쓰거나 고친 테스트 파일에만 실행한다. 타입체크는 돌리지 않는다(아직 없는 모듈 때문에 실패하는 것이 정상이다).
2. 오류와 경고는 테스트 파일에서 고친다. 억제 주석은 프로젝트 규칙이 허용할 때만 그 규칙대로 쓴다.
3. 아직 없는 함수·모듈 때문에만 생기는 오류(해석되지 않는 import, 그 때문에 `any`로 추론되어 생기는 type-aware 규칙 위반)는 고치지 않고 건수를 기록한다. impl이 구현하면 사라져야 한다.
4. 고쳤으면 lint를 1회 다시 돌리고, Step 3의 테스트도 1회 다시 돌려 판정이 그대로인지 확인한다.
5. 그래도 남은 오류가 3번에 해당하지 않으면 커밋하지 말고 멈춰서 보고한다.

### Step 4: 커밋과 push

테스트 파일만 명시적으로 add한다.

```bash
git add <테스트 파일...>
git commit -m "test(<TASK-ID>): AC-01…AC-0n 테스트 (실패 <n>, 회귀 방지 <m>)"
```

L2·L3는 PR이 이미 있으므로 `git push`한다. L1은 push하지 않는다(impl 끝에서 push하고 PR을 연다).

### Step 5: Jira와 context

Jira 코멘트(생략이면 사유만):
```markdown
## Tests Written
- 커밋: <SHA> (test)
- AC별: AC-01 실패(올바른 이유), AC-02 실패, AC-03 회귀 방지 통과
- 기대값 변경: 없음 | <n>건 (PR 본문에 근거)
- Lint: <도구> 오류 <n>건(구현 전 모듈 때문 <m>건) | 선언된 도구 없음
```

```bash
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> test-write "-" \
    "<worktree>/.jira-context.json" "<repoRoot>/.jira-context.json" \
    --patch '{"activeRole":null,"planApproval":{"approver":"<login>","sha":"<sha>","url":"<url>"},"testWrite":{"commit":"<SHA>","tests":["<파일>"],"failing":<n>,"guards":<m>,"lint":{"tool":"<도구명|none>","errors":<N>,"pendingImpl":<N>}}}'
```
`failing`은 올바른 이유로 실패한 테스트 수, `guards`는 지금도 통과해야 하는 회귀 방지 테스트 수, `lint.errors`는 Step 3.5 뒤 남은 오류 수, `lint.pendingImpl`은 그중 아직 없는 모듈 때문인 수. `planApproval`은 이번에 확인했을 때만(L1·재실행은 키를 빼고), `testWriteSkipped`·`testExpectationChanges`는 해당할 때만 넣는다.

```
---
✅ **Tests Written** — <TASK-ID>

- 테스트 커밋: <SHA> — 실패 <n>건(올바른 이유), 회귀 방지 <n>건
- Lint: <도구> 남은 오류 <n>건(구현 전 모듈 때문 <m>건) | 선언된 도구 없음
- (L2·L3) 승인: @<approver> <sha>

**Progress**: init → start → approach(L2·L3) → **test-write ✓** → impl → verify → pr → done

**Next**: `/jira-task impl <TASK-ID>` — 새 세션에서 구현합니다(구현 세션은 테스트를 고칠 수 없습니다)
---
```
