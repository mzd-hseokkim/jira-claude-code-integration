---
name: jira-task-init
description: Fetch assigned high-priority Jira tasks and set up git worktrees for each. Supports three argument modes - count (bulk init), issue key (sub-task analysis), or natural language. Use when user says "init sprint", "setup tasks", "작업 환경 세팅", "worktree 세팅", "스프린트 초기화", "할당된 작업 가져와", "jira-task init", "init MAE-2", or wants to prepare multiple task branches.
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

Step 0에서 추출한 이슈 키로 해당 이슈와 하위작업을 조회한다.

#### 1-B-1. 부모 이슈 조회

```
Use mcp__atlassian__jira_get_issue with issue_key: <ISSUE-KEY>
  fields="summary,status,issuetype,priority"
  comment_limit=0
```

이슈 타입과 요약을 확인하여 사용자에게 표시.

#### 1-B-2. 하위작업 조회

```
Use mcp__atlassian__jira_search with JQL:
  parent = <ISSUE-KEY> AND status NOT IN (Done, Closed) ORDER BY priority DESC, created ASC
  fields="summary,status,priority,issuetype,assignee"
  limit=50
```

**JIRA_DEFAULT_PROJECT가 설정되어 있으면 `project = <JIRA_DEFAULT_PROJECT> AND parent = <ISSUE-KEY> AND ...` 형태로 프로젝트 조건을 포함한다.**

하위작업이 없으면 사용자에게 알리고 종료.

#### 1-B-3. 의존성 분석 및 착수 가능 작업 선별

각 하위작업에 대해 issue links를 분석한다:

- `mcp__atlassian__jira_get_issue`로 각 하위작업의 상세 정보(issuelinks 포함) 조회
  - **Context optimization**: `fields="summary,status,priority,issuetype,issuelinks"`, `comment_limit=0` (이 호출은 issuelinks가 핵심이므로 반드시 fields에 포함)
- `is blocked by` (inward) 관계의 링크된 이슈가 **미완료**(status가 Done/Closed가 아닌) 상태이면 해당 작업은 **blocked**로 분류
- 블로커가 없거나 모든 블로커가 완료된 작업만 **착수 가능**으로 선별

결과를 사용자에게 표시:

```
📋 <ISSUE-KEY>: <부모 이슈 요약>

하위작업 <전체 N>건 중 착수 가능 <M>건:

| # | Key | Summary | Priority | Status | Blocked By |
|---|-----|---------|----------|--------|------------|
| 1 | PROJ-201 | 로그인 API 구현 | High | To Do | - |
| 2 | PROJ-202 | UI 컴포넌트 작성 | High | To Do | - |
| - | PROJ-203 | 통합 테스트 | Medium | To Do | PROJ-201, PROJ-202 (미완료) |
```

착수 가능한 작업이 없으면 사용자에게 알리고 종료.
착수 가능한 작업 목록을 Step 2로 전달. → Step 2로 진행.

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

선택된 각 태스크에 대해:

```bash
# Worktree 디렉토리 생성
mkdir -p "$WORKTREE_BASE"
```

**각 태스크별로 먼저 기존 존재 여부 확인 후 생성:**

```bash
# 1. 이미 브랜치가 있는지 확인
git branch --list "feature/<TASK-ID>"

# 2. 이미 worktree가 있는지 확인
git worktree list | grep "<TASK-ID>"
```

- **브랜치와 worktree 모두 이미 존재**: "Already exists — skipped" 표시 후 다음 태스크로
- **브랜치만 존재 (worktree 없음)**: 기존 브랜치로 worktree 생성 (`-b` 플래그 없이)
  ```bash
  git worktree add "$WORKTREE_BASE/<TASK-ID>" "feature/<TASK-ID>"
  ```
- **둘 다 없음**: 새로 생성
  ```bash
  git worktree add -b "feature/<TASK-ID>" "$WORKTREE_BASE/<TASK-ID>" <base-branch>
  ```

**Worktree 생성 직후 — `.gitignore` 확인:**

worktree의 `.gitignore`에 아래 항목이 없으면 추가 (feature 브랜치는 base branch 시점의 `.gitignore`를 체크아웃하므로 메인 레포 변경이 반영되지 않을 수 있음):

```bash
WORKTREE_GITIGNORE="$WORKTREE_BASE/<TASK-ID>/.gitignore"
if ! grep -qF ".jira-context.json" "$WORKTREE_GITIGNORE" 2>/dev/null; then
  printf '\n# Jira integration (local dev context)\n.jira-context.json\nTASK-README.md\n' >> "$WORKTREE_GITIGNORE"
fi
```

이미 존재하면 스킵.

**중요: Worktree 경로 규칙**
- 반드시 원본 레포의 **상위 디렉토리**에 생성
- 절대로 원본 레포 안에 생성하지 않음
- 구조:
  ```
  workspace/
  ├── my-project/                    # 원본 레포 (main 브랜치)
  └── my-project_worktree/           # 원본 레포 밖
      ├── PROJ-101/                  # feature/PROJ-101 브랜치
      ├── PROJ-102/                  # feature/PROJ-102 브랜치
      └── ...
  ```

### Step 5.5: Propagate MCP Config to Worktree

워크트리는 별도의 프로젝트 루트로 인식되어 MCP 설정이 자동 상속되지 않는다. 이 플러그인은 `mcp-atlassian` 서버에 의존하므로, **메인 레포에서 atlassian 서버가 어디에 등록되어 있든 찾아내서** 워크트리로 전파해야 한다.

Claude Code MCP 서버는 다음 4곳 중 하나에 등록될 수 있다 (우선순위 = 탐색 순서):

