---
name: jira-task-impl
description: "Implement a Jira task based on the approach document and post progress to Jira. Triggers: jira-task impl, implement task; 구현 시작, 코딩 시작."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_add_comment
---

# jira-task-impl: Implement a Jira Task

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Prerequisites
- Approach document should exist at `docs/approach/<TASK-ID>.approach.md` (warn if missing)
- Feature branch `feature/<TASK-ID>` should already exist (suggest `/jira-task start` if not)

## Workflow

### Step 1: Load Context

1. Read `.jira-context.json` for active task info
2. **Cache-first**: `.jira-context.json`의 `cachedIssue`를 먼저 확인 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 `mcp__atlassian__jira_get_issue` 호출 (`fields="summary,status,description,issuetype"`, `comment_limit=0` — 구현은 approach 문서가 1차 소스이므로 이슈 본문은 최소만) 후 cache 갱신.
3. Read `docs/approach/<TASK-ID>.approach.md` if it exists
4. **Level 판정**: `.jira-context.json.breakdownLevel` → 없으면 `cachedIssue.issuetype` 폴백 (approach Step 0 동일 규칙: Subtask/Task/Bug→L1, Story→L2, Epic→L3, 그 외→L1). 판정 결과를 이후 단계에서 사용.

### Step 2: Implement Based on Approach Document

Step 1에서 판정한 레벨에 따라 분기:

#### L1 (Subtask/Task/Bug 등 단일 변경)

approach 문서의 5줄 요약을 입력으로 사용. 추가 설계 문서 없이 직접 구현. 산출물 최소화 — Jira 코멘트는 인라인 요약으로 대체 가능, 별도 문서 생성 불필요.

**L1 탐색 상한**: 읽는 파일은 approach의 "변경 영역"에 명시된 대상 파일 + 정본(요구사항이 가리키는 소스) 1개까지. 유사 문서 스타일 참조, `find`/`grep -r`로 관련 테스트·문서 찾기, 버전·메타 확인용 `cat`은 하지 않는다 — 호출 1회 ≈ 10초이고 L1은 탐색으로 얻을 정보가 없다.

#### L2 (Story — 현행)

`docs/approach/<TASK-ID>.approach.md`의 Implementation Plan 순서를 따름.

#### L3 (Epic)

child Story가 구현 책임을 가지므로 본 단계의 입력으로 쓰지 않는다. L3 Epic에서 이 스킬이 호출되면 "child Story 단위로 실행할 것"을 안내하고 조기 종료.

---

구현 원칙:
1. 위 레벨별 분기 순서를 따름
2. 기존 코드 컨벤션과 패턴을 준수
3. Approach 문서의 Risks/Key Decisions 반영
4. 각 단계 완료 시 **타입체크/컴파일 등 syntactic 검증만** 수행 (테스트 실행 금지)

Approach 문서가 없으면, Jira 이슈 설명과 Acceptance Criteria 기반으로 구현.

**테스트 작업 금지 (강제):**
- 본 단계에서 **테스트 코드 작성 금지** — unit/integration/E2E 모두 해당
- 테스트 실행 금지 (`npm test`, `pytest`, `python -m unittest`, `node --test`, `playwright test` 등 전부). 이슈의 완료 조건에 "테스트 통과"가 있어도 **여기서 확인하지 않는다** — 그 확인은 test 단계의 것이고, impl에서 돌리면 같은 스위트를 두 번 돌리는 비용이다
- 테스트 파일(`*.test.*`, `*.spec.*`, `__tests__/`, `tests/` 하위 등) 신규 생성/수정 금지
- 테스트 코드 작성과 실행은 모두 `/jira-task test` 단계의 책임이다
- 단, 구현 대상 파일 자체가 우연히 테스트 코드인 경우(예: 테스트 유틸리티 자체를 구현하는 task)는 approach 문서 Implementation Plan에 명시된 한에서만 허용

### Step 2.5: Self-Check (종료 직전, 필수)

