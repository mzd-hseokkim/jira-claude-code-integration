---
name: jira-task-init
description: "Fetch assigned high-priority Jira tasks and set up git worktrees for each (count, issue key, or natural language). Triggers: jira-task init, init sprint, setup tasks; 작업 환경 세팅, 스프린트 초기화, 할당된 작업 가져와."
user-invocable: false
argument-hint: "[count | ISSUE-KEY | 자연어설명]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - mcp__atlassian__jira_search
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_add_comment
  - mcp__atlassian__jira_get_agile_boards
  - mcp__atlassian__jira_get_sprints_from_board
---

# jira-task-init: Bulk Sprint/Task Initialization

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

나에게 할당된 Jira 태스크를 우선순위 순으로 가져와서 각각 git worktree를 생성하고
작업 컨텍스트를 세팅하는 일괄 처리 워크플로우.

## Prerequisites
- Jira MCP 서버 연결됨
- 현재 디렉토리가 git repository 내부
- 환경변수: JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN

## Workflow

### Step 0: Argument Parsing

인자를 분석하여 3가지 모드 중 하나로 분류한다:

1. **숫자 (Count 모드)**: 인자가 없거나 숫자만 있으면 → 기존 동작. Step 1로 진행.
   - 예: `""`, `"3"`, `"5"`
2. **이슈 키 (Issue Key 모드)**: 인자에 Jira 이슈 키 패턴(`[A-Z]+-\d+`, 예: `MAE-2`, `PROJ-123`)이 포함되면 → Step 1-B로 진행.
   - 예: `"MAE-2"`, `"MAE-2 하위작업 분석해서 착수 가능한 것만"`
   - 자연어 속에 이슈 키가 포함된 경우에도 이슈 키를 추출하여 Issue Key 모드로 처리
3. **자연어 (이슈 키 미포함)**: 이슈 키 패턴이 없는 자연어만 있으면 → 사용자에게 이슈 키를 확인 요청. 이슈 키를 받으면 Step 1-B, 숫자를 받으면 Step 1로 진행.

### Step 1: Fetch My Assigned Tasks (Count 모드)

사용자에게 몇 개의 태스크를 가져올지 확인 (기본값: 5).

JQL 쿼리로 나에게 할당된 고우선순위 태스크 조회.
**JIRA_DEFAULT_PROJECT가 설정되어 있으면 반드시 `project = <JIRA_DEFAULT_PROJECT>` 조건을 포함해야 한다.**

```
Use mcp__atlassian__jira_search with JQL:
  project = <JIRA_DEFAULT_PROJECT> AND assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC, created ASC
  fields="summary,status,priority,issuetype,assignee"
  limit=20
```

또는 활성 스프린트가 있으면 스프린트 기반으로 조회:
1. `mcp__atlassian__jira_get_agile_boards`로 보드 목록 확인
2. `mcp__atlassian__jira_get_sprints_from_board`로 활성 스프린트 확인 (boardId 필요)
3. JQL: `project = <JIRA_DEFAULT_PROJECT> AND sprint = <active-sprint-id> AND assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC`

결과에서 상위 N개(기본 5개)만 선택. → Step 2로 진행.

### Step 1-B: Fetch Sub-tasks by Issue Key (Issue Key 모드)

Step 0에서 추출한 이슈 키로 해당 이슈와 하위작업을 조회하고 의존성을 분석한다.

상세 절차: `Read skills/jira-task-init/refs/issue-key-mode.md`

요약:
1. 부모 이슈 조회 (`fields="summary,status,issuetype,priority"`, `comment_limit=0`)
2. JQL로 미완료 하위작업 조회 (`parent = <ISSUE-KEY> AND status NOT IN (Done, Closed)`)
3. 각 하위작업의 issuelinks 분석 → `is blocked by` 미완료 블로커 있으면 blocked 처리
4. 착수 가능 작업만 선별하여 의존성 표 출력 → Step 2로 전달

### Step 2: Display Task List

가져온 태스크 목록을 테이블로 표시:

```
Found <N> tasks assigned to you:

| # | Key | Summary | Priority | Status | Type |
|---|-----|---------|----------|--------|------|
| 1 | PROJ-101 | 로그인 기능 구현 | Highest | To Do | Story |
| 2 | PROJ-102 | API 에러 핸들링 | High | To Do | Task |
| 3 | PROJ-103 | 대시보드 UI | High | In Progress | Story |
| 4 | PROJ-104 | 테스트 커버리지 | Medium | To Do | Task |
| 5 | PROJ-105 | 문서 업데이트 | Medium | To Do | Task |
```

사용자에게 확인: "이 태스크들에 대해 worktree를 생성할까요? (전체 또는 번호 선택)"

### Step 3: Detect Git Context

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
PROJECT_NAME=$(basename "$REPO_ROOT")
PARENT_DIR=$(dirname "$REPO_ROOT")
WORKTREE_BASE="$PARENT_DIR/${PROJECT_NAME}_worktree"
```

Base branch 감지 (순서대로 시도):
```bash
git rev-parse --verify develop 2>/dev/null  # 1st: develop
git rev-parse --verify main 2>/dev/null     # 2nd: main
git rev-parse --verify master 2>/dev/null   # 3rd: master
```

### Step 4: Ensure .gitignore

프로젝트의 `.gitignore`에 아래 항목이 없으면 bash로 추가:

```bash
REPO_GITIGNORE="$REPO_ROOT/.gitignore"
if ! grep -qF ".jira-context.json" "$REPO_GITIGNORE" 2>/dev/null; then
  printf '\n# Jira integration (local dev context)\n.jira-context.json\nTASK-README.md\n' >> "$REPO_GITIGNORE"
