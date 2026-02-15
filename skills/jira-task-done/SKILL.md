---
name: jira-task-done
description: |
  Complete a Jira task. Generates a completion summary,
  creates a pull request, transitions the issue, and posts the summary to Jira.

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

### Step 5: Generate Completion Summary

git diff/log 정보와 PDCA 문서들을 기반으로 완료 요약 생성:

1. `docs/plan/<TASK-ID>.plan.md` 존재 시 기획 요약 추출
2. `docs/design/<TASK-ID>.design.md` 존재 시 설계 요약 추출
3. git log/diff로 실제 변경사항 요약

### Step 6: Post Completion Report to Jira

Step 5의 요약을 기반으로 `mcp__jira__add-comment`에 게시:

```
## Task Completed: <TASK-ID>

**Branch**: feature/<TASK-ID>
**Commits**: <count> commits
**Files Changed**: <count> files (+<added> -<removed>)
**PR**: <PR URL or "to be created manually">

### Summary
- **Plan**: <기획 요약>
- **Design**: <설계 요약>
- **Changes**: <구현 변경사항 요약>

### Key Changes
<brief description of what was implemented>
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

### Step 9: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"done"` 추가하고, `status`를 `"Done"`으로 변경 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **Task Done** — <TASK-ID>

- Jira 상태: Done (또는 In Review)
- PR: <PR URL 또는 "수동 생성 필요">
- 완료 리포트 Jira에 게시됨
- `.jira-context.json` 업데이트됨

**Progress**: init → start → plan → design → impl → test → review → pr → **done ✓**

🎉 모든 단계가 완료되었습니다!
---
```
