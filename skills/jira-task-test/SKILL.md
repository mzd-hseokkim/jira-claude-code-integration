---
name: jira-task-test
description: "Run tests for a Jira task (Playwright E2E, vitest/jest, custom) and post results to Jira. Triggers: jira-task test, run tests; 테스트 실행, E2E 테스트."
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

# jira-task-test: Run Tests & Report to Jira

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Prerequisites
- Implementation should be complete for the task
- Test framework should be installed in the project

## Workflow

### Context Optimization

이슈 정보가 필요하면 먼저 `.jira-context.json`의 `cachedIssue`를 확인한다 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 `python3 "<scripts>/jira-cli.py" get <TASK-ID>` 후 cache 갱신 (`skills/_shared/jira-cli.md`).

### Step 1: Detect Test Environment & Level

**Level 판정**: `.jira-context.json.breakdownLevel` → 없으면 `cachedIssue.issuetype` 폴백 (approach Step 0 동일 규칙: Subtask/Task/Bug→L1, Story→L2, Epic→L3, 그 외→L1). 판정 결과를 이후 단계에서 사용.

| Level | 동작 |
|-------|------|
| L1 | 경량 검증 — 핵심 동작만 확인, report 인라인/파일 생략 허용 |
| L2 | 현행 유지 — 전체 test suite 실행 + report 파일 생성 |
| L3 | child Story별 책임 — 본 스킬이 L3 Epic에서 호출되면 "child Story 단위로 실행할 것" 안내 후 조기 종료 |

Scan the project to determine the test setup:

```bash
# Check for test frameworks
ls package.json 2>/dev/null       # Node.js project
ls playwright.config.* 2>/dev/null # Playwright
ls vitest.config.* 2>/dev/null     # Vitest
ls jest.config.* 2>/dev/null       # Jest
ls pytest.ini 2>/dev/null          # Python pytest
ls pyproject.toml 2>/dev/null      # Python pyproject
```

Also check `package.json` for test scripts:
```bash
cat package.json | grep -A5 '"scripts"'
```

Determine available test types:
- **E2E (Playwright)**: If `playwright.config.*` exists
- **Unit (Vitest/Jest)**: If `vitest.config.*` or `jest.config.*` exists
- **Custom**: If `package.json` has a `test` script

### Step 1.5: Author Tests (impl 단계에서 분리됨)

테스트 코드 작성은 본 스킬의 책임이다. impl 단계는 프로덕션 코드만 다루고 테스트 코드는 작성하지 않는다.

**기존 테스트 확인:**

이 태스크와 관련된 테스트가 이미 있는지 Glob/Grep으로 확인:
- 테스트 파일에서 TASK-ID 또는 기능 키워드 검색
- `tests/`, `e2e/`, `__tests__/`, `*.test.*`, `*.spec.*` 패턴 탐색

**테스트 작성 절차 (기본 동작):**

1. Design 문서의 Test Plan 섹션을 1차 명세로 사용 (Unit + E2E 케이스 + AC 매핑)
2. Design 문서가 없거나 Test Plan이 비면 Jira 이슈의 Acceptance Criteria를 사용
3. 누락된 케이스만 신규 작성 (이미 있는 테스트는 보존)
4. 프레임워크/위치는 프로젝트 컨벤션을 따름 (vitest/jest/pytest, `__tests__/` 또는 `*.test.*` 등)

```typescript
import { test, expect } from '@playwright/test';

test.describe('<Feature Name> - <TASK-ID>', () => {
  test('should <acceptance criterion 1>', async ({ page }) => {
    // Test implementation
  });
});
```

**스킵 조건 (예외):**
- 테스트 프레임워크가 프로젝트에 전혀 없음 → 작성 스킵하고 Step 2 폴백 처리
- 사용자가 명시적으로 "테스트 생성하지 마"라고 지시한 경우

### Step 2: Run Tests

Execute tests in order of speed (unit first, then E2E):

#### Unit Tests
```bash
# Vitest
npx vitest run --reporter=verbose 2>&1

# Jest
npx jest --verbose 2>&1

# pytest
python -m pytest -v 2>&1
```

#### Playwright E2E Tests
```bash
# Install browsers if needed
npx playwright install --with-deps 2>&1

# Run all E2E tests
npx playwright test --reporter=list 2>&1

# Or run specific tests related to the task (search by TASK-ID or feature name)
npx playwright test --grep "<feature-keyword>" --reporter=list 2>&1
```

