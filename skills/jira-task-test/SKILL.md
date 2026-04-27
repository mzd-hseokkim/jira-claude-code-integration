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
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_add_comment
---

# jira-task-test: Run Tests & Report to Jira

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Prerequisites
- Implementation should be complete for the task
- Test framework should be installed in the project

## Workflow

### Context Optimization

이 스킬에서 `mcp__atlassian__jira_get_issue`를 호출해야 하면 먼저 `.jira-context.json`의 `cachedIssue`를 확인한다 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 다음 파라미터로 호출 후 cache 갱신:
- `fields="summary,status,issuetype"`
- `comment_limit=0`

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

Use `mcp__atlassian__jira_add_comment` to post the test summary:

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

테스트 리포트와 실패 스크린샷을 공용 스크립트로 첨부 업로드 (스크립트 위치는 프로젝트 CLAUDE.md의 "Jira Attach Script" 섹션 참고):

```bash
# 리포트
bash "$JIRA_ATTACH_SH" <TASK-ID> docs/test/<TASK-ID>.test-report.md

# Playwright 실패 스크린샷 (있을 때만)
shots=$(find test-results/ playwright-report/ -name "*.png" -type f 2>/dev/null)
[ -n "$shots" ] && bash "$JIRA_ATTACH_SH" <TASK-ID> $shots
```

각 호출의 출력은 `HTTP <code>: <file>` 형식. 200이 아니면 업로드 실패 — 로컬 경로를 안내하고 계속 진행한다.

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
- Jira 첨부파일: 리포트 + 스크린샷 <N>개 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → plan → design → impl → **test ✓** → review → merge → pr → done

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

**Progress**: init → start → plan → design → impl → **test ✗** → review → merge → pr → done

**Next**: 실패 항목 수정 후 `/jira-task test <TASK-ID>` 재실행
---
```

