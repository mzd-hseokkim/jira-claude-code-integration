---
name: jira-task-epic
description: "Set, show, or clear the project-local Epic scope that jira-task create attaches new issues to. Triggers: jira-task epic, set epic, epic scope; 이번 작업은 epic, 이번 작업 에픽, 에픽 설정, 에픽 지정, 에픽 스코프, 에픽 해제, 현재 에픽 뭐야."
user-invocable: false
argument-hint: "[set <에픽 키|에픽 이름> | show | clear]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
  - mcp__atlassian__jira_get_user_profile
  - mcp__atlassian__jira_search
  - mcp__atlassian__jira_get_issue
---

# jira-task-epic: Project Epic Scope

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력). 이슈 키·필드명·JSON 키는 영어 유지.

## Overview

"이번 작업은 epic v1.0이야" 한 마디를 `.jira-epic.json`에 고정해 두고, 이후 `/jira-task create`가 그 Epic 아래에 이슈를 만들도록 한다. 스코프가 없으면 create는 지금과 동일하게 Epic 없이 생성한다.

**필수**: `Read skills/_shared/epic-scope.md` — 파일 위치 결정, 스키마, `.gitignore` 등록 블록의 단일 출처.

## Prerequisites

- Jira MCP 서버 (`atlassian`) 연결됨 — `set`에서만 필요. `show`/`clear`는 파일만 다루므로 연결 없이 동작한다.
- git 레포 안에서 실행. 아니면 "git 레포 안에서 실행해 주세요" 안내 후 종료.

## Workflow

### Step 0: Parse Argument

`$ARGUMENTS`에서 서브액션을 결정한다.

| 입력 | 서브액션 |
|---|---|
| `show`, `status`, 빈 인자 | **show** |
| `clear`, `unset`, `해제`, `없음` | **clear** |
| `set <값>` 또는 그 외 자연어(`v1.0`, `MAE-100`, `이번 작업은 epic v1.0이야`) | **set** (값 = 서브액션 토큰을 제외한 나머지) |

자연어에서 값을 뽑을 때 `epic`/`에픽`/`이번 작업은`/`이야`/`으로` 같은 조사·군더더기는 떼어낸다. 남은 것이 없으면 `AskUserQuestion`으로 Epic 키나 이름을 묻는다.

### Step 1: Resolve File Path

`skills/_shared/epic-scope.md`의 경로 결정 블록을 실행해 `EPIC_FILE`을 얻는다. `NOT_A_GIT_REPO`면 종료.

### Step 2: show

파일이 없으면:

```
📌 Epic 스코프: 설정되지 않음
   `/jira-task epic set <에픽 키 또는 이름>`으로 지정하면 이후 create가 그 Epic 아래에 이슈를 만듭니다.
```

있으면 키/요약/설정 시각을 출력한다. 이때 `jira_get_issue`로 현재 상태를 1회 확인해 `status`가 `Done`이면 아래 줄을 덧붙인다:

```
⚠️ 이 Epic은 이미 Done 상태입니다. 새 작업은 다른 Epic이 맞는지 확인하세요.
```

### Step 3: clear

파일이 없으면 "설정된 Epic 스코프가 없습니다" 출력 후 종료. 있으면 삭제하고 어떤 Epic이 해제됐는지 알린다.

```bash
rm -f "$EPIC_FILE"
```

### Step 4: set — Epic 해석

입력값이 **이슈 키 형태**(`[A-Z][A-Z0-9]+-\d+`)인지 먼저 본다.

**4-A. 키인 경우**: `jira_get_issue`로 조회 (`fields="summary,issuetype,status,project"`, `comment_limit=0`).

**4-B. 이름인 경우**: JQL로 검색한다.

```
project = <PROJECT_KEY> AND issuetype = Epic AND summary ~ "<입력값>" ORDER BY created DESC
```

`<PROJECT_KEY>`는 `JIRA_DEFAULT_PROJECT` 환경변수. **`JIRA_DEFAULT_PROJECT`가 있으면 이 JQL에 `project` 조건을 반드시 포함한다** (CLAUDE.md의 스코핑 규칙). 없으면 사용자에게 프로젝트 키를 묻는다.

- 0건 → Step 5의 **N0** 처리
- 1건 → 확정
- 2건 이상 → 키/요약/상태 테이블을 보여주고 `AskUserQuestion`으로 선택

### Step 5: set — 검증

| # | 조건 | 처리 |
|---|---|---|
| N0 | 이름 검색 0건 | 후보 없음 알림 + `AskUserQuestion`(`다른 이름으로 재검색` / `취소`). **Epic을 자동 생성하지 않는다** |
| N1 | `issuetype != Epic` | 거부 + 종료. `jira_link_to_epic`이 Epic이 아닌 대상에 `ValueError`를 낸다 |
| N2 | `status == Done` | 경고 후 `AskUserQuestion`으로 계속 여부 확인 |
| N3 | `JIRA_DEFAULT_PROJECT`와 프로젝트가 다름 | 경고 후 계속 여부 확인 |

**N1 예외**: 대상이 `epic-substitute` 라벨을 가진 Task면 Epic 타입이 비활성화된 프로젝트의 대체 Epic이다. 이 경우 허용하되, 저장 시 사용자에게 "Epic 타입 대체 이슈로 등록합니다"라고 1줄 알린다.

### Step 6: set — 저장

`skills/_shared/epic-scope.md`의 `.gitignore` 블록을 먼저 실행한 뒤(메인 레포 루트 기준), `Write` 도구로 `EPIC_FILE`을 쓴다.

```json
{
  "epicKey": "<확정 키>",
  "epicSummary": "<Jira summary>",
  "projectKey": "<프로젝트 키>",
  "setAt": "<date -Iseconds 결과>"
}
```

기존 파일이 있으면 덮어쓰되, 이전 값이 무엇이었는지 완료 출력에 표시한다.

### Step 7: Completion Summary

```
─────────────────────────────────────────
📌 Epic 스코프 설정 완료

**Epic**: <JIRA_URL>/browse/MAE-100 — v1.0 릴리스
**저장 위치**: <repo-root>/.jira-epic.json (gitignored)
# 덮어쓴 경우: **이전 값**: MAE-90 — v0.9 릴리스

이후 `/jira-task create`로 만드는 이슈는 이 Epic 아래에 생성됩니다.
해제하려면 `/jira-task epic clear`.
─────────────────────────────────────────
```

## Non-goals

- Epic 신규 생성 (검색 결과가 없어도 만들지 않는다)
- 기존 이슈의 Epic 링크 변경 (이미 만들어진 이슈는 건드리지 않는다)
- `.jira-context.json` 수정, worktree/branch 조작
- `init`/`report`의 JQL 스코핑 — 본 스코프는 **create에만** 영향을 준다
