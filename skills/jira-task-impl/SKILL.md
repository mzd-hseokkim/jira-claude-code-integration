---
name: jira-task-impl
description: "Implementer session: make the committed tests pass following the approved plan, record plan deviations, move lasting knowledge to shared docs, and update the draft PR. Triggers: jira-task impl, implement task; 구현 시작, 코딩 시작."
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

# jira-task-impl: 구현

**공용 규약**: `skills/_shared/conventions.md`를 먼저 Read한다 — 언어, TASK-ID 감지, harness 차이 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

구현 세션(역할 `implementer`)이 test-write가 커밋한 테스트를 통과시키는 운영 코드를 쓴다. 테스트 파일은 고칠 수 없다(`guard-test-files.js`, TA-COM-AGT-005).

## Workflow

### Step 0: 진입 조건과 역할 표시

1. context `completedSteps`에 `test-write`가 없으면 멈추고 `/jira-task test-write <TASK-ID>`를 안내한다.
2. L2·L3는 context `planApproval`이 있어야 한다. 없으면 멈춘다(승인 확인은 test-write가 한다).
3. 역할 표시 (`JIRA_CTX_UPDATE_PY`는 prompt에 경로가 없을 때만 `skills/_shared/script-lookup.md`로 찾는다):
   ```bash
   python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> - - "<worktree>/.jira-context.json" --patch '{"activeRole":"implementer"}'
   ```

### Step 1: 입력

- **L2·L3**: `work/<TASK-ID>/plan.md`의 작업 순서·바뀌는 파일·위험, `spec.md`의 수용 조건. 이슈 본문은 `cachedIssue`로 충분하다(없을 때만 `jira-cli.py get`).
- **L1**: 이슈 description·AC. 읽는 파일은 바꿀 대상과 그 정본 1개까지로 한다 — 유사 파일 탐색·메타 확인은 하지 않는다.
- context `testWrite.tests`(test-write가 쓴 테스트 파일)와 `testWriteSkipped`.

### Step 2: 구현

- 작업 순서를 따른다. 기존 코드 컨벤션과 패턴을 따른다.
- 진행 중 확인은 타입체크·컴파일과 **이 작업의 테스트만** 실행한다. 전체 스위트는 verify가 돈다.
- 요구사항을 일반적으로 구현한다. 특정 테스트 값만 통과하도록 분기하거나 결과를 하드코딩하지 않는다.
- **금지**:
  - 테스트 파일 수정·삭제·skip (hook이 막는다). 테스트가 틀렸거나 과제가 불가능하다고 판단되면 멈추고, 어느 테스트가 왜 틀렸는지 보고한다 — test-write로 되돌릴지는 사용자가 정한다.
  - 억제 주석(`eslint-disable`, `@SuppressWarnings`, `# noqa`, `# type: ignore`, `NOSONAR` 등)과 분석 제외 설정 추가(CQ-COM-AGT-001). 꼭 필요하면 멈추고 사유를 보고한다.
- **계획과 달라지면**(L2·L3) 같은 PR에서 `plan.md`의 "결정 기록"에 날짜·바뀐 내용·이유를 항목당 3줄 이내로 적는다(SD-COM-ART-007). 조사 경위와 측정 기록은 `evidence/`에 두고 링크한다. 수용 조건을 바꿔야 하면 구현을 멈추고 알린다 — spec 재승인 대상이다(SD-COM-GAT-006).
- 위험 신호를 새로 발견했거나 L1이 한 문장으로 설명되지 않게 되면 멈추고 등급 재확정을 요청한다(`skills/_shared/sdlc-level.md` "등급을 바꿀 때").

### Step 3: 커밋

바꾼 파일만 명시적으로 add한다(`git add -A` 금지). 커밋은 의미 단위로 나눠도 된다.

```bash
git add <운영 코드 파일...> [work/<TASK-ID>/plan.md]
git commit -m "feat(<TASK-ID>): <요약>"       # 버그 수정은 fix(<TASK-ID>)
```

