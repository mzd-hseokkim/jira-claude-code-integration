---
name: jira-task-start
description: Start working on a Jira task. Fetches issue details, creates a feature branch or git worktree, transitions the issue to "In Progress", and sets up the development context. Use when user says "start task", "begin working on", "jira-task start", "start PROJ-123", "작업 시작", "태스크 시작", or provides a Jira issue key to begin work on.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_transition_issue
  - mcp__atlassian__jira_get_transitions
  - mcp__atlassian__jira_add_comment
  - mcp__atlassian__jira_search
---

# jira-task-start: Start Working on a Jira Task

## Language Rule

모든 출력을 한국어로 작성한다: 사용자 응답, 생성 문서, Jira 코멘트 내용 등 모든 텍스트가 대상이다.
예외: 코드, 변수명, 브랜치명, 파일명, 명령어는 영어를 유지한다.
Jira 코멘트: 섹션 제목(##, ###)은 영어로, 내용(설명·요약·노트)은 한국어로 작성한다.

## Prerequisites
- Jira MCP server must be connected (check with `/jira`)
- Current directory should be inside a git repository
- TASK-ID must be a valid Jira issue key (e.g., PROJ-123)

## Workflow

### Step 1: Fetch Issue Details

Use `mcp__atlassian__jira_get_issue` with the provided TASK-ID.

Display to the user:
- **Key**: Issue key
- **Summary**: Issue title
- **Status**: Current status
- **Priority**: Priority level
- **Assignee**: Who it's assigned to
- **Description**: Issue description (truncated if very long)
- **Acceptance Criteria**: If present in description
- **Sub-tasks**: If any
- **Linked Issues**: If any

### Step 2: Transition to "In Progress"

Use `mcp__atlassian__jira_get_transitions` to fetch available transitions, then use `mcp__atlassian__jira_transition_issue` with:
- `issueKey`: The TASK-ID
- `transitionId`: ID for "In Progress" (or similar like "Start Progress", "Begin Work")

**Important**: Do NOT pass a `comment` parameter to `jira_transition_issue`. The `comment` field requires Atlassian Document Format (ADF) JSON — passing plain text will cause an error. Add comments separately using `jira_add_comment`.

If the transition fails, the issue may already be in progress or the transition name differs.
In that case, inform the user of the current status and continue with the remaining steps.

### Step 3: Create Feature Branch / Worktree (if not already exists)

먼저 `init`으로 이미 생성되었는지 확인:
```bash
# 이미 worktree/branch가 있는지 확인
git branch --list "feature/<TASK-ID>"
git worktree list | grep "<TASK-ID>"
```

**이미 존재하면**: 생성을 스킵하고 Step 4로 진행.

**없으면**: worktree를 새로 생성:
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$REPO_ROOT")
PROJECT_NAME=$(basename "$REPO_ROOT")
WORKTREE_BASE="$PARENT_DIR/${PROJECT_NAME}_worktree"
mkdir -p "$WORKTREE_BASE"

# base branch 감지 (develop → main → master)
git rev-parse --verify develop 2>/dev/null  # 1st
git rev-parse --verify main 2>/dev/null     # 2nd
git rev-parse --verify master 2>/dev/null   # 3rd

git worktree add -b "feature/<TASK-ID>" "$WORKTREE_BASE/<TASK-ID>" <base-branch>
```

### Step 4: Generate Task Context README

Create a `TASK-README.md` in the worktree directory (or project root for branch) with:

```markdown
# <TASK-ID>: <Summary>

## Issue Details
- **Status**: In Progress
- **Priority**: <priority>
- **Assignee**: <assignee>
- **Branch**: feature/<TASK-ID>
- **Started**: <current date/time>

## Description
<issue description from Jira>

## Acceptance Criteria
<extracted from description if available>

## Related Issues
<linked issues if any>
```

### Step 5: Post Comment to Jira

Use `mcp__atlassian__jira_add_comment` with:
- `issueKey`: The TASK-ID
- `comment`: "브랜치 `feature/<TASK-ID>`에서 개발을 시작했습니다. 작업 디렉토리: `<worktree-path or branch>`"

### Step 6: Save Local Context

기존 `.jira-context.json`이 있으면 읽어서 `completedSteps`를 보존하고, 없으면 새로 생성.
worktree 디렉토리와 원본 레포 양쪽에 저장:
```json
{
  "taskId": "<TASK-ID>",
  "branch": "feature/<TASK-ID>",
  "worktreePath": "<path-to-worktree>",
  "baseBranch": "<detected-base-branch>",
  "startedAt": "<ISO 8601 timestamp>",
  "summary": "<issue summary>",
  "status": "In Progress",
  "completedSteps": ["start"]
}
```

`init`에서 이미 `completedSteps: ["init"]`이 있으면 `["init", "start"]`로 병합.

### Step 7: Completion Summary

아래 형식으로 완료 요약 출력:

```
---
✅ **Start Complete** — <TASK-ID>

- 이슈 상태: In Progress
- 브랜치: feature/<TASK-ID>
- Worktree: <path>
- Jira 코멘트 게시됨

**Progress**: init → **start ✓** → plan → design → impl → test → review → merge → pr → done

**Next**: `/jira-task plan <TASK-ID>` — 기획 문서를 작성합니다
---
```

Plan이 불필요한 간단한 작업이면 `/jira-task impl <TASK-ID>`로 바로 구현 가능함을 안내.
