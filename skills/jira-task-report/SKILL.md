---
name: jira-task-report
description: "Generate a status report of assigned Jira issues — breakdown by status, blockers, Scrum/Kanban support. Triggers: jira-task report, status report; 현황 리포트, 진행 상황."
user-invocable: false
allowed-tools:
  - Read
  - Write
  - mcp__atlassian__jira_get_agile_boards
  - mcp__atlassian__jira_get_sprints_from_board
  - mcp__atlassian__jira_search
---

# jira-task-report: Status Report

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Workflow

### Step 1: Fetch My Assigned Issues

먼저 스프린트 유무를 확인하고, 적절한 JQL로 이슈를 검색:

**Context optimization (모든 jira_search 호출 공통):**
- `fields="summary,status,priority,issuetype,assignee"` (description 제외 — 리포트는 카드 단위 요약만 필요)
- `limit=50`

**스프린트가 있는 경우 (Scrum)**:
1. Use `mcp__atlassian__jira_get_agile_boards` to list available boards
2. Use `mcp__atlassian__jira_get_sprints_from_board` with the boardId to find the active sprint
3. JQL: `project = <JIRA_DEFAULT_PROJECT> AND sprint = <sprint-id> AND assignee = currentUser() ORDER BY status ASC, priority DESC` (위 fields/limit 사용)

**스프린트가 없는 경우 (Kanban / 기타)**:
```
Use mcp__atlassian__jira_search with JQL:
  project = <JIRA_DEFAULT_PROJECT> AND assignee = currentUser() AND status != Done ORDER BY priority DESC
  fields="summary,status,priority,issuetype,assignee"
  limit=50
```

### Step 2: Categorize Issues

Group issues by status:
- **To Do**: Not started
- **In Progress**: Being worked on
- **In Review**: Awaiting review
- **Done**: Completed (최근 7일 이내)

Calculate:
- Total issues
- Completion percentage
- Per-status count

### Step 3: Generate Report

Read `templates/report.template.md` for structure.

Create a markdown report with:
- Report scope (스프린트 이름 or 프로젝트 이름)
- Progress percentage
- Issue breakdown table (status별)
- Blockers/risks (Blocker priority or "blocked" label)

Save to `docs/reports/status-<YYYY-MM-DD>.report.md`

### Step 4: Completion Summary

리포트를 인라인으로 표시한 뒤 완료 요약 출력:

```
---
✅ **Report Generated**

- 리포트 저장: `docs/reports/status-<YYYY-MM-DD>.report.md`
- 전체 이슈: <N>개 (완료: <N>개, 진행중: <N>개, 대기: <N>개)
- 완료율: <N>%
---
```