#### Custom Test Command
```bash
npm test 2>&1
```

Capture ALL output (stdout + stderr) for the report.

### Step 3: Analyze Results

Parse the test output to extract:
- **Total tests**: Count of all tests run
- **Passed**: Count of passing tests
- **Failed**: Count of failing tests (with details)
- **Skipped**: Count of skipped tests
- **Duration**: Total execution time

For failed tests, capture:
- Test name
- Error message
- Stack trace (truncated if very long)
- Screenshot path (Playwright auto-captures on failure)

### Step 4: Generate Test Report

#### L1 — 경량 산출물

파일 생성 없이 Jira 코멘트 인라인에 결과 요약 포함 가능. 핵심 동작 확인 결과(통과/실패/케이스 수)만 기록. `docs/test/` 파일 생성은 선택 사항이며, 생략해도 워크플로를 계속 진행한다.

#### L2 — 전체 리포트 (현행)

Create a test report at `docs/test/<TASK-ID>.test-report.md`.

산출물 작성 전 반드시 Read tool로 `templates/test-report.template.md`를 읽고 contract(필수/옵셔널 분류, 옵셔널 마커 규약)를 따른다.

### Step 5: Post Results to Jira

`python3 "<scripts>/jira-cli.py" comment <TASK-ID> @<scratchpad md 파일>`로 요약을 게시한다 (`skills/_shared/jira-cli.md`) — 본문:

```
## Test Results: <TASK-ID>

**결과**: PASS / FAIL
**날짜**: <날짜>

| 유형 | 전체 | 통과 | 실패 |
|------|-------|--------|--------|
| Unit | <n> | <n> | <n> |
| E2E (Playwright) | <n> | <n> | <n> |

### Duration
- Unit: <시간>
- E2E: <시간>

### Failed Tests
<실패한 테스트 이름 및 간단한 오류, 없으면 "없음">

전체 리포트: docs/test/<TASK-ID>.test-report.md
```

테스트 리포트와 실패 스크린샷을 공용 스크립트로 첨부 업로드. 스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
SCRIPT_NAME="jira-attach.sh" OUT_VAR="JIRA_ATTACH_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here

# 리포트
[ -n "$JIRA_ATTACH_SH" ] && bash "$JIRA_ATTACH_SH" <TASK-ID> docs/test/<TASK-ID>.test-report.md

# Playwright 실패 스크린샷 (있을 때만)
shots=$(find test-results/ playwright-report/ -name "*.png" -type f 2>/dev/null)
[ -n "$JIRA_ATTACH_SH" ] && [ -n "$shots" ] && bash "$JIRA_ATTACH_SH" <TASK-ID> $shots
```

각 호출의 출력은 `HTTP <code>: <file>` 형식. 200이 아니면 업로드 실패 — 로컬 경로를 안내하고 계속 진행한다.

### Step 6: Completion Summary

테스트 통과 시에만 `skills/_shared/context-update.md` 패턴으로 worktree-local + aggregate `.jira-context.json`을 갱신 (test는 Jira transition 없음 → `STATUS="-"`). 실패 시 호출하지 않는다:

```bash
SCRIPT_NAME="jira-context-update.py" OUT_VAR="JIRA_CTX_UPDATE_PY"
# Read skills/_shared/script-lookup.md and execute its lookup block here
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> test "-" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

테스트 결과에 따라 분기하여 완료 요약 출력:

**테스트 통과 시:**
```
---
✅ **Test Complete** — <TASK-ID>

- 전체: <N>개, 통과: <N>개, 실패: 0개
- 테스트 리포트: `docs/test/<TASK-ID>.test-report.md`
- Jira 코멘트 게시됨
- Jira 첨부파일: 리포트 + 스크린샷 <N>개 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → approach → impl → **test ✓** → review → merge → pr → done

**Next**: `/jira-task review <TASK-ID>` — 코드 리뷰를 실행합니다
---
```

**테스트 실패 시:**
```
---
⚠️ **Test Failed** — <TASK-ID>

- 전체: <N>개, 통과: <N>개, 실패: <N>개
- 실패 목록:
  - <test name>: <error summary>
- 테스트 리포트: `docs/test/<TASK-ID>.test-report.md`

**Progress**: init → start → approach → impl → **test ✗** → review → merge → pr → done

**Next**: 실패 항목 수정 후 `/jira-task test <TASK-ID>` 재실행
---
```

