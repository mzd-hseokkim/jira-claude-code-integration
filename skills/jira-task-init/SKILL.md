---
name: jira-task-init
description: |
  Fetch assigned high-priority Jira tasks and set up git worktrees for each.
  Bulk operation to initialize a sprint's working environment at once.

  Use when: user says "init sprint", "setup tasks", "작업 환경 세팅", "worktree 세팅",
  "스프린트 초기화", "할당된 작업 가져와", "jira-task init", or wants to prepare
  multiple task branches at the start of a sprint.
user-invocable: false
argument-hint: "[count]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - mcp__jira__search-issues
  - mcp__jira__get-issue
  - mcp__jira__add-comment
  - mcp__jira__get-boards
  - mcp__jira__get-sprints
---

# jira-task-init: Bulk Sprint/Task Initialization

나에게 할당된 Jira 태스크를 우선순위 순으로 가져와서 각각 git worktree를 생성하고
작업 컨텍스트를 세팅하는 일괄 처리 워크플로우.

## Prerequisites
- Jira MCP 서버 연결됨
- 현재 디렉토리가 git repository 내부
- 환경변수: JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN

## Workflow

### Step 1: Fetch My Assigned Tasks

사용자에게 몇 개의 태스크를 가져올지 확인 (기본값: 5).

JQL 쿼리로 나에게 할당된 고우선순위 태스크 조회:

```
Use mcp__jira__search-issues with JQL:
  assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC, created ASC
```

JIRA_DEFAULT_PROJECT가 설정되어 있으면 프로젝트 필터 추가:
```
  project = <JIRA_DEFAULT_PROJECT> AND assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC, created ASC
```

또는 활성 스프린트가 있으면 스프린트 기반으로 조회:
1. `mcp__jira__get-boards`로 보드 확인
2. `mcp__jira__get-sprints`로 활성 스프린트 확인
3. JQL: `sprint = <active-sprint-id> AND assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC`

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

### Step 4: Create Worktrees

선택된 각 태스크에 대해:

```bash
# Worktree 디렉토리 생성
mkdir -p "$WORKTREE_BASE"

# 각 태스크별 worktree 생성
git worktree add -b "feature/<TASK-ID>" "$WORKTREE_BASE/<TASK-ID>" <base-branch>
```

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

### Step 5: Generate README for Each Worktree

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

### Step 6: Post Comments to Jira

각 태스크에 코멘트 게시:
```
Use mcp__jira__add-comment:
  "Worktree initialized for branch `feature/<TASK-ID>` at `<worktree-path>`"
```

### Step 7: Save Context

`.jira-context.json`에 전체 초기화 정보 저장:

```json
{
  "initialized": "<ISO timestamp>",
  "baseBranch": "<detected base branch>",
  "worktreeBase": "<worktree base path>",
  "tasks": [
    {
      "taskId": "PROJ-101",
      "branch": "feature/PROJ-101",
      "worktreePath": "<path>",
      "summary": "로그인 기능 구현",
      "priority": "Highest",
      "status": "To Do"
    }
  ]
}
```

### Step 8: Summary

결과를 테이블로 표시:

```
Sprint initialization complete!

| # | Task | Branch | Worktree Path | Status |
|---|------|--------|---------------|--------|
| 1 | PROJ-101 | feature/PROJ-101 | ../project_worktree/PROJ-101 | Created |
| 2 | PROJ-102 | feature/PROJ-102 | ../project_worktree/PROJ-102 | Created |
| ... | | | | |

To start working on a task:
  cd <worktree-path>
  /jira-task start <TASK-ID>    # transition to In Progress
```