구현을 마쳤다고 판단한 시점에 1회 수행한다. 목적은 review 1회차 통과율 향상 — review를 대체하지 않는다.

1. **Plan 대조**: approach 문서의 Implementation Plan 항목(L1은 5줄 요약)을 실제 변경과 하나씩 대조한다. 미구현 항목은 지금 마저 구현하고, 의도적으로 제외한 항목은 사유를 Step 3 코멘트와 완료 요약에 명시한다.
2. **Lint 배치 1회**: 도구 판정은 `bash <scripts>/detect-lint.sh` **1회 호출**로 끝낸다 (출력: `LINT <name> <cmd>` / `FORMAT <name> <cmd>` / `NONE` — 판정 규칙은 review와 동일하게 스크립트에 박혀 있다. `package.json`·`node_modules`를 직접 cat/ls/grep 하지 마라). 출력된 명령에 변경 파일 전체를 인자로 **한 번에** 실행. 오류는 즉시 수정 후 1회만 재실행. `NONE`이면 스킵하고 사유를 기록.
   - **lint는 이 시점 단 1회다.** 구현 중에는 돌리지 않는다 (구현 중 검증은 Step 2의 타입체크/컴파일). review 단계도 이 기록을 인용하고 재실행하지 않는다.
3. **결과 기록**: Step 4의 context 갱신 호출에 `--patch`로 **함께** 넘긴다 (별도 Edit·`date` 호출 금지 — `ranAt`은 스크립트가 채우고, worktree-local 파일에만 적용되며 aggregate에는 들어가지 않는다):

   ```json
   "implSelfCheck": {
     "planMatched": "<구현 항목 수>/<전체 항목 수>",
     "lint": { "tool": "<도구명 | none>", "files": <N>, "errors": <N>, "warnings": <N> }
   }
   ```

### Step 3: Post Progress to Jira

구현 완료 후 `mcp__atlassian__jira_add_comment`:

```
## Implementation Complete

**브랜치**: feature/<TASK-ID>

### Changes Made
- 생성: <신규 파일 목록>
- 수정: <변경 파일 목록>

### Implementation Notes
- <구현 중 주요 결정 사항>
- <설계와의 차이점>

### Next Steps
- 테스트 작성/실행: `/jira-task test <TASK-ID>`
- 코드 리뷰: `/jira-task review <TASK-ID>`
```

### Step 4: Completion Summary

`skills/_shared/context-update.md` 패턴으로 worktree-local + aggregate `.jira-context.json`을 갱신 (impl은 Jira transition 없음 → `STATUS="-"`). Step 2.5의 self-check 결과를 `--patch`로 같이 넘겨 **Bash 1회**로 끝낸다. 호출 prompt가 스크립트 절대 경로를 이미 줬으면 lookup을 생략한다:

```bash
SCRIPT_NAME="jira-context-update.py" OUT_VAR="JIRA_CTX_UPDATE_PY"
# (prompt에 scripts 경로가 없을 때만) Read skills/_shared/script-lookup.md and execute its lookup block here
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> impl "-" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json" \
    --patch '{"implSelfCheck":{"planMatched":"<n>/<m>","lint":{"tool":"<도구명|none>","files":<N>,"errors":<N>,"warnings":<N>}}}'
```

출력의 `completedSteps=[...]`가 갱신 결과다 — 확인을 위해 파일을 다시 Read하지 않는다.

이후 아래 형식으로 완료 요약 출력:

```
---
✅ **Implementation Complete** — <TASK-ID>

- 생성된 파일: <list>
- 수정된 파일: <list>
- Self-check: Plan <n>/<m> 매칭, lint <errors> errors / <warnings> warnings (<도구명> | 스킵 사유)
- Jira 코멘트 게시됨

**Progress**: init → start → approach → **impl ✓** → test → review → merge → pr → done

**Next**: `/jira-task test <TASK-ID>` — 테스트 코드를 작성하고 실행합니다
---
```

테스트 프레임워크가 없는 프로젝트면 `/jira-task review <TASK-ID>`를 대신 추천.
