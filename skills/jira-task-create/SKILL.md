---
name: jira-task-create
description: Interactively create a new Jira issue (and optional sub-tasks with dependency links) from conversation context. Gathers details via dialog, proposes a sub-task breakdown when the scope warrants it, and creates everything in Jira using mcp-atlassian. Use when user says "create task", "new task", "jira 이슈 만들어", "태스크 등록", "/jira-task create", or wants to register a new Jira issue from scratch.
user-invocable: false
argument-hint: "[초기 힌트 / 자연어 설명]"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
  - mcp__atlassian__jira_get_user_profile
  - mcp__atlassian__jira_get_all_projects
  - mcp__atlassian__jira_search
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_create_issue
  - mcp__atlassian__jira_add_comment
  - mcp__atlassian__jira_create_issue_link
  - mcp__atlassian__jira_get_link_types
  - mcp__atlassian__jira_link_to_epic
---

# jira-task-create: Create New Jira Issue (with Sub-tasks & Dependencies)

## Language Rule

모든 대화/출력을 한국어로 작성한다: 사용자 응답, `AskUserQuestion` 질문/선택지, 생성 이슈 본문(summary/description), Jira 코멘트 내용이 모두 대상이다.
예외: 코드, 변수명, 이슈 키, 필드명(priority/labels 등), 명령어, JSON 키는 영어 유지.
Jira 코멘트 섹션 제목(##, ###)은 영어, 내용은 한국어.

## Overview

이 스킬은 신규 Jira 이슈를 생성한다. 기존의 `init`/`start`와 달리 **아직 존재하지 않는 이슈를 만드는** 단계이며, PDCA 워크플로(`init → start → ... → done`)의 이전 단계에 해당한다. 생성 완료 후에는 `/jira-task init <parent-key>` 또는 `/jira-task start <key>`로 기존 워크플로에 합류한다.

핵심 특징:
- **컨텍스트 우선**: 진행 중인 대화에서 이미 충분한 정보가 있으면 추가 질문을 최소화한다.
- **부족하면 단계별 질문**: 필수 필드가 부족하면 `AskUserQuestion`으로 배치 질문한다.
- **자동 서브태스크 판단**: 스킬이 작업 범위를 보고 서브태스크 분해가 필요한지 직접 판단한다. 필요하면 초안을 제안하고 사용자 확인을 받는다.
- **의존성 → 이슈 링크**: 서브태스크 간 의존성은 `Blocks` 이슈 링크로 표현한다. 링크가 없으면 병렬 실행 가능으로 간주된다. 이 규약은 기존 `jira-task-init`의 "착수 가능 분석"과 호환된다.
- **에픽 연결 지원**: 상위 이슈를 기존 에픽에 연결할 수 있다.

## Prerequisites

- Jira MCP 서버 (`atlassian`) 연결됨 — 미연결 시 `/jira setup` 안내 후 종료
- `JIRA_DEFAULT_PROJECT` 환경변수가 있으면 프로젝트 키로 사용, 없으면 Step 2에서 사용자에게 묻는다

## mcp-atlassian Schema Notes (IMPORTANT — 과거 실패 방지)

**반드시 아래 규칙을 지킬 것. 추측 금지.**

### `jira_create_issue` 파라미터
| 파라미터 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `project_key` | str | Yes | 프로젝트 키 (예: `PROJ`) |
| `summary` | str | Yes | 이슈 제목 |
| `issue_type` | str | Yes | `Task`, `Story`, `Bug`, `Epic`, `Subtask` 중 하나 (서브태스크는 `Subtask`, 하이픈 없음) |
| `description` | str | No | **Markdown 형식** (서버가 Jira 포맷으로 변환) |
| `assignee` | str | No | **top-level 전용**. email / display name / accountId 가능. `additional_fields`에 넣으면 **조용히 무시됨** |
| `components` | str | No | **CSV 문자열** (예: `"Frontend,API"`). 리스트 아님 |
| `additional_fields` | **str (JSON string)** | No | **dict가 아니라 JSON.dumps된 문자열**로 전달 |

### `additional_fields` JSON 문자열의 허용 키
```json
{
  "priority": {"name": "High"},
  "labels": ["frontend", "urgent"],
  "parent": "PROJ-123",
  "epic_link": "EPIC-123",
  "fixVersions": [{"id": "10020"}],
  "customfield_10010": "value"
}
```

핵심 주의:
- `priority`는 **`{"name": "..."}` 객체**. 문자열만 넣으면 안 된다.
- `parent`는 **bare 문자열 키** (`"PROJ-123"`). `{"key": "PROJ-123"}` 형태로 감싸지 말 것 — 서버가 내부적으로 감싼다.
- `parent`는 **모든 issue_type에 사용 가능** — Subtask뿐 아니라 일반 Task에도 parent-link로 동작한다.
- Epic 연결 별칭: `epicKey`, `epic_link`, `epicLink`, `epic link` 모두 허용. **Cloud team-managed 프로젝트에서는 `parent`로 자동 폴백**되므로 `{"parent": "EPIC-123"}`만으로도 에픽 연결이 된다.
- **알려지지 않은 키는 warning만 찍고 조용히 스킵**된다 — 오타 주의.

### 서브태스크 생성 패턴
```json
{
  "project_key": "PROJ",
  "summary": "로그인 API 구현",
  "issue_type": "Subtask",
  "description": "...",
  "additional_fields": "{\"parent\":\"PROJ-100\",\"priority\":{\"name\":\"High\"}}"
}
```
- `issue_type`을 `"Subtask"`로 설정하고 `parent` 없으면 서버가 `ValueError`를 낸다.
- 프로젝트가 Subtask 타입을 비활성화했을 수 있음 → 실패 시 `issue_type: "Task"` + `{"parent": "..."}`로 폴백 (일반 Task에 parent link).

### `jira_create_issue_link` 방향성 (매우 중요)
- `link_type` 파라미터는 링크 타입의 **`name`** 필드 (예: `"Blocks"`) — `"is blocked by"` 같은 **방향 구문을 넣으면 안 된다**.
- "A가 B를 블록한다"(= B가 A에 blocked by 됨) 경우:
  - `link_type = "Blocks"`
  - `inward_issue_key = "B"` ("is blocked by" 쪽을 읽는 이슈)
  - `outward_issue_key = "A"` ("blocks" 쪽을 읽는 이슈)
- 혼동 방지: `inward`는 **blocked 당하는** 쪽, `outward`는 **blocking 하는** 쪽.
- 사용 전 반드시 `jira_get_link_types`로 정확한 `name` 확인 (일부 인스턴스는 커스텀).

### `jira_link_to_epic`
- 파라미터: `issue_key`, `epic_key` (두 개 다 문자열).
- 타겟이 **실제 Epic 타입**이 아니면 `ValueError`.
- 내부적으로 4개 전략 순차 시도 (parent field → discovered customfield → hardcoded customfield 목록 → Relates-to 링크 폴백).
- `jira_create_issue`의 `additional_fields`에 `{"parent": "EPIC-KEY"}`로 인라인 처리가 실패했을 때만 fallback으로 쓴다.

### `jira_batch_create_issues` — **사용 금지**
이 스킬에서는 쓰지 않는다. 이유:
- `additional_fields` 래퍼가 없어서 스키마가 다르다 (`components`도 list로 바뀜).
- epic_link 별칭 처리 안 됨.
- Subtask parent 검증 안 됨.
- **API 응답의 에러는 로그만 찍고 호출자에게 전파되지 않아** 부분 실패가 silent해진다.
- 대신 **`jira_create_issue`를 루프로 호출**하고, 각 호출 결과를 검증한다.

## Workflow

### Step 0: Parse Argument & Check Connection

1. `$ARGUMENTS`에서 초기 힌트를 추출한다 (비어 있어도 OK).
2. Jira MCP 연결 확인: `mcp__atlassian__jira_get_user_profile` 호출. 실패하면 "/jira setup을 먼저 실행하세요" 안내 후 종료.

### Step 1: Assess Context Sufficiency

현재 **대화 컨텍스트 + 초기 힌트**를 합쳐서 아래 필수 정보를 채울 수 있는지 평가한다:

**필수 정보:**
- [ ] **Project key** — `JIRA_DEFAULT_PROJECT` 환경변수 또는 대화에서 확인 가능?
- [ ] **Summary (제목)** — 명확히 유추 가능?
- [ ] **Description (무엇을/왜)** — 배경·목적·범위가 구체적인가?
- [ ] **Issue type** — Task/Story/Bug/Epic 중 명확한가? (기본값 Task 가능)
- [ ] **Priority** — 명시되었거나 합리적으로 기본값(`Medium`) 적용 가능?

**선택 정보:**
- [ ] Epic 연결 여부
- [ ] Labels, components, assignee
- [ ] 서브태스크 필요 여부 및 구성

**판단 기준:**
- 필수 정보 중 **2개 이상 부족** 또는 description이 한 줄 요약 수준 → **Step 2 (질문 단계)**로 진행
- 필수 정보가 대부분 충족 → **Step 3 (사용자 확인 요약)**로 직행하고, 부족한 것만 간단 확인

### Step 2: Gather Missing Info via AskUserQuestion (조건부)

**Phase A — 상위 이슈 핵심 정보** (`AskUserQuestion` 1회 호출, 여러 question을 배치로 묶음)

질문 예시 (부족한 것만 선택적으로 포함):

1. **요약(Summary)**: "이 이슈의 한 줄 제목을 입력해주세요"
   - 단답형 질문
2. **이슈 타입**:
   - 선택지: `Task` / `Story` / `Bug` / `Epic`
   - 기본 추천: 기능 추가는 Story, 단일 작업은 Task, 버그는 Bug
3. **Priority**:
   - 선택지: `Highest` / `High` / `Medium` / `Low` / `Lowest`
   - 기본: `Medium`
4. **프로젝트 키** (`JIRA_DEFAULT_PROJECT` 없을 때만):
   - `mcp__atlassian__jira_get_all_projects`로 가져온 목록 중에서 선택

**Phase B — 상세 설명 보강** (A 단계 답변 받은 후, 설명이 여전히 부족하면)

`AskUserQuestion`으로 다음을 물어본다 (필요한 것만):
- "어떤 사용자/상황에서 이 기능이 필요한가요?" (배경)
- "완료되려면 어떤 조건을 만족해야 하나요?" (Acceptance Criteria 힌트)
- "기술적으로 어떤 접근이 필요한가요?" (힌트만 — 실제 설계는 `/jira-task design`에서)
- "제외 범위(하지 말아야 할 것)가 있나요?"

**Phase C — 선택 정보** (A/B가 끝난 후, 사용자가 원하면)

`AskUserQuestion`으로 배치 질문:
- **Epic 연결**: "기존 에픽에 연결할까요?"
  - 선택지: `아니오 (연결 안 함)` / `기존 에픽 선택` / `새 에픽으로 생성`
  - "기존 에픽 선택"을 고른 경우 → 다음 하위 단계로 JQL 검색 후 선택
- **Labels**: "라벨을 추가할까요? (쉼표로 구분, 없으면 건너뜀)"
- **Components**: "컴포넌트를 지정할까요? (쉼표로 구분, 없으면 건너뜀)"
- **Assignee**: "담당자를 지정할까요? (이메일/본인/미정 중 선택)"

**Epic 선택 서브 플로우** (사용자가 "기존 에픽 선택"한 경우):
1. `mcp__atlassian__jira_search`로 에픽 조회:
   ```
   JQL: project = <PROJECT_KEY> AND issuetype = Epic AND status != Done ORDER BY created DESC
   ```
   (`JIRA_DEFAULT_PROJECT` 있으면 반드시 포함)
2. 상위 10개를 테이블로 표시 (`Key`, `Summary`, `Status`)
3. `AskUserQuestion`으로 에픽 키 선택 (또는 "위 목록에 없음" 선택지)
4. "위 목록에 없음" 시 → 사용자에게 에픽 키 직접 입력 요청, 또는 에픽 연결 건너뛰기

### Step 3: Decide Sub-task Split (스킬 자동 판단)

수집된 정보를 바탕으로 **스킬이 직접** 서브태스크 필요 여부를 판단한다. 판단 기준 (heuristic):

**서브태스크가 필요한 경우 (제안):**
- 작업이 **여러 레이어**를 건드림 (예: 백엔드 + 프론트 + DB 마이그레이션)
- **순차 단계**가 명확히 구분됨 (예: 스키마 설계 → API 구현 → UI 연결 → 테스트)
- **독립적으로 검증 가능한 하위 단위**가 3개 이상 보임
- Acceptance Criteria가 **독립적인 체크포인트 여러 개**로 표현됨

**서브태스크가 불필요한 경우 (단일 이슈):**
- 단일 파일/함수 수정
- 버그 수정 (원인이 명확하고 단일 지점)
- 소규모 리팩토링
- 문서 업데이트

**판단을 사용자에게 투명하게 공유한다.** 예:

```
🤔 서브태스크 분해 판단

이 작업은 [백엔드 API + 프론트엔드 UI + 통합 테스트]의 3개 레이어를 건드리고,
각 레이어는 독립적으로 검증 가능해 보입니다. → 서브태스크 분해를 제안합니다.
```

또는:

```
🤔 서브태스크 분해 판단

이 작업은 단일 버그 수정(원인: <...>)으로 한 지점만 수정하면 됩니다.
→ 서브태스크 없이 단일 이슈로 생성하는 것을 제안합니다.
```

### Step 4: Propose Sub-task Breakdown (분해 필요한 경우)

Step 3에서 분해를 제안한 경우, 초안 테이블을 표시한다:

```
📋 서브태스크 초안 (<N>개)

| # | Summary                      | Type    | Priority | Depends on | Parallel? |
|---|------------------------------|---------|----------|------------|-----------|
| 1 | DB 스키마 마이그레이션       | Subtask | High     | -          | ✓        |
| 2 | 로그인 API 구현              | Subtask | High     | 1          | -        |
| 3 | 로그인 UI 컴포넌트           | Subtask | High     | 1          | ✓        |
| 4 | E2E 테스트 작성              | Subtask | Medium   | 2, 3       | -        |

범례:
- Depends on: 해당 번호 서브태스크가 완료되어야 착수 가능 (Blocks 링크로 등록됨)
- Parallel ✓: 동일 시점에 병렬 수행 가능 (blocker 없음 또는 모두 같은 레벨)
```

**설계 규약:**
- `Depends on`이 비어 있거나 동일 단계의 다른 서브태스크에 블록되지 않으면 `Parallel ✓`
- 의존성은 **`Blocks` 이슈 링크**로 저장된다. `init <parent-key>`가 이를 자동으로 읽어 "착수 가능" 분석에 활용.
- Priority는 부모의 priority보다 한 단계 낮게 기본 설정 (필요하면 개별 조정)

**사용자 확인 (`AskUserQuestion`):**
- 선택지: `그대로 진행` / `수정 요청` / `서브태스크 없이 단일 이슈로` / `취소`
- "수정 요청" 선택 시: 자유 입력으로 어떤 부분을 바꿀지 받은 뒤 초안 갱신, 다시 확인.

### Step 5: Final Preview

생성 직전에 전체 계획을 한 번 더 요약한다:

```
📦 생성 예정 이슈

## Parent Issue
- Project: PROJ
- Summary: <summary>
- Type: Task
- Priority: High
- Epic Link: PROJ-50 (optional)
- Labels: frontend, auth
- Components: Frontend
- Assignee: user@company.com
- Description: (요약 3~5줄)

## Sub-tasks (4개)
1. ...
2. ...
(생략된 경우 "서브태스크 없음")

## Issue Links (3개)
- PROJ-NEW-2 is blocked by PROJ-NEW-1 (Blocks)
- PROJ-NEW-3 is blocked by PROJ-NEW-1
- PROJ-NEW-4 is blocked by PROJ-NEW-2, PROJ-NEW-3
```

**최종 확인 (`AskUserQuestion`):** `생성 진행` / `수정` / `취소`

"취소" 선택 시: 아무것도 만들지 않고 종료.
"수정" 선택 시: 어느 단계로 돌아갈지 질문 (Phase A/B/C/서브태스크 초안).

### Step 6: Create in Jira

**6-1. 상위 이슈 생성**

`additional_fields`를 **파이썬 dict가 아니라 JSON 문자열**로 구성한다.

호출 예시 (의사코드):
```
additional_fields_dict = {}
if priority: additional_fields_dict["priority"] = {"name": priority}
if labels:   additional_fields_dict["labels"] = labels_list
if epic_key: additional_fields_dict["parent"] = epic_key   # team-managed Cloud에서 epic link로 동작

additional_fields_json = json.dumps(additional_fields_dict)   # ← 반드시 직렬화

mcp__atlassian__jira_create_issue(
  project_key = PROJECT_KEY,
  summary     = "<summary>",
  issue_type  = "Task",
  description = "<markdown description>",
  assignee    = "<email or None>",      # top-level 전용!
  components  = "Frontend,API",          # CSV string
  additional_fields = additional_fields_json
)
```

결과에서 **새 이슈 키**(`PROJ-NEW`)를 파싱해 저장한다.

**6-2. 에픽 연결 검증 (optional)**

상위 이슈가 에픽에 연결되어야 하고 `additional_fields`에 `parent`로 넣었다면, 생성 결과에서 epic link가 설정됐는지 확인:
- `mcp__atlassian__jira_get_issue`로 새 이슈 재조회
- Epic Link custom field 또는 parent field에 에픽 키가 있는지 확인
- **없으면 fallback**: `mcp__atlassian__jira_link_to_epic(issue_key=PROJ-NEW, epic_key=EPIC-KEY)` 호출
- 이것도 실패하면 사용자에게 경고 (이슈는 만들어졌지만 에픽 연결 실패) 후 계속 진행.

**6-3. 서브태스크 생성 (순차 루프)**

**`jira_batch_create_issues`를 쓰지 말고** 각 서브태스크에 대해 `jira_create_issue`를 순차 호출:

```
for subtask in subtasks:
    add_fields = {"parent": PARENT_KEY, "priority": {"name": subtask.priority}}
    if subtask.labels: add_fields["labels"] = subtask.labels
    add_fields_json = json.dumps(add_fields)

    try:
        result = jira_create_issue(
            project_key = PROJECT_KEY,
            summary     = subtask.summary,
            issue_type  = "Subtask",
            description = subtask.description,
            additional_fields = add_fields_json
        )
    except Exception as e:
        # Fallback: project doesn't support Subtask type
        result = jira_create_issue(
            project_key = PROJECT_KEY,
            summary     = subtask.summary,
            issue_type  = "Task",
            description = subtask.description,
            additional_fields = add_fields_json   # parent는 그대로 유효
        )

    subtask.created_key = extract_key(result)
```

각 생성 후 로컬 테이블에 `(draft_index → created_key)` 매핑을 쌓는다.

**6-4. 의존성 링크 생성**

먼저 링크 타입 이름을 검증:
```
types = mcp__atlassian__jira_get_link_types(name_filter="block")
# 결과에서 name이 "Blocks"인 항목을 찾아 사용 (다른 인스턴스는 다를 수 있음)
blocks_type_name = <matched .name>
```

서브태스크의 `Depends on` 관계를 이슈 링크로 변환:
- "#3은 #1에 의존" (즉 "#1이 #3을 블록") →
  - `link_type = "Blocks"` (위에서 찾은 이름)
  - `outward_issue_key = subtasks[1].created_key`   # blocker
  - `inward_issue_key  = subtasks[3].created_key`   # blocked
- 하나씩 `mcp__atlassian__jira_create_issue_link` 호출

**6-5. 결과 검증**

상위 이슈와 모든 서브태스크를 `mcp__atlassian__jira_get_issue`로 한 번씩 재조회하여:
- `issuetype`, `priority`, `parent`, 필요한 `labels`가 설정되었는지 확인
- 불일치가 있으면 사용자에게 경고 (알려지지 않은 additional_fields 키가 silent skip되는 것을 방지)

### Step 7: Post Creation Comment (선택)

상위 이슈에 요약 코멘트 게시:

```markdown
## Created via /jira-task create

이 이슈는 Claude Code의 `/jira-task create`로 생성되었습니다.

**요약:**
- 서브태스크 <N>개 함께 생성됨
- 의존성 링크 <M>개 등록됨
- 병렬 실행 가능 서브태스크: <병렬 개수>개

**Next:** `/jira-task init <PARENT-KEY>` 로 worktree 환경 세팅
```

서브태스크에는 코멘트 게시 생략 (노이즈 방지).

### Step 8: Completion Summary

```
─────────────────────────────────────────
✅ Create Complete

**Parent Issue**
  <JIRA_URL>/browse/PROJ-NEW
  PROJ-NEW — <summary>  [Type: Task, Priority: High]

**Sub-tasks** (<N>개)
  1. PROJ-NEW-1 — DB 스키마 마이그레이션  [High, parallel ✓]
  2. PROJ-NEW-2 — 로그인 API 구현          [High, blocked by #1]
  3. PROJ-NEW-3 — 로그인 UI 컴포넌트       [High, blocked by #1, parallel with #2]
  4. PROJ-NEW-4 — E2E 테스트 작성          [Medium, blocked by #2, #3]

**Links 등록**: Blocks 링크 <M>개

**Next Steps:**
- `/jira-task init PROJ-NEW` — 서브태스크 기반 worktree 세팅 (착수 가능 분석 자동)
- 또는 `/jira-task start PROJ-NEW` — 부모 이슈 작업 바로 시작
─────────────────────────────────────────
```

`.jira-context.json`은 **건드리지 않는다** (새 이슈는 아직 활성 작업이 아님 — 사용자가 별도로 `init`/`start`를 불러야 한다).

## Error Handling

- **MCP 연결 실패**: Step 0에서 종료, `/jira setup` 안내.
- **프로젝트 키 미확정**: Phase A에서 `jira_get_all_projects`로 선택지 제공. 실패 시 사용자에게 수동 입력 요청.
- **`jira_create_issue` 실패**:
  - `Issue type is a sub-task but parent issue key or id not specified` → `parent` 필드 누락 → 재시도 전에 입력 확인
  - `Issue type X does not exist` → 프로젝트 설정에 해당 타입 없음 → Task로 폴백
  - 인증 오류 (401/403) → 토큰 만료 안내
  - 필드 검증 오류 → 원본 메시지를 사용자에게 그대로 보여주고 수정 요청
- **Silent field skip 감지**: Step 6-5의 재조회에서 기대한 필드(priority, labels 등)가 비어 있으면 경고.
- **서브태스크 일부 실패**: 생성된 것은 유지하고, 실패 목록을 사용자에게 보여준 뒤 재시도 여부 확인. **자동 롤백은 하지 않는다** (이미 만들어진 이슈를 자동 삭제하면 위험).
- **링크 생성 실패**: 링크 타입 이름이 인스턴스 커스텀일 수 있음 → `jira_get_link_types`로 전체 목록을 보여주고 사용자에게 선택하도록 fallback.

## Output Conventions

- 모든 Q&A는 한국어
- Jira 이슈 본문(description)은 한국어 (코드/키워드는 영어 유지)
- Jira 코멘트는 기존 컨벤션에 따라 섹션 제목 영어, 본문 한국어
- 테이블 출력 시 파이프 정렬 유지

## Non-goals

- worktree/branch 생성 ❌ (그건 `init`/`start`의 책임)
- `.jira-context.json` 수정 ❌
- 구현/테스트/리뷰 단계 수행 ❌
- 기존 이슈 수정 ❌ (`jira_update_issue`는 이 스킬 범위 밖)
