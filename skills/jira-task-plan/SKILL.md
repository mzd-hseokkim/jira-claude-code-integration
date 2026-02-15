---
name: jira-task-plan
description: |
  Generate a planning document from a Jira issue. Fetches issue details,
  related issues, and epic context, then generates a structured plan document.

  Use when: user says "plan task", "create plan", "jira-task plan",
  "기획 문서", "계획 작성", or wants to plan the implementation of a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - mcp__jira__get-issue
  - mcp__jira__search-issues
  - mcp__jira__add-comment
---

# jira-task-plan: Generate Planning Document

## Workflow

### Step 1: Gather Context from Jira

1. Use `mcp__jira__get-issue` to fetch the issue details
2. If the issue has a parent epic, fetch the epic details too
3. Use `mcp__jira__search-issues` with JQL to find related issues:
   - Same epic: `"Epic Link" = <epic-key>`
   - Same component: `project = <project> AND component = <component>`
   - Recently resolved similar: `project = <project> AND status = Done AND resolved >= -30d`

### Step 2: Prepare Context Summary

Jira에서 수집한 정보를 정리:

```markdown
## Jira Issue Context

- **Key**: <TASK-ID>
- **Summary**: <summary>
- **Description**: <description>
- **Priority**: <priority>
- **Assignee**: <assignee>
- **Sprint**: <sprint>
- **Epic**: <epic-key> - <epic-summary>
- **Labels**: <labels>
- **Components**: <components>

### Related Issues
- <related-key>: <summary> (status: <status>)

### Acceptance Criteria (from Jira)
<if available in description or custom fields>
```

### Step 3: Generate Plan Document

Step 2에서 정리한 Jira 컨텍스트를 기반으로 `docs/plan/<TASK-ID>.plan.md` 생성.
`templates/plan.template.md`의 구조를 따른다.

문서에 포함할 내용:
- **Background**: Jira 이슈 설명 기반
- **Scope**: In/Out scope 정리
- **Acceptance Criteria**: Jira에서 추출하거나, 없으면 Given-When-Then 형식으로 생성
- **Task Breakdown**: 구현 단위로 분해
- **Risks**: 의존성, 기술적 위험 식별
- **Edge Cases**: 경계 조건 분석

### Step 4: Post Summary to Jira

Use `mcp__jira__add-comment` to post a brief summary:

```
## Planning Document Created

A planning document has been created for this issue.

**Key Points:**
- Objective: <1-line summary>
- Scope: <brief scope>
- Dependencies: <list>
- Risks: <key risks>
- Estimated sub-tasks: <count>

See: docs/plan/<TASK-ID>.plan.md
```

### Step 5: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"plan"` 추가 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **Plan Complete** — <TASK-ID>

- 기획 문서 생성: `docs/plan/<TASK-ID>.plan.md`
- Jira 코멘트 게시됨

**Progress**: init → start → **plan ✓** → design → impl → test → review → pr → done

**Next**: `/jira-task design <TASK-ID>` — 설계 문서를 작성합니다
---
```
