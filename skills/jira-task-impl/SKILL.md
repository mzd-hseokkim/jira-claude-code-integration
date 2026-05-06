---
name: jira-task-impl
description: "Implement a Jira task based on plan/design documents and post progress to Jira. Triggers: jira-task impl, implement task; 구현 시작, 코딩 시작."
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
- Design document should exist at `docs/design/<TASK-ID>.design.md` (warn if missing)
- Feature branch `feature/<TASK-ID>` should already exist (suggest `/jira-task start` if not)

## Workflow

### Step 1: Load Context

1. Read `.jira-context.json` for active task info
2. **Cache-first**: `.jira-context.json`의 `cachedIssue`를 먼저 확인 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 `mcp__atlassian__jira_get_issue` 호출 (`fields="summary,status,description,issuetype"`, `comment_limit=0` — 구현은 design 문서가 1차 소스이므로 이슈 본문은 최소만) 후 cache 갱신.
3. Read `docs/design/<TASK-ID>.design.md` if it exists
4. Read `docs/plan/<TASK-ID>.plan.md` if it exists

### Step 2: Implement Based on Design Document

`docs/design/<TASK-ID>.design.md`의 Implementation Plan에 따라 구현.

구현 원칙:
1. Implementation Plan의 순서를 따름
2. 기존 코드 컨벤션과 패턴을 준수
3. Design 문서의 Error Handling, Security Checklist 반영
4. 각 단계 완료 시 **타입체크/컴파일 등 syntactic 검증만** 수행 (테스트 실행 금지)

Design 문서가 없으면, Jira 이슈 설명과 Acceptance Criteria 기반으로 구현.

**테스트 작업 금지 (강제):**
- 본 단계에서 **테스트 코드 작성 금지** — unit/integration/E2E 모두 해당
- 테스트 실행 금지 (`npm test`, `pytest`, `playwright test` 등)
- 테스트 파일(`*.test.*`, `*.spec.*`, `__tests__/`, `tests/` 하위 등) 신규 생성/수정 금지
- 테스트 코드 작성과 실행은 모두 `/jira-task test` 단계의 책임이다
- 단, 구현 대상 파일 자체가 우연히 테스트 코드인 경우(예: 테스트 유틸리티 자체를 구현하는 task)는 design 문서 Implementation Plan에 명시된 한에서만 허용

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

`.jira-context.json`의 `completedSteps`에 `"impl"` 추가 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **Implementation Complete** — <TASK-ID>

- 생성된 파일: <list>
- 수정된 파일: <list>
- Jira 코멘트 게시됨

**Progress**: init → start → approach → **impl ✓** → test → review → merge → pr → done

**Next**: `/jira-task test <TASK-ID>` — 테스트 코드를 작성하고 실행합니다
---
```

테스트 프레임워크가 없는 프로젝트면 `/jira-task review <TASK-ID>`를 대신 추천.
