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
  - mcp__jira__get-issue
  - mcp__jira__add-comment
  - mcp__jira__upload-attachment
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

Use `mcp__jira__add-comment` to post the test summary:

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

If Playwright generated failure screenshots, try to upload them:
```
Use mcp__jira__upload-attachment with base64-encoded screenshot
```

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

### Step 7: Write Playwright Tests (if none exist)

If no tests exist for the feature yet, offer to create them:

1. Read the design document for test plan section
2. Read the implementation to understand the feature
3. Generate Playwright test files at `tests/<TASK-ID>/` or `e2e/<feature>/`

Playwright test structure:
```typescript
import { test, expect } from '@playwright/test';

test.describe('<Feature Name> - <TASK-ID>', () => {
  test('should <acceptance criterion 1>', async ({ page }) => {
    // Test implementation
  });

  test('should <acceptance criterion 2>', async ({ page }) => {
    // Test implementation
  });
});
```

Base tests on:
- Acceptance criteria from the Jira issue
- Test plan from the design document
- Common user flows for the feature