fi
```

이미 존재하면 스킵.

### Step 5: Create Worktrees

선택된 각 태스크에 대해 브랜치/worktree 존재 여부를 확인한 뒤 생성하고, `.gitignore`를 동기화한다.

상세 절차: `Read skills/jira-task-init/refs/worktree-creation.md`

요약:
- 브랜치+worktree 모두 있으면 → "Already exists — skipped"
- 브랜치만 있으면 → `git worktree add "$WORKTREE_BASE/<TASK-ID>" "feature/<TASK-ID>"`
- 둘 다 없으면 → `git worktree add -b "feature/<TASK-ID>" "$WORKTREE_BASE/<TASK-ID>" <base-branch>`
- 생성 후 worktree `.gitignore`에 `.jira-context.json` / `TASK-README.md` 항목 추가 (없으면)
- **중요**: worktree는 반드시 원본 레포 **상위 디렉토리** 안에 생성 (`<parent>/<project>_worktree/<TASK-ID>`)

### Step 5.5: Propagate MCP Config to Worktree

워크트리는 별도의 프로젝트 루트로 인식되어 MCP 설정이 자동 상속되지 않는다.
`scripts/propagate-mcp-config.sh`를 호출하여 메인 레포의 atlassian 서버 설정을 워크트리로 전파한다.

스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
REPO_ROOT_ABS="<REPO_ROOT 절대경로>"
WORKTREE_ABS="<워크트리 절대경로>"

SCRIPT_NAME="propagate-mcp-config.sh" OUT_VAR="PROPAGATE_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here

if [ -n "$PROPAGATE_SH" ]; then
  bash "$PROPAGATE_SH" "$REPO_ROOT_ABS" "$WORKTREE_ABS"
else
  echo "propagate-mcp-config.sh not found — skipping MCP propagation. Run /jira setup in the worktree if needed." >&2
fi
```

- 출처 우선순위: project `.mcp.json` > `~/.claude.json` projects > `~/.claude.json` top-level
- `atlassian` 서버가 빠져 있으면 경고만 출력하고 진행
- 워크트리에서 `.mcp.json`을 처음 로드하면 신뢰 승인 프롬프트가 한 번 뜰 수 있다

### Step 6: Generate README for Each Worktree

각 worktree 디렉토리에 `TASK-README.md` 생성. 포함 항목:
- Issue Details (Key, Summary, Type, Priority, Status, Branch, Worktree, Initialized)
- Description (Jira 이슈 설명)
- Acceptance Criteria (설명에서 추출)
- Workflow (`start` → `test` → `review` → `done` 명령 안내)

### Step 7: Post Comments to Jira

각 태스크에 코멘트 게시:
```
Use mcp__atlassian__jira_add_comment:
  "브랜치 `feature/<TASK-ID>`의 worktree가 `<worktree-path>`에 초기화되었습니다."
```

### Step 8: Save Context

**각 worktree에** `.jira-context.json` 생성 (세션 시작 시 hook이 읽을 수 있도록):

```json
{
  "taskId": "PROJ-101",
  "branch": "feature/PROJ-101",
  "worktreePath": "<path>",
  "repoRoot": "<REPO_ROOT 절대경로>",
  "baseBranch": "<detected base branch>",
  "summary": "로그인 기능 구현",
  "priority": "Highest",
  "status": "To Do",
  "completedSteps": ["init"],
  "initializedAt": "<ISO timestamp>"
}
```

**원본 레포에도** `.jira-context.json` 저장 (전체 태스크 목록용):

```json
{
  "initialized": "<ISO timestamp>",
  "repoRoot": "<REPO_ROOT 절대경로>",
  "baseBranch": "<detected base branch>",
  "worktreeBase": "<worktree base path>",
  "tasks": [
    {
      "taskId": "PROJ-101",
      "branch": "feature/PROJ-101",
      "worktreePath": "<path>",
      "repoRoot": "<REPO_ROOT 절대경로>",
      "summary": "로그인 기능 구현",
      "priority": "Highest",
      "status": "To Do"
    }
  ]
}
```

### Step 9: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"init"` 추가.
결과를 테이블로 표시한 뒤, 아래 형식으로 완료 요약 출력:

```
| # | Task | Branch | Worktree Path | Status |
|---|------|--------|---------------|--------|
| 1 | PROJ-101 | feature/PROJ-101 | ../project_worktree/PROJ-101 | Created |
| 2 | PROJ-102 | feature/PROJ-102 | ../project_worktree/PROJ-102 | Created |

---
✅ **Init Complete**

- <N>개 worktree 생성됨
- Jira 코멘트 게시됨
- 컨텍스트 `.jira-context.json`에 저장됨

**Progress**: **init ✓** → start → approach → impl → test → review → merge → pr → done

**Next**: `cd <worktree-path>` → `/jira-task start <TASK-ID>`
---
```
