---
name: jira-task-plan
description: Generate a planning document from a Jira issue. Fetches issue details, related issues, and epic context, then generates a structured plan document. Use when user says "plan task", "create plan", "jira-task plan", "기획 문서", "계획 작성", or wants to plan the implementation of a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
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

### Step 1.5: Validate Information Sufficiency

Step 1에서 수집한 Jira 정보의 충분성을 평가한다. 다음 항목이 부족하면 사용자에게 질문:

**필수 정보 체크리스트:**
- [ ] 이슈 설명(Description)이 구체적인가? (한 줄 요약만 있거나 비어 있으면 부족)
- [ ] 무엇을 구현해야 하는지 명확한가?
- [ ] Acceptance Criteria가 있거나 유추할 수 있는가?

**부족한 경우**: `AskUserQuestion`으로 사용자에게 보충 질문을 한다.

질문 예시:
- "이슈 설명이 `<summary>` 한 줄뿐입니다. 구체적으로 어떤 기능을 구현해야 하나요?"
- "Acceptance Criteria가 없습니다. 이 기능이 완료되려면 어떤 조건을 만족해야 하나요?"
- "대상 사용자나 사용 시나리오가 명시되어 있지 않습니다. 어떤 상황에서 사용되나요?"

사용자 답변을 수집한 뒤 Step 2의 컨텍스트에 반영한다.

**충분한 경우**: 바로 Step 2로 진행.

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
