---
name: jira-task-design
description: |
  Generate a design document for a Jira task. Analyzes the codebase,
  references the planning document, then delegates document generation to bkit PDCA.

  Use when: user says "design task", "create design", "jira-task design",
  "설계 문서", "디자인 문서", or wants to design the implementation of a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Skill
  - mcp__jira__get-issue
  - mcp__jira__add-comment
---

# jira-task-design: Generate Design Document (via bkit PDCA)

## Workflow

### Step 1: Check Prerequisites

1. Check if `docs/plan/<TASK-ID>.plan.md` exists
   - If yes, read it for context
   - If no, suggest running `/jira-task plan <TASK-ID>` first (but proceed if user wants)
2. Use `mcp__jira__get-issue` to fetch current issue details

### Step 2: Analyze Codebase

Use Glob and Grep to understand the existing codebase:
- Find related files by searching for keywords from the issue summary
- Identify existing patterns (architecture, naming conventions, file structure)
- Check for existing similar implementations that can be referenced
- Note the tech stack and frameworks in use

### Step 3: Delegate to bkit PDCA Design

bkit의 `/pdca design` 스킬을 호출하여 고품질 설계 문서를 생성.

Jira 컨텍스트 + 코드베이스 분석 결과를 포함하여 요청:

```
/pdca design <TASK-ID>

기획 문서(docs/plan/<TASK-ID>.plan.md)와 아래 코드베이스 분석을 기반으로 설계 문서를 생성해줘.
문서 경로: docs/design/<TASK-ID>.design.md

## Codebase Analysis
- Tech Stack: <identified stack>
- Related files: <list>
- Existing patterns: <patterns found>
```

bkit이 생성하는 문서는 다음을 포함:
- 시퀀스 다이어그램, 컴포넌트 다이어그램
- 에러 핸들링 전략
- 보안 체크리스트
- 마이그레이션 전략
- 구현 순서 및 파일 목록

### Step 4: Post Summary to Jira

Use `mcp__jira__add-comment` to post:

```
## Design Document Created

Technical design has been created for this issue.

**Architecture:**
- <key architectural decisions>

**Files to modify:**
- <list of key files>

**Test approach:**
- <brief test strategy>

See: docs/design/<TASK-ID>.design.md
```

### Step 5: Suggest Next Steps

Tell the user:
- Design document created at `docs/design/<TASK-ID>.design.md`
- Review the design before implementation
- Next step: Start implementation, then `/jira-task review <TASK-ID>` when ready
