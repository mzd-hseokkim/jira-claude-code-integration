---
name: jira-task-test
description: Run tests for a Jira task and report results to Jira. Supports Playwright E2E tests, unit tests (vitest/jest), and custom test commands. Generates test reports and posts summaries to Jira. Use when user says "test task", "run tests", "jira-task test", "playwright", "테스트 실행", "E2E 테스트", or wants to verify implementation with tests.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - mcp__jira__jira_get_issue
  - mcp__jira__jira_add_comment
  - mcp__jira__jira_upload_attachment
---

# jira-task-test: Run Tests & Report to Jira

## Prerequisites
- Implementation should be complete for the task
- Test framework should be installed in the project

## Workflow

### Step 1: Detect Test Environment

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

### Step 1.5: Check for Existing Tests

이 태스크와 관련된 테스트가 이미 있는지 Glob/Grep으로 확인:
- 테스트 파일에서 TASK-ID 또는 기능 키워드 검색
- `tests/`, `e2e/`, `__tests__/`, `*.test.*`, `*.spec.*` 패턴 탐색

**관련 테스트가 없으면**: 사용자에게 테스트 생성을 먼저 제안:
1. Design 문서의 Test Plan 섹션 참조
2. Jira 이슈의 Acceptance Criteria 참조
3. Playwright 또는 unit 테스트 파일 생성 (아래 구조 참고)

```typescript
import { test, expect } from '@playwright/test';

test.describe('<Feature Name> - <TASK-ID>', () => {
  test('should <acceptance criterion 1>', async ({ page }) => {
    // Test implementation
  });
});
```

사용자가 테스트 생성을 원하면 생성 후 Step 2로 진행. 원치 않으면 바로 Step 2로.

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

Create a test report at `docs/test/<TASK-ID>.test-report.md`:

```markdown
# Test Report: <TASK-ID>

**Date**: <date>
**Branch**: feature/<TASK-ID>

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | <count> |
| Passed | <count> |
| Failed | <count> |
| Skipped | <count> |
| Duration | <time> |
| Result | PASS / FAIL |

## Unit Tests
<results>

## E2E Tests (Playwright)
<results>

## Failed Tests Detail
### <test name>
- **Error**: <error message>
- **File**: <test file:line>
- **Stack**: <truncated stack trace>

## Screenshots
<list of failure screenshots if Playwright>
```

### Step 5: Post Results to Jira

Use `mcp__jira__jira_add_comment` to post the test summary:

```
## Test Results: <TASK-ID>

**Result**: PASS / FAIL
**Date**: <date>

| Type | Total | Passed | Failed |
|------|-------|--------|--------|
| Unit | <n> | <n> | <n> |
| E2E (Playwright) | <n> | <n> | <n> |

### Duration
- Unit: <time>
- E2E: <time>

### Failed Tests
<list of failed test names and brief error, or "None">

See full report: docs/test/<TASK-ID>.test-report.md
```

If Playwright generated failure screenshots, upload them to Jira:

1. 스크린샷 파일 탐색:
   ```bash
   find test-results/ playwright-report/ -name "*.png" -type f 2>/dev/null
   ```
2. 각 스크린샷을 base64로 인코딩:
   ```bash
   base64 < <screenshot-path>
   ```
3. `mcp__jira__jira_upload_attachment`로 업로드:
   - `issueKey`: TASK-ID
   - `filename`: 스크린샷 파일명
   - `base64Content`: base64 인코딩 결과
4. 업로드 실패 시: "스크린샷은 로컬 `test-results/` 디렉토리에서 확인 가능" 안내로 폴백

### Step 6: Completion Summary

테스트 통과 시 `.jira-context.json`의 `completedSteps`에 `"test"` 추가 (실패 시 추가하지 않음).
테스트 결과에 따라 분기하여 완료 요약 출력:

**테스트 통과 시:**
```
---
✅ **Test Complete** — <TASK-ID>

- 전체: <N>개, 통과: <N>개, 실패: 0개
- 테스트 리포트: `docs/test/<TASK-ID>.test-report.md`
- Jira 코멘트 게시됨

**Progress**: init → start → plan → design → impl → **test ✓** → review → pr → done

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

**Progress**: init → start → plan → design → impl → **test ✗** → review → pr → done

**Next**: 실패 항목 수정 후 `/jira-task test <TASK-ID>` 재실행
---
```

