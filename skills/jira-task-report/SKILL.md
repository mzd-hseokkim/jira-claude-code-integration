---
name: jira-task-report
description: "Generate a status report of assigned Jira issues — breakdown by status, blockers, Scrum/Kanban support. Triggers: jira-task report, status report; 현황 리포트, 진행 상황."
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Bash
---

# jira-task-report: Status Report

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Workflow

### Step 1: Fetch My Assigned Issues

Jira 호출은 `scripts/jira-cli.py` (규약: `Read skills/_shared/jira-cli.md`). 호출 prompt가 `<scripts>/` 절대 경로를 줬으면 그대로, 없으면 `skills/_shared/script-lookup.md`로 `SCRIPT_NAME="jira-cli.py"` 1회 해석.

먼저 스프린트 유무를 확인하고, 적절한 JQL로 이슈를 검색:

**Context optimization (모든 search 호출 공통):**
- 압축 출력(key/summary/status/issuetype/priority/assignee)만 쓴다 — description 불필요, 리포트는 카드 단위 요약만 필요
- `--limit 50`
- `JIRA_DEFAULT_PROJECT`가 있으면 `project =` 조건은 CLI가 자동 삽입

**스프린트가 있는 경우 (Scrum)**:
1. `python3 "<scripts>/jira-cli.py" boards [PROJECT]`로 보드 목록 확인
2. `python3 "<scripts>/jira-cli.py" sprints <BOARD-ID> active`로 활성 스프린트 확인
3. `python3 "<scripts>/jira-cli.py" search "sprint = <sprint-id> AND assignee = currentUser() ORDER BY status ASC, priority DESC" --limit 50`

**스프린트가 없는 경우 (Kanban / 기타)**:
```bash
python3 "<scripts>/jira-cli.py" search "assignee = currentUser() AND status != Done ORDER BY priority DESC" --limit 50
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
