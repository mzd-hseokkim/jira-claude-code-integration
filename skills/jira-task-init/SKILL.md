---
name: jira-task-init
description: Fetch assigned high-priority Jira tasks and set up git worktrees for each. Bulk operation to initialize a sprint's working environment at once. Use when user says "init sprint", "setup tasks", "작업 환경 세팅", "worktree 세팅", "스프린트 초기화", "할당된 작업 가져와", "jira-task init", or wants to prepare multiple task branches at the start of a sprint.
user-invocable: false
argument-hint: "[count]"
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

## Language Rule

모든 출력을 한국어로 작성한다: 사용자 응답, 생성 문서, Jira 코멘트 내용 등 모든 텍스트가 대상이다.
예외: 코드, 변수명, 브랜치명, 파일명, 명령어는 영어를 유지한다.
Jira 코멘트: 섹션 제목(##, ###)은 영어로, 내용(설명·요약·노트)은 한국어로 작성한다.

나에게 할당된 Jira 태스크를 우선순위 순으로 가져와서 각각 git worktree를 생성하고
작업 컨텍스트를 세팅하는 일괄 처리 워크플로우.

## Prerequisites
- Jira MCP 서버 연결됨
- 현재 디렉토리가 git repository 내부
- 환경변수: JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN

## Workflow

### Step 1: Fetch My Assigned Tasks

사용자에게 몇 개의 태스크를 가져올지 확인 (기본값: 5).

JQL 쿼리로 나에게 할당된 고우선순위 태스크 조회.
**JIRA_DEFAULT_PROJECT가 설정되어 있으면 반드시 `project = <JIRA_DEFAULT_PROJECT>` 조건을 포함해야 한다.**

```
Use mcp__atlassian__jira_search with JQL:
  project = <JIRA_DEFAULT_PROJECT> AND assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC, created ASC
```

또는 활성 스프린트가 있으면 스프린트 기반으로 조회:
1. `mcp__atlassian__jira_get_agile_boards`로 보드 목록 확인
2. `mcp__atlassian__jira_get_sprints_from_board`로 활성 스프린트 확인 (boardId 필요)
3. JQL: `project = <JIRA_DEFAULT_PROJECT> AND sprint = <active-sprint-id> AND assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC`

결과에서 상위 N개(기본 5개)만 선택.

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

각 worktree 생성 직후, `~/.claude.json`의 해당 worktree 경로에 현재 프로젝트의 `mcpServers` 설정을 복사한다.

`~/.claude.json`의 구조:
```json
{
  "projects": {
    "<project-path>": { "mcpServers": { "atlassian": { ... } } },
    "<worktree-path>": { "mcpServers": {} }
  }
}
```

워크트리는 별도 경로라 MCP 설정이 자동 상속되지 않으므로 직접 주입해야 한다.

```bash
REPO_ROOT="<REPO_ROOT 절대경로>" WORKTREE_PATH="<워크트리 절대경로>" \
  "$( { command -v python3; command -v python; } 2>/dev/null | grep -iv "WindowsApps" | head -1 | tr -d '\r\n' )" << 'PYEOF'
import json, os, re, sys

claude_json_path = os.path.expanduser("~/.claude.json")
with open(claude_json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

def norm(p):
    p = p.replace("\\", "/").rstrip("/")
    # Convert Unix-style Windows drive path: /c/path → C:/path
    m = re.match(r'^/([a-zA-Z])(/.*)', p)
    if m:
        p = m.group(1).upper() + ':' + m.group(2)
    return p

projects = data.setdefault("projects", {})
repo_root = norm(os.environ.get("REPO_ROOT", ""))
worktree_path = norm(os.environ.get("WORKTREE_PATH", ""))

# 현재 프로젝트의 mcpServers 찾기
mcp_servers = {}
for k, v in projects.items():
    if isinstance(v, dict) and norm(k) == repo_root:
        mcp_servers = v.get("mcpServers", {})
        break

if not mcp_servers:
    print("No mcpServers in current project, skipping")
    sys.exit(0)

# 워크트리 entry 업데이트 또는 생성
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
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"MCP servers injected into {worktree_path}: {list(mcp_servers.keys())}")
PYEOF
```

- Python 탐지를 명령어 라인에 인라인으로 포함: `$( { command -v python3; command -v python; } | grep -iv WindowsApps | head -1 )` — `$_python3` 변수 불필요, 명령 분리 시에도 항상 올바른 Python을 탐지
- `mcpServers`가 비어있거나 없으면 주입을 건너뜀 (오류 아님)
- 경로 정규화: 백슬래시/슬래시 혼용 처리, 후행 슬래시 제거
- Windows/Linux/macOS 공통: python3 → python 순 탐색, WindowsApps 스텁 자동 제외

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
