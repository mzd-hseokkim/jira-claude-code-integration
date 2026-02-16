---
name: jira-task-impl
description: Implement a Jira task based on plan/design documents. Loads Jira context, implements based on the design document, then posts progress to Jira. Use when user says "implement task", "start coding", "jira-task impl", "구현 시작", "코딩 시작", or wants to begin implementation based on design.
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
---

# jira-task-impl: Implement a Jira Task

## Prerequisites
- Design document should exist at `docs/design/<TASK-ID>.design.md` (warn if missing)
- Feature branch `feature/<TASK-ID>` should already exist (suggest `/jira-task start` if not)

## Workflow

### Step 1: Load Context

1. Read `.jira-context.json` for active task info
2. Use `mcp__jira__get-issue` to fetch latest issue details
3. Read `docs/design/<TASK-ID>.design.md` if it exists
4. Read `docs/plan/<TASK-ID>.plan.md` if it exists

### Step 2: Implement Based on Design Document

`docs/design/<TASK-ID>.design.md`의 Implementation Plan에 따라 구현.

구현 원칙:
1. Implementation Plan의 순서를 따름
2. 기존 코드 컨벤션과 패턴을 준수
3. Design 문서의 Error Handling, Security Checklist 반영
4. 각 단계 완료 시 간단한 검증 수행

Design 문서가 없으면, Jira 이슈 설명과 Acceptance Criteria 기반으로 구현.

### Step 3: Post Progress to Jira

구현 완료 후 `mcp__jira__add-comment`:

```
## Implementation Complete

**Branch**: feature/<TASK-ID>

### Changes Made
- Created: <list of new files>
- Modified: <list of changed files>

### Implementation Notes
- <key decisions made during implementation>
- <any deviations from design>

### Next Steps
- Run tests: `/jira-task test <TASK-ID>`
- Code review: `/jira-task review <TASK-ID>`
```

### Step 4: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"impl"` 추가 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **Implementation Complete** — <TASK-ID>

- 생성된 파일: <list>
- 수정된 파일: <list>
- Jira 코멘트 게시됨

**Progress**: init → start → plan → design → **impl ✓** → test → review → pr → done

**Next**: `/jira-task test <TASK-ID>` — 테스트를 실행합니다
---
```

테스트 프레임워크가 없는 프로젝트면 `/jira-task review <TASK-ID>`를 대신 추천.