### Step 4: 지속 지식 옮기기 (마지막 작업)

이 작업에서 정해진 것 중 계속 유지할 내용을 공통 문서로 옮긴다(SD-COM-ART-008). L2·L3는 plan 작업 순서의 마지막 항목을 따른다. L1은 해당하는 것이 있을 때만.

| 내용 | 위치 |
|---|---|
| 업무 정책 | `docs/policies/` (제품 책임자 승인 필요 — PR 본문에 표시) |
| 새 용어 | `docs/glossary.md` (제품 책임자 승인 필요) |
| 상태·불변식 | `docs/domain/` |
| 구조 변화 | `docs/architecture/` |
| 설계 결정 | `docs/decisions/` (ADR) |

옮긴 것이 있으면 `git add <문서...>` → `git commit -m "docs(<TASK-ID>): 지속 지식 옮기기"`. 없으면 "없음"으로 기록한다. 프로젝트에 해당 폴더가 없으면 만들지 말고 PR 본문에 "옮길 문서 없음(폴더 미도입)"으로 남긴다.

### Step 5: Self-Check (1회)

1. **계획 대조**: plan 작업 순서(L1은 이슈 AC)를 실제 변경과 하나씩 대조한다. 빠진 항목은 마저 구현하고, 의도적으로 뺀 항목은 사유를 plan 결정 기록(L1은 Jira 코멘트)에 적는다.
2. **이 작업의 테스트 통과**: test-write의 테스트를 한 번 더 돌린다. 실패가 남으면 완료로 처리하지 않는다.
3. **Lint 1회**: `bash <scripts>/detect-lint.sh` 1회 호출(`LINT <name> <cmd>` / `FORMAT <name> <cmd>` / `NONE`). 출력 명령을 변경 파일 전체에 한 번에 실행하고, 오류는 고친 뒤 1회만 재실행한다. `NONE`이면 `"lint":{"tool":"none"}`으로 기록한다. 구현 중에는 lint를 돌리지 않는다. verify는 이 기록을 인용하지 않고 검사 명령을 따로 실행한다.

### Step 6: push와 PR

`Read skills/_shared/pr-body.md` 후:
- **L1**: push 후 draft PR을 연다. "변경 내용"에 무엇을 왜 바꿨는지 3~5줄, `testWriteSkipped`가 있으면 "검증"에 그 사유.
- **L2·L3**: push 후 본문의 "계획과 달라진 점"(plan 결정 기록 요약), "테스트 기대값 변경"(context `testExpectationChanges`), "공통 문서에 옮긴 내용"을 갱신한다.

### Step 7: Jira와 context

```markdown
## Implementation Complete
- 커밋: <SHA...> (feat/fix), <SHA> (docs, 지식 옮기기 — 없으면 "없음")
- PR: <URL> (draft)
- 계획과 달라진 점: 없음 | <요약>
- 이 작업의 테스트: <n>/<n> 통과
```

```bash
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> impl "-" \
    "<worktree>/.jira-context.json" "<repoRoot>/.jira-context.json" \
    --patch '{"activeRole":null,"implSelfCheck":{"planMatched":"<n>/<m>","tests":"<통과>/<전체>","lint":{"tool":"<도구명|none>","files":<N>,"errors":<N>,"warnings":<N>}},"knowledgeTransfer":"<옮긴 문서 목록 | 없음>"}'
```
출력의 `completedSteps=[...]`가 갱신 결과다 — 파일을 다시 Read하지 않는다.

```
---
✅ **Implementation Complete** — <TASK-ID>

- 커밋: <목록>
- 이 작업의 테스트: <n>/<n> 통과 / lint <errors> errors (<도구명> | 스킵 사유)
- 지속 지식: <옮긴 문서 | 없음>
- PR: #<번호> <URL> (draft)

**Progress**: init → start → approach(L2·L3) → test-write → **impl ✓** → verify → pr → done

**Next**: `/jira-task verify <TASK-ID>` — 새 세션에서 수용 조건별로 검증합니다
---
```