1. **프로젝트 루트 `<repo>/.mcp.json`** (project-scoped, 팀 공유용)
2. **`~/.claude.json` → `projects[<repo>].mcpServers`** (`claude mcp add --scope project` 또는 IDE 등록 시)
3. **`~/.claude.json` → top-level `mcpServers`** (`claude mcp add --scope user`, 모든 프로젝트 공통)
4. 위 어디에도 없음 → 사용자에게 안내하고 스킵 (오류 아님)

전파 방식:
- 출처가 ①이면: 워크트리 루트에 `.mcp.json`을 그대로 복사
- 출처가 ②/③이면: `~/.claude.json`의 워크트리 경로 항목에 `mcpServers`를 주입

특히 **`atlassian` 서버**가 출처에 들어있는지 검증하고, 없으면 경고를 출력한다 (이 플러그인은 atlassian 없이는 동작하지 않음).

```bash
REPO_ROOT_ABS="<REPO_ROOT 절대경로>"
WORKTREE_ABS="<워크트리 절대경로>"

python3 - "$REPO_ROOT_ABS" "$WORKTREE_ABS" << 'PYEOF'
import json, os, re, shutil, sys

repo_root_arg = sys.argv[1]
worktree_path_arg = sys.argv[2]

def norm(p):
    p = p.replace("\\", "/").rstrip("/")
    m = re.match(r'^/([a-zA-Z])(/.*)', p)
    if m:
        p = m.group(1).upper() + ':' + m.group(2)
    return p

repo_root = norm(repo_root_arg)
worktree_path = norm(worktree_path_arg)

# Source candidates (priority order)
src_mcp_json = os.path.join(repo_root_arg, ".mcp.json")
claude_json_path = os.path.expanduser("~/.claude.json")
claude_data = None
if os.path.exists(claude_json_path):
    with open(claude_json_path, "r", encoding="utf-8") as f:
        claude_data = json.load(f)

mcp_servers = None
source = None

# 1) project-scoped .mcp.json
if os.path.exists(src_mcp_json):
    with open(src_mcp_json, "r", encoding="utf-8") as f:
        mcp_servers = json.load(f).get("mcpServers", {}) or None
    if mcp_servers:
        source = "project_mcp_json"

# 2) ~/.claude.json projects[repo].mcpServers
if not mcp_servers and claude_data:
    for k, v in claude_data.get("projects", {}).items():
        if isinstance(v, dict) and norm(k) == repo_root:
            cand = v.get("mcpServers") or None
            if cand:
                mcp_servers = cand
                source = "claude_json_project"
            break

# 3) ~/.claude.json top-level mcpServers (user scope)
if not mcp_servers and claude_data:
    cand = claude_data.get("mcpServers") or None
    if cand:
        mcp_servers = cand
        source = "claude_json_user"

if not mcp_servers:
    print("No MCP servers found in .mcp.json or ~/.claude.json — skipping propagation")
    print("WARNING: this plugin requires the 'atlassian' MCP server. Run /jira setup if needed.")
    sys.exit(0)

if "atlassian" not in mcp_servers:
    print(f"WARNING: 'atlassian' server not found in {source}; this plugin will not work in the worktree.")
    print(f"Found servers: {list(mcp_servers.keys())}")

# Propagate
if source == "project_mcp_json":
    shutil.copyfile(src_mcp_json, os.path.join(worktree_path_arg, ".mcp.json"))
    print(f"Copied .mcp.json to worktree (servers: {list(mcp_servers.keys())})")
else:
    # Inject into ~/.claude.json projects[worktree]
    projects = claude_data.setdefault("projects", {})
    matched = False
    for k in list(projects.keys()):
        if norm(k) == worktree_path:
            if isinstance(projects[k], dict):
                projects[k]["mcpServers"] = mcp_servers
            matched = True
            break
    if not matched:
        projects[worktree_path] = {"mcpServers": mcp_servers}
    with open(claude_json_path, "w", encoding="utf-8") as f:
        json.dump(claude_data, f, indent=2, ensure_ascii=False)
    print(f"Injected mcpServers into ~/.claude.json for worktree (source: {source}, servers: {list(mcp_servers.keys())})")
PYEOF
```

- 출처 우선순위: project `.mcp.json` > `~/.claude.json` projects > `~/.claude.json` top-level
- `atlassian` 서버가 빠져 있으면 경고만 출력하고 진행 (사용자가 다른 서버로 등록했을 수 있음)
- 워크트리에서 `.mcp.json`을 처음 로드하면 신뢰 승인 프롬프트가 한 번 뜰 수 있다
- 경로 정규화: 백슬래시/슬래시 혼용 처리, 후행 슬래시 제거

### Step 6: Generate README for Each Worktree

각 worktree 디렉토리에 `TASK-README.md` 생성:

```markdown
# <TASK-ID>: <Summary>

## Issue Details
- **Key**: <TASK-ID>
- **Summary**: <summary>
- **Type**: <issue type>
- **Priority**: <priority>
- **Status**: <status>
- **Branch**: feature/<TASK-ID>
- **Worktree**: <worktree path>
- **Initialized**: <date/time>

## Description
<issue description from Jira>

## Acceptance Criteria
<extracted from description if available>

## Workflow
1. `cd <worktree-path>` 로 이동
2. 구현 작업 수행
3. `/jira-task test <TASK-ID>` 로 테스트
4. `/jira-task review <TASK-ID>` 로 코드 리뷰
5. `/jira-task done <TASK-ID>` 로 완료 처리
```

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

**Progress**: **init ✓** → start → plan → design → impl → test → review → merge → pr → done

**Next**: `cd <worktree-path>` → `/jira-task start <TASK-ID>`
---
```
