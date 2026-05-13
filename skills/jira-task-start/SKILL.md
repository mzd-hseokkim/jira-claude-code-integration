---
name: jira-task-start
description: "Start working on a Jira task — creates a feature branch or worktree and transitions the issue to In Progress. Triggers: jira-task start, start task; 작업 시작, 태스크 시작."
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

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Prerequisites
- Jira MCP server must be connected (check with `/jira`)
- Current directory should be inside a git repository
- TASK-ID must be a valid Jira issue key (e.g., PROJ-123)

## Workflow

### Step 0: Detect Mode (post-init vs fresh)

cwd에서 `.jira-context.json`을 `Read`로 읽어보고 아래로 분기 — **init이 이미 워크트리·README·context를 만들어둔 상태이면 중복 작업을 건너뛴다.**

- **post-init 모드** (hot path): 파일이 존재하고 `taskId === <TASK-ID>`이며 `worktreePath`가 디스크에 있음.
  - Step 3(worktree 생성 체크), Step 4(README 생성)를 **스킵**한다.
  - Step 6은 통째 rewrite 대신 patch (기존 필드 보존 + 추가).
- **fresh 모드**: 위 조건 미충족.
  - 모든 Step 그대로 수행.

이 분기 결정은 사용자에게 한 줄로 알려준다 — 예: `📂 post-init 모드: worktree·README·context 재생성 생략.`

### Step 1: Fetch Issue Details (cache-first)

먼저 `.jira-context.json`의 `cachedIssue`를 확인한다. **모든 필수 필드(`summary`, `description`, `priority`, `assignee`, `issuetype`)가 채워져 있고 `fetchedAt`이 있으면 fetch를 건너뛴다** — init이 만들어둔 캐시가 이미 충분한 경우.

cache miss면 `mcp__atlassian__jira_get_issue` 호출:

**Context optimization**: 호출 시 다음 파라미터로 응답을 슬림화한다.
- `fields="summary,status,priority,assignee,issuetype,description,subtasks,issuelinks"`
- `comment_limit=0` (start 단계에서는 코멘트 이력 불필요)

호출 후 결과를 `.jira-context.json`의 `cachedIssue`에 저장한다 (CLAUDE.md "Issue Cache" 참고 — 후속 단계가 재조회를 생략할 수 있게). `fetchedAt`은 반드시 `new Date().toISOString()` (UTC `Z`) 형식.

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

### Step 3: Create Feature Branch / Worktree (fresh mode only)

**post-init 모드면 본 Step 스킵.** Step 0에서 `.jira-context.json`의 `worktreePath`가 디스크에 존재함을 이미 확인했으므로 git 체크 자체가 불필요.

**fresh 모드**: worktree를 새로 생성:
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

### Step 4: Generate Task Context README (fresh mode only)

**post-init 모드면 본 Step 스킵.** init이 이미 만든 `TASK-README.md`를 덮어쓰지 않는다. 보강이 필요하면 사용자가 직접 수정.

**fresh 모드**: `TASK-README.md`를 worktree 디렉토리(또는 branch는 project root)에 생성:

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

### Step 6: Patch Local Context

`skills/_shared/context-update.md` 패턴으로 worktree-local + aggregate 두 파일을 한 번에 갱신한다. LLM 인라인 JSON patch 금지 — 누락/덮어쓰기 사고 방지.

호출 직전 `skills/_shared/script-lookup.md`로 `JIRA_CTX_UPDATE_PY` 절대경로를 해석:

```bash
SCRIPT_NAME="jira-context-update.py" OUT_VAR="JIRA_CTX_UPDATE_PY"
# Read skills/_shared/script-lookup.md and execute its lookup block here
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> start "<fresh-jira-status>" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

- `<fresh-jira-status>`: Step 4 transition 직후 `jira_get_issue`로 재조회한 실제 status명 (예: `"In Progress"`, `"진행 중"`). transition 시도값을 그대로 쓰지 말 것.
- `<repoRoot>`: worktree-local 파일의 `repoRoot` 필드. 없으면 `git worktree list | head -1`로 폴백.

스크립트는 `completedSteps`에 `"start"` 추가, `status` 갱신, `startAt` 기록, `cachedIssue.status`/`fetchedAt` 갱신을 일괄 처리한다.

`cachedIssue` 본문은 Step 1 fetch 결과로 worktree-local 파일에 미리 patch해두어야 스크립트가 status/fetchedAt만 깔끔히 갱신한다.

파일이 없는 경우(fresh 모드)에만 새로 만든 뒤 위 스크립트를 호출한다.

### Step 7: PDCA 권고

Completion Summary 직전에 다음 형식의 권고 블록을 출력한다. 이슈 요약·설명·타입·범위를 바탕으로 LLM이 판단한다 — 별도 휴리스틱 표나 분류기를 사용하지 않는다.

- **판단 대상**: `approach`, `test` 두 단계만. `impl`/`review`/`merge`/`done`은 항상 필수이므로 판단 대상에서 제외.
- **판단 근거**: 작업 성격(신규 기능 / 리팩토링 / 버그픽스 / 문서·설정 변경), 변경 범위, 리스크.
- **저장하지 않는다**: `.jira-context.json`이나 다른 곳에 기록하지 않는다. 한 세션 안에서만 의미를 가지며, 통신은 응답 텍스트로 끝낸다.
- **사용자 오버라이드**: 사용자가 다음 턴에 자연어("test는 넣어줘")로 알려주면 그대로 따른다. 별도 플래그·저장 없음.

출력 형식 예:

```
🔍 PDCA 권고
- 필수: approach, impl, review, merge
- 스킵 가능: test (사유: SKILL.md 텍스트 추가뿐, 동작 변경 없음)
```

스킵 가능 단계가 없으면 "스킵 가능: 없음"으로 출력. 권고는 본 응답 1회만 노출하고, 후속 단계가 자동으로 다시 출력하지 않는다.

### Step 8: Completion Summary

아래 형식으로 완료 요약 출력:

```
---
✅ **Start Complete** — <TASK-ID>

- 이슈 상태: In Progress
- 브랜치: feature/<TASK-ID>
- Worktree: <path>
- Jira 코멘트 게시됨

**Progress**: init → **start ✓** → approach → impl → test → review → merge → pr → done

**Next**: `/jira-task approach <TASK-ID>` — level-aware approach 문서를 작성합니다 (Step 7의 권고에 따라 다른 단계로 바로 갈 수도 있음)
---
```
