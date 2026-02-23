---
name: jira-local-merge
description: Locally merge a Jira task branch into the base branch without a remote or PR. Handles merge strategy selection, Jira status transition, worktree cleanup, and MCP config removal. Use when user says "local merge", "merge task", "jira-task merge", "로컬 병합", "원격 없이 병합", or wants to merge without a remote origin.
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
---

# jira-local-merge: Local Branch Merge

remote origin 없이 feature 브랜치를 base 브랜치로 로컬 병합하고,
Jira 상태 전환 및 worktree 정리까지 일괄 처리한다.

## Prerequisites
- feature 브랜치에 커밋이 존재
- Jira MCP 서버 연결됨

## Workflow

### Step 1: Load Context

`.jira-context.json`을 읽어 태스크 컨텍스트 로드:
- `taskId`, `branch`, `baseBranch`, `worktreePath`

인자로 TASK-ID가 전달된 경우 해당 값 우선 사용.
`baseBranch`가 없으면 아래 순서로 감지:
```bash
git rev-parse --verify develop 2>/dev/null
git rev-parse --verify main 2>/dev/null
git rev-parse --verify master 2>/dev/null
```

### Step 2: Pre-flight Checks

```bash
# 1. feature 브랜치 존재 확인
git branch --list "feature/<TASK-ID>"

# 2. 워크트리 내 미커밋 변경사항 확인
git -C "<worktreePath>" status --porcelain
```

미커밋 변경사항이 있으면 사용자에게 알리고 중단. 계속할지 확인 후 진행.

### Step 3: Choose Merge Strategy

사용자에게 병합 전략 선택 요청:

```
병합 전략을 선택하세요:

1. --no-ff (기본 권장)
   merge commit을 생성, feature 브랜치 히스토리가 그대로 보존됨
   GitHub "Create a merge commit"과 동일

2. --squash
   feature 브랜치의 모든 커밋을 하나로 합쳐 병합
   GitHub "Squash and merge"와 동일

3. rebase
   feature 브랜치 커밋을 base 브랜치 위에 재배치, 선형 히스토리
   GitHub "Rebase and merge"와 동일
```

### Step 4: Perform Merge

**원본 레포 루트(`REPO_ROOT`)에서 실행**한다. 워크트리 디렉터리에서 실행하지 않음.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
```

#### 전략별 명령:

**--no-ff (기본)**
```bash
git -C "$REPO_ROOT" checkout <baseBranch>
git -C "$REPO_ROOT" merge --no-ff feature/<TASK-ID> -m "Merge feature/<TASK-ID>: <issue summary>"
```

**--squash**
```bash
git -C "$REPO_ROOT" checkout <baseBranch>
git -C "$REPO_ROOT" merge --squash feature/<TASK-ID>
git -C "$REPO_ROOT" commit -m "feat(<TASK-ID>): <issue summary>"
```

**rebase**
```bash
git -C "$REPO_ROOT" checkout feature/<TASK-ID>
git -C "$REPO_ROOT" rebase <baseBranch>
git -C "$REPO_ROOT" checkout <baseBranch>
git -C "$REPO_ROOT" merge --ff-only feature/<TASK-ID>
```

merge 충돌 발생 시 사용자에게 알리고 중단. 충돌 해결 후 재실행 안내.

### Step 5: Post Completion Report to Jira

`mcp__atlassian__jira_add_comment`로 병합 결과 게시:

```
## Task Merged Locally: <TASK-ID>

**Branch**: feature/<TASK-ID> → <baseBranch>
**Strategy**: <merge strategy>
**Commits**: <count> commits
**Files Changed**: <count> files (+<added> -<removed>)

### Changes
<git log --oneline 요약>
```

### Step 6: Transition Issue

`mcp__atlassian__jira_get_transitions`로 전환 목록 조회 후 `mcp__atlassian__jira_transition_issue`로 상태 전환:
- "In Review" 우선 시도
- 없으면 "Done" 시도
- 둘 다 없으면 가능한 전환 목록을 사용자에게 안내

### Step 7: Cleanup Worktree & Branch

```bash
# worktree 제거
git -C "$REPO_ROOT" worktree remove "<worktreePath>" --force

# feature 브랜치 삭제
git -C "$REPO_ROOT" branch -d "feature/<TASK-ID>"
```

브랜치 삭제 실패(-d 오류) 시 이미 병합됐으므로 `-D`로 강제 삭제.

### Step 8: Remove MCP Config from ~/.claude.json

`worktreePath`를 기준으로 `~/.claude.json`의 해당 entry에서 `mcpServers` 제거:

```bash
WORKTREE_PATH="<worktreePath>" python3 << 'PYEOF'
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

### Step 9: Update Context & Completion Summary

`.jira-context.json`을 업데이트:
- `completedSteps`에 `"merge"` 추가
- `status`를 `"Done"`으로 변경
- `completedAt`에 현재 ISO 8601 타임스탬프 추가

아래 형식으로 완료 요약 출력:

```
---
✅ **Local Merge Complete** — <TASK-ID>

- 병합: feature/<TASK-ID> → <baseBranch> (<strategy>)
- Jira 상태: Done (또는 In Review)
- Worktree 정리됨: <worktreePath>
- 완료 리포트 Jira에 게시됨

**Progress**: init → start → plan → design → impl → test → review → **merge ✓**

🎉 로컬 병합이 완료되었습니다!
---
```
