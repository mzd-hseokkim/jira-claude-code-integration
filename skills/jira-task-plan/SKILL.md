---
name: jira-task-plan
description: |
  Generate a planning document from a Jira issue. Fetches issue details,
  related issues, and epic context, then delegates document generation to bkit PDCA.

  Use when: user says "plan task", "create plan", "jira-task plan",
  "기획 문서", "계획 작성", or wants to plan the implementation of a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Skill
  - mcp__jira__get-issue
  - mcp__jira__search-issues
  - mcp__jira__add-comment
---

# jira-task-plan: Generate Planning Document (via bkit PDCA)

## Workflow

### Step 1: Gather Context from Jira

1. Use `mcp__jira__get-issue` to fetch the issue details
2. If the issue has a parent epic, fetch the epic details too
3. Use `mcp__jira__search-issues` with JQL to find related issues:
   - Same epic: `"Epic Link" = <epic-key>`
   - Same component: `project = <project> AND component = <component>`
   - Recently resolved similar: `project = <project> AND status = Done AND resolved >= -30d`

### Step 2: Prepare Context Summary

Jira에서 수집한 정보를 정리하여 bkit에 전달할 컨텍스트를 구성:

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

### Step 3: Delegate to bkit PDCA Plan

bkit의 `/pdca plan` 스킬을 호출하여 고품질 기획 문서를 생성.

Jira 컨텍스트를 포함하여 다음과 같이 요청:

```
/pdca plan <TASK-ID>

위 Jira 이슈 컨텍스트를 기반으로 기획 문서를 생성해줘.
문서 경로: docs/plan/<TASK-ID>.plan.md
```

bkit이 생성하는 문서는 다음을 포함:
- Given-When-Then 형식의 수용 기준
- 보안/성능 고려사항
- 에지 케이스 분석
- 구조화된 태스크 분해

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

### Step 5: Suggest Next Steps

Tell the user:
- Planning document has been created at `docs/plan/<TASK-ID>.plan.md`
- Review and refine the plan
- Next step: `/jira-task design <TASK-ID>` to create a design document
