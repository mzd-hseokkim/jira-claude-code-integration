---
name: jira-task-done
description: |
  Complete a Jira task. Generates a PDCA completion report via bkit,
  creates a pull request, transitions the issue, and posts the report to Jira.

  Use when: user says "done", "complete task", "finish task", "jira-task done",
  "작업 완료", "태스크 완료", or wants to wrap up work on a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Skill
  - mcp__jira__get-issue
  - mcp__jira__transition-issue
  - mcp__jira__add-comment
---

# jira-task-done: Complete a Jira Task

## Prerequisites
- A feature branch `feature/<TASK-ID>` must exist with commits
- Jira MCP server must be connected

## Workflow

### Step 1: Verify Context

Check for `.jira-context.json` to get the active task context.
If TASK-ID is provided as argument, use that instead.

Verify the feature branch exists:
```bash
git branch --list "feature/<TASK-ID>"
```

### Step 2: Fetch Current Issue Status

Use `mcp__jira__get-issue` to confirm the issue exists and check its current status.

### Step 3: Summarize Changes

Get the diff summary against the base branch:
```bash
git log --oneline <base-branch>..feature/<TASK-ID>
git diff --stat <base-branch>..feature/<TASK-ID>
```

### Step 4: Create Pull Request (if gh CLI available)

Check if `gh` is available:
```bash
which gh 2>/dev/null
```

If available, create a PR:
```bash
gh pr create --title "<TASK-ID>: <issue summary>" --body "<PR description with issue link>"
```

If not available, skip and inform the user they can create a PR manually.

### Step 5: Generate Completion Report (bkit)

bkit의 `/pdca report`를 호출하여 PDCA 완료 리포트를 생성:

```
/pdca report <TASK-ID>
```

bkit이 생성하는 리포트는 다음을 포함:
- Plan → Design → Do → Check 전체 사이클 요약
- 설계-구현 매칭률
- 코드 품질 분석 결과
- 교훈 (Lessons Learned)

### Step 6: Post Completion Report to Jira

bkit이 생성한 리포트를 기반으로 `mcp__jira__add-comment`에 게시:

```
## Task Completed: <TASK-ID>

**Branch**: feature/<TASK-ID>
**Commits**: <count> commits
**Files Changed**: <count> files (+<added> -<removed>)
**PR**: <PR URL or "to be created manually">

### PDCA Summary
- **Plan**: <기획 요약>
- **Design**: <설계 요약>
- **Do**: <구현 변경사항 요약>
- **Check**: 설계-구현 매칭률 <percentage>%

### Key Changes
<brief description of what was implemented>

### Lessons Learned
<bkit 리포트에서 추출한 교훈>
```

### Step 7: Transition Issue

Use `mcp__jira__transition-issue` to move the issue:
- Try "In Review" first (common for PR-based workflows)
- If "In Review" fails, try "Done"
- If both fail, inform the user of available transitions

### Step 8: Cleanup

Remove or update `.jira-context.json`:
```json
{
  "taskId": "<TASK-ID>",
  "branch": "feature/<TASK-ID>",
  "completedAt": "<ISO 8601 timestamp>",
  "status": "Done"
}
```

### Step 9: Summary

Tell the user:
- Task has been completed
- PDCA report generated and posted to Jira
- PR status (created or needs manual creation)
- Issue status in Jira
- Any follow-up actions needed
