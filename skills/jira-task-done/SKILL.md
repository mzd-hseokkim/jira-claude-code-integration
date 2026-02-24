---
name: jira-task-done
description: Complete a Jira task. Generates a completion summary, creates a pull request, transitions the issue, and posts the summary to Jira. Use when user says "done", "complete task", "finish task", "jira-task done", "작업 완료", "태스크 완료", or wants to wrap up work on a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_transition_issue
  - mcp__atlassian__jira_get_transitions
  - mcp__atlassian__jira_add_comment
---

# jira-task-done: Complete a Jira Task

## Language Rule

모든 출력을 한국어로 작성한다: 사용자 응답, 생성 문서, Jira 코멘트 등 모든 텍스트가 대상이다.
예외: 코드, 변수명, 브랜치명, 파일명, 명령어는 영어를 유지한다.

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

Use `mcp__atlassian__jira_get_issue` to confirm the issue exists and check its current status.

### Step 3: Summarize Changes

Get the diff summary against the base branch:
```bash
git log --oneline <base-branch>..feature/<TASK-ID>
git diff --stat <base-branch>..feature/<TASK-ID>
```

### Step 4: Create Pull Request (if not already exists)

먼저 이미 PR이 존재하는지 확인:
```bash
gh pr list --head "feature/<TASK-ID>" --state open --json url --jq '.[0].url' 2>/dev/null
```

- **PR이 이미 있으면**: 기존 PR URL을 사용하고 새로 생성하지 않음
- **PR이 없고 `gh` CLI가 있으면**: 새 PR 생성
  ```bash
  gh pr create --title "<TASK-ID>: <issue summary>" --body "<PR description with issue link>"
  ```
- **`gh` CLI가 없으면**: 스킵하고 수동 생성 필요를 안내

### Step 5: Generate Completion Summary

git diff/log 정보와 PDCA 문서들을 기반으로 완료 요약 생성:

1. `docs/plan/<TASK-ID>.plan.md` 존재 시 기획 요약 추출
2. `docs/design/<TASK-ID>.design.md` 존재 시 설계 요약 추출
3. git log/diff로 실제 변경사항 요약

### Step 6: Post Completion Report to Jira

Step 5의 요약을 기반으로 `mcp__atlassian__jira_add_comment`에 게시:

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

Use `mcp__atlassian__jira_get_transitions` to fetch available transitions, then use `mcp__atlassian__jira_transition_issue` to move the issue:
- Try "In Review" first (common for PR-based workflows)
- If "In Review" is not available, try "Done"
- If both fail, inform the user of available transitions

### Step 8: Cleanup MCP Config from Worktree Entry

`.jira-context.json`의 `worktreePath`를 읽어 `~/.claude.json`에서 해당 경로의 `mcpServers`를 제거한다.
entry 전체는 삭제하지 않고 `mcpServers` 키만 제거하여 Claude Code의 다른 메타데이터는 보존한다.

```bash
WORKTREE_PATH="<worktreePath from .jira-context.json>" python3 << 'PYEOF'
import json, os

claude_json_path = os.path.expanduser("~/.claude.json")
with open(claude_json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

def norm(p):
    return p.replace("\\", "/").rstrip("/")

worktree_path = norm(os.environ.get("WORKTREE_PATH", ""))
projects = data.get("projects", {})

matched_key = None
for k in list(projects.keys()):
    if norm(k) == worktree_path:
        matched_key = k
        break

if matched_key and isinstance(projects[matched_key], dict):
    projects[matched_key].pop("mcpServers", None)
    with open(claude_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"MCP config removed from {worktree_path}")
else:
    print(f"No entry found for {worktree_path}, skipping")
PYEOF
```

- `.jira-context.json`에 `worktreePath`가 없으면 스킵
- `~/.claude.json`에 해당 경로 entry가 없어도 스킵 (오류 아님)

### Step 9: Update Context & Completion Summary

기존 `.jira-context.json`을 읽고, 다음 필드를 업데이트하여 저장:
- `completedSteps` 배열에 `"done"` 추가 (중복 방지)
- `status`를 `"Done"`으로 변경
- `completedAt`에 현재 ISO 8601 타임스탬프 추가

아래 형식으로 완료 요약 출력:

```
---
✅ **Task Done** — <TASK-ID>

- Jira 상태: Done (또는 In Review)
- PR: <PR URL 또는 "수동 생성 필요">
- 완료 리포트 Jira에 게시됨
- `.jira-context.json` 업데이트됨
- 워크트리 MCP config 정리됨 (`~/.claude.json`)

**Progress**: init → start → plan → design → impl → test → review → merge → pr → **done ✓**

🎉 모든 단계가 완료되었습니다!
---
```
