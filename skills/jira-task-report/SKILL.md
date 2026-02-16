---
name: jira-task-report
description: Generate a status report of my assigned Jira issues. Shows issue breakdown by status, assignee summary, and blockers. Works with both Scrum (sprint) and Kanban (no sprint) workflows. Use when user says "report", "status report", "jira-task report", "현황 리포트", "진행 상황", or wants to see assigned issue status.
user-invocable: false
allowed-tools:
  - Read
  - Write
  - mcp__jira__get-boards
  - mcp__jira__get-sprints
  - mcp__jira__search-issues
---

# jira-task-report: Status Report

## Workflow

### Step 1: Fetch My Assigned Issues

먼저 스프린트 유무를 확인하고, 적절한 JQL로 이슈를 검색:

**스프린트가 있는 경우 (Scrum)**:
1. Use `mcp__jira__get-boards` to list available boards
2. Use `mcp__jira__get-sprints` to find the active sprint
3. JQL: `sprint = <sprint-id> AND assignee = currentUser() ORDER BY status ASC, priority DESC`

**스프린트가 없는 경우 (Kanban / 기타)**:
```
project = <JIRA_DEFAULT_PROJECT> AND assignee = currentUser() AND status != Done ORDER BY priority DESC
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
