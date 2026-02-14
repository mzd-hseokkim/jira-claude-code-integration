---
name: jira-task-impl
description: |
  Implement a Jira task based on plan/design documents.
  Loads Jira context, delegates implementation to bkit PDCA Do phase,
  then posts progress to Jira.

  Use when: user says "implement task", "start coding", "jira-task impl",
  "구현 시작", "코딩 시작", or wants to begin implementation based on design.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Skill
  - mcp__jira__get-issue
  - mcp__jira__add-comment
---

# jira-task-impl: Implement a Jira Task (via bkit PDCA Do)

## Prerequisites
- Design document should exist at `docs/design/<TASK-ID>.design.md` (warn if missing)
- Feature branch `feature/<TASK-ID>` should already exist (suggest `/jira-task start` if not)

## Workflow

### Step 1: Load Context

1. Read `.jira-context.json` for active task info
2. Use `mcp__jira__get-issue` to fetch latest issue details
3. Read `docs/design/<TASK-ID>.design.md` if it exists
4. Read `docs/plan/<TASK-ID>.plan.md` if it exists

### Step 2: Delegate to bkit PDCA Do

bkit의 `/pdca do` 스킬을 호출하여 설계 문서 기반 구현:

```
/pdca do <TASK-ID>

설계 문서(docs/design/<TASK-ID>.design.md) 기반으로 구현해줘.
```

bkit이 수행하는 작업:
- 설계 문서의 Implementation Plan에 따른 단계별 구현
- 기존 코드 컨벤션 준수
- 파일 생성/수정
- 구현 중 설계와의 일관성 검증

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

### Step 4: Suggest Next Steps

Tell the user:
- Implementation is complete
- List files created/modified
- Suggest: `/jira-task test <TASK-ID>` to run tests
- Or: `/jira-task review <TASK-ID>` for code review
