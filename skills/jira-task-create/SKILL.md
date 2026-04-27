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

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력). 추가: `AskUserQuestion` 질문/선택지, 생성 이슈 본문(summary/description)도 한국어. 이슈 키, 필드명(priority/labels), JSON 키는 영어 유지.

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
- **Story·Epic 타입 비활성화 주의**: 일부 프로젝트는 Story 타입을 비활성화하거나 Epic 타입을 가공한다(특히 company-managed 마이그레이션 환경). 실패 시 본 스킬의 매핑 폴백 규칙(`Story → Task + parent`, `Epic → Task + label epic-substitute`)대로 처리한다.
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

1. `$ARGUMENTS`에서 토큰을 추출한다.
   - `--from-requirements <path>` 토큰을 먼저 인식한다 (위치 무관, 단 한 번만 허용).
     - 토큰을 발견하면 `importMode = true`, `importPath = <path>`로 설정한다.
     - `<path>`가 누락되었거나 다음 토큰이 또 다른 플래그/옵션이면 **E1**(경로 누락)으로 처리한다.
   - 나머지 텍스트는 자연어 힌트(`topic`)로 보존한다 (비어 있어도 OK).
2. **인자 충돌 처리**: `importMode = true`이면서 자연어 힌트가 동시에 존재하는 경우, **import를 우선**한다.
   - 자연어 힌트는 Epic description의 추가 컨텍스트로만 사용한다.
   - 자동 서브태스크 분해(Step 3/4)는 import 모드에서 절대 동작하지 않는다 (회귀 금지).
3. Jira MCP 연결 확인: `mcp__atlassian__jira_get_user_profile` 호출. 실패하면 "/jira setup을 먼저 실행하세요" 안내 후 종료.

`importMode` 플래그는 이후 단계 진행 흐름의 분기점이다. `importMode = true`이면 Step 1.5를 거쳐 Step 1~4를 skip하고 Step 5로 직행한다.

#### `--from-requirements` 인자 형식

- 형식: `/jira-task create --from-requirements <path>`
- `<path>`: 요구사항 문서의 상대 또는 절대 경로 (예: `docs/requirements/sample.requirements.md`)
- 상대 경로는 워크트리/리포 루트를 기준으로 해석한다.
- 이 형식은 `jira-task-discover` 스킬 Step 6 Completion Summary에서 안내하는 명령과 동일해야 한다 (정합성 약속).

### Step 1.5: Parse Requirements Document (★ import 모드 전용)

**실행 조건**: `importMode = true` (Step 0에서 결정). `importMode = false`이면 본 단계를 통째로 skip하고 Step 1로 이동한다.

import 모드에서는 본 단계가 자동 분해 판단(Step 3/4)을 대체한다. 트리는 여기서 확정되며, Step 5(Final Preview)로 직행한다.

#### Step 1.5-1. 파일 검증

1. `Read` 도구로 `importPath` 파일을 연다.
   - 파일 부재 → **E2** 처리 후 종료.
   - 파일 크기 1MB 초과 → 경고 + `AskUserQuestion`으로 진행 confirm (discover 패턴과 일관).
2. 본문이 빈 문자열이거나 공백만 있음 → **E3** 처리 후 종료.

#### Step 1.5-2. `Proposed Issue Breakdown` 섹션 추출

1. 본문에서 `## Proposed Issue Breakdown` 헤딩을 정확히 찾는다 (대소문자 정확 매칭).
2. 헤딩이 없으면 → **E4** 처리 (자연어 모드 폴백 제안 후 사용자 confirm).
3. 헤딩 발견 후 다음 `## ` 헤딩 또는 EOF 직전까지의 텍스트를 섹션 본문으로 잘라낸다.

#### Step 1.5-3. 트리 파싱 (상태머신 기반)

**입력 트리 형식 (표준):**

```markdown
- **Epic**: <에픽 1줄 요약>
  - **Story 1**: <스토리 요약>
    - Sub-task 1.1: <서브태스크 요약>
    - Sub-task 1.2: <서브태스크 요약> (blocks: 1.1)
  - **Story 2**: <스토리 요약>
    - Sub-task 2.1: <서브태스크 요약>
```

**파싱 규칙:**

- **들여쓰기**: 2-space 또는 4-space 모두 허용. 같은 문서 내 혼용 시 첫 자식의 들여쓰기 폭을 기준으로 삼고, 그와 다른 라인이 등장하면 경고 (**E10**). 파싱 자체가 불가하면 종료.
- **불릿 기호**: `-` 또는 `*` 모두 허용. 같은 문서 내 혼용 허용.
- **노드 식별**:
  - `**Epic**:` 또는 `Epic:` 으로 시작 → **Epic 노드** (트리 루트)
  - `**Story <N>**:` 또는 `Story <N>:` → **Story 노드**
  - `Sub-task <N>.<M>:` 또는 `Subtask <N>.<M>:` → **Subtask 노드**
  - 일치하지 않는 라인은 무시(주석으로 간주)하되 디버그 로그 1줄을 남긴다.
- **부모 매핑**:
  - Epic은 트리 1개당 1개. 0개이면 **E6** 처리 (파일명 슬러그 기반 기본 Epic 자동 생성 + confirm).
  - Story `<N>`의 부모는 Epic.
  - Subtask `<N>.<M>`의 부모는 Story `<N>`.
  - Story가 0개이고 Subtask만 존재하는 경우 → 보강 입력 요청 또는 종료 (**E5** 인접).
- **`(blocks: <ref>)` 표기**:
  - 위치: Story 또는 Subtask 라인의 끝.
  - 참조 형식: `<N>` (같은 Epic 아래의 Story 인덱스) 또는 `<N>.<M>` (같은 Story 아래의 Subtask 인덱스).
  - 같은 부모 아래 sibling 참조만 허용. 다른 Story의 Subtask 참조는 **E7** 처리 (해당 링크 1건만 skip + 경고).
  - 다중 참조: `(blocks: 1.1, 1.2)` 형식 허용.

#### Step 1.5-4. 파싱 결과 정리 (`ImportPayload`)

파싱 결과를 다음과 같은 내부 표 구조로 정리한다 (개념적 자료 구조 — LLM이 머릿속에서 들고 있는다):

- `epic`: `{summary, description?, priority?, labels?}` — 노드 1개
- `stories[]`: 각 항목은 `{index, summary, description?, priority?, labels?, subtasks[]}`
  - `subtasks[]`: 각 항목은 `{index, summary, description?, priority?, labels?, blocks: [<ref>]}`
- `links[]`: blocks 관계 리스트 `{outwardRef, inwardRef}` (트리 인덱스 표기, 생성 후 실제 키로 해석)

> **priority/labels 추출 규칙**: 표준 트리 형식(L162-169)에는 priority/labels 표기 문법이 없다. 따라서 `priority`/`labels`는 항상 비어 있는 옵셔널 필드로 다루며, **트리에 표기가 없으면 priority는 항상 `Medium`을 사용한다** (Step 6의 `or "Medium"` 폴백). labels는 폴백 시에만 자동으로 채워진다 (예: `epic-substitute`).

#### Tree → Issue Mapping

| 트리 노드 | Jira issue_type | parent 필드 | 폴백 |
|-----------|----------------|------------|------|
| Epic | `Epic` | (없음) | 실패 시 `Task` + label `epic-substitute` |
| Story | `Story` | Epic-KEY | 실패 시 `Task` + parent=Epic-KEY |
| Sub-task | `Subtask` | Story-KEY | 실패 시 `Task` + parent=Story-KEY |

**의존성 표현:**
- `(blocks: ...)` 표기 → `link_type = "Blocks"` (실제 이름은 `jira_get_link_types`로 조회).
- "A가 B를 블록한다" → `outward_issue_key = A, inward_issue_key = B`.
- 트리 인덱스 → 실제 키 매핑 테이블은 Step 6에서 노드 생성 직후 누적(`draft_index → created_key`).

파싱 성공 시 Step 5(Final Preview)로 점프한다. Step 1~4는 skip한다.

### Step 1: Assess Context Sufficiency

> **import 모드(Step 1.5에서 importMode=true)에서는 본 단계를 skip하고 Step 5로 직행한다.** 컨텍스트 평가는 import 트리가 모든 필수 정보를 이미 담고 있으므로 불필요하다.

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

> **import 모드에서는 본 단계를 skip한다.** 트리는 Step 1.5에서 이미 확정되었다.

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
   fields="summary,status,issuetype"
   limit=10
   ```
   (`JIRA_DEFAULT_PROJECT` 있으면 반드시 포함)
2. 상위 10개를 테이블로 표시 (`Key`, `Summary`, `Status`)
3. `AskUserQuestion`으로 에픽 키 선택 (또는 "위 목록에 없음" 선택지)
4. "위 목록에 없음" 시 → 사용자에게 에픽 키 직접 입력 요청, 또는 에픽 연결 건너뛰기

### Step 3: Decide Sub-task Split (스킬 자동 판단)

> **import 모드(Step 1.5에서 importMode=true)에서는 본 단계를 skip하고 Step 5로 직행한다.** 트리는 Step 1.5에서 이미 확정되었다. import 모드에서 자동 분해 판단은 절대 동작하지 않는다 (회귀 금지).

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

> **import 모드(Step 1.5에서 importMode=true)에서는 본 단계를 skip하고 Step 5로 직행한다.** 트리는 Step 1.5에서 이미 확정되었다.

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

생성 직전에 전체 계획을 한 번 더 요약한다.

#### Default 모드 (자연어 흐름)

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

#### Import 모드 (`--from-requirements`) — Preview에 출처 표기 필수

import 모드에서는 Preview를 출력하기 **직전**에, 트리에서 추출한 모든 노드(Epic + Stories + Subtasks)의 summary를 **일괄 JQL로 중복 검사**한다 (예: `project = <PROJECT_KEY> AND summary in ("...", "...", ...)`). 일치한 summary가 1건 이상 있으면 Preview 본문에 `## Duplicate Warning` 블록으로 기존 이슈 키 목록을 함께 표시하고, 최종 확인 단계에서 **E8** 시나리오대로 `AskUserQuestion`(`그대로 진행` / `취소`)을 노출한다. default 모드에서는 기존대로 Step 6 직전 1건씩 검사한다.

import 모드에서는 Preview 첫 줄에 **`Source:` 라인을 반드시 표시**하고, default 모드에 없는 `## Stories (N개)` 블록을 추가한다:

```
📦 생성 예정 이슈 (import)

Source: docs/requirements/<slug>.requirements.md

## Epic
- Project: PROJ
- Summary: <Epic summary>
- Type: Epic
- Priority: Medium
- Description: (요구사항 문서에서 발췌 + 자연어 힌트 보강)

## Stories (2개)
1. <Story 1 summary>  [Type: Story, parent: <Epic 예정>]
2. <Story 2 summary>  [Type: Story, parent: <Epic 예정>]

## Sub-tasks (4개)
1.1 <Subtask 1.1 summary>  [parent: Story 1]
1.2 <Subtask 1.2 summary>  [parent: Story 1, blocks: 1.1]
2.1 <Subtask 2.1 summary>  [parent: Story 2]
2.2 <Subtask 2.2 summary>  [parent: Story 2]

## Issue Links (1개)
- (Subtask 1.2) is blocked by (Subtask 1.1) (Blocks)
```

import 모드에서는 트리 인덱스(`1.1`, `2.2` 등)를 그대로 표시한다 (실제 키는 생성 후 채워진다).

**최종 확인 (`AskUserQuestion`):** `생성 진행` / `수정` / `취소`

"취소" 선택 시: 아무것도 만들지 않고 종료.
"수정" 선택 시: import 모드에서는 `트리 재파싱` / `자연어 모드 전환` / `자유 편집` 중 선택. default 모드에서는 어느 단계(Phase A/B/C/서브태스크 초안)로 돌아갈지 질문.

### Step 6: Create in Jira

> import 모드와 default 모드의 호출 시퀀스 차이:
> - **default**: 6-1 (Parent) → 6-2 (Epic 연결 검증) → 6-3 (Subtask 루프) → 6-4 (링크) → 6-5 (검증)
> - **import**: 6-1 (Epic 직접 생성) → 6-2 **skip** → 6-1b (Story 루프) → 6-3 (Subtask 루프, parent=Story) → 6-4 (링크) → 6-5 (검증)

**6-1. 상위 이슈 생성**

`additional_fields`를 **파이썬 dict가 아니라 JSON 문자열**로 구성한다.

호출 예시 (의사코드 — default 모드):
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

**Import 모드 (Epic 생성):**

import 모드에서는 본 단계가 **Epic을 직접 생성**한다 (default 모드는 일반 Task/Story).

```
add_fields = {"priority": {"name": epic.priority or "Medium"}}
if epic.labels: add_fields["labels"] = epic.labels
add_fields_json = json.dumps(add_fields)

try:
    result = jira_create_issue(
      project_key = PROJECT_KEY,
      summary     = epic.summary,
      issue_type  = "Epic",
      description = epic.description,
      additional_fields = add_fields_json
    )
except Exception as e:
    # Fallback: project doesn't support Epic type
    fallback_fields = json.loads(add_fields_json)
    fallback_fields["labels"] = (fallback_fields.get("labels") or []) + ["epic-substitute"]
    result = jira_create_issue(
      project_key = PROJECT_KEY,
      summary     = epic.summary,
      issue_type  = "Task",
      description = epic.description,
      additional_fields = json.dumps(fallback_fields)
    )

epic.created_key = extract_key(result)   # → 이후 Story의 parent
```

폴백을 사용한 경우 사용자에게 즉시 알린다 (예: "프로젝트가 Epic 타입을 비활성화했습니다. `Task` + label `epic-substitute`로 폴백합니다").

**6-1b. Story 생성 루프 (★ import 모드 신설 단계)**

import 모드에서는 Subtask 루프(6-3) **이전**에 Story 루프를 먼저 돌린다. 각 Story는 `parent = epic.created_key`로 묶인다.

```
for story in import_payload.stories:
    add_fields = {
      "parent": epic.created_key,
      "priority": {"name": story.priority or "Medium"}
    }
    if story.labels: add_fields["labels"] = story.labels
    add_fields_json = json.dumps(add_fields)

    try:
        result = jira_create_issue(
          project_key = PROJECT_KEY,
          summary     = story.summary,
          issue_type  = "Story",
          description = story.description,
          additional_fields = add_fields_json
        )
    except Exception as e:
        # Fallback: project doesn't support Story type
        result = jira_create_issue(
          project_key = PROJECT_KEY,
          summary     = story.summary,
          issue_type  = "Task",
          description = story.description,
          additional_fields = add_fields_json   # parent=Epic-KEY는 그대로 유효
        )

    story.created_key = extract_key(result)
```

각 Story 생성 직후 로컬 매핑 테이블에 `(story.index → story.created_key)`를 누적한다.

**6-2. 에픽 연결 검증 (default 모드 전용)**

> **import 모드에서는 본 단계를 skip한다.** Epic을 본 스킬이 직접 만들었으므로 별도 연결 검증이 불필요하다.

상위 이슈가 에픽에 연결되어야 하고 `additional_fields`에 `parent`로 넣었다면, 생성 결과에서 epic link가 설정됐는지 확인:
- `mcp__atlassian__jira_get_issue`로 새 이슈 재조회 (`fields="summary,parent,issuetype"`, `comment_limit=0`)
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

**Import 모드의 PARENT_KEY 결정:**
- import 모드에서 `PARENT_KEY`는 default 모드처럼 단일 값이 아니라 **Subtask 트리 인덱스 `<N>.<M>`의 `<N>`이 가리키는 Story의 `created_key`** 이다.
- 즉 `parent = stories[subtask.index.<N>].created_key`.
- Story 비활성으로 폴백된 경우(`Task` + parent=Epic-KEY)에도 Subtask의 `parent`는 폴백된 Story 키를 그대로 가리킨다 (그 Task 자체가 부모 노드 역할).

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

**Import 모드의 `(blocks: <ref>)` 변환:**

- 트리 파싱 결과 `links[]`(Step 1.5-4)에 누적된 각 항목 `{outwardRef, inwardRef}`를 처리한다.
- 참조 키 해석:
  - `<N>` 단독 → Story 인덱스 → `stories[N].created_key`
  - `<N>.<M>` → Subtask 인덱스 → `subtasks[N.M].created_key`
- 같은 부모 아래 sibling 참조만 허용 (Step 1.5-3 규칙). 위반 참조는 **E7** 처리 후 해당 1건 skip + 경고.

> **방향성 주의 (`(blocks: X)` 의미)**:
> 노드 N의 라인 끝에 `(blocks: X)`가 붙어 있으면, **N이 X를 블록한다**는 뜻이 아니라 **N이 X에 의해 블록된다**(N is blocked by X)는 뜻이다.
> 따라서 `outward_issue_key = X.created_key` (blocker), `inward_issue_key = N.created_key` (blocked).

**6-5. 결과 검증**

상위 이슈와 모든 서브태스크를 `mcp__atlassian__jira_get_issue`로 한 번씩 재조회하여:
- **Context optimization**: `fields="summary,issuetype,priority,parent,labels,issuelinks,status"`, `comment_limit=0` (검증에 필요한 최소 필드만; `(blocks: ...)` 링크 검증을 위해 issuelinks 포함)
- `issuetype`, `priority`, `parent`, 필요한 `labels`가 설정되었는지 확인
- 불일치가 있으면 사용자에게 경고 (알려지지 않은 additional_fields 키가 silent skip되는 것을 방지)

import 모드에서는 Epic / Story / Subtask 모두 재조회 대상이며, `(blocks: ...)` 링크도 `jira_get_issue`로 inward/outward 관계가 실제로 생성됐는지 확인한다.

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

### 공통 시나리오

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

### Import 모드 (`--from-requirements`) 시나리오

| # | 시나리오 | 처리 전략 |
|---|---------|----------|
| E1 | `--from-requirements`만 있고 경로 누락 | `AskUserQuestion`으로 경로 요청. 답변 없으면 종료. |
| E2 | 지정 경로의 파일 부재 | 에러 메시지(경로 표시) + 종료. 자동 재시도 없음. |
| E3 | 파일은 있으나 빈 파일 | 에러 메시지 + 종료. |
| E4 | `Proposed Issue Breakdown` 섹션 부재 | 에러 메시지 + `AskUserQuestion`으로 자연어 모드 폴백 제안. confirm 시 default 흐름(Step 1)으로 전환. |
| E5 | 트리 노드 0개 (Epic 없음 + Story 없음) | 보강 입력 요청 또는 종료. |
| E6 | Epic 없이 Story부터 시작 | 기본 Epic 자동 생성(summary는 파일명/슬러그) 후 `AskUserQuestion`으로 confirm. confirm 거부 시 종료. |
| E7 | `(blocks: <ref>)`가 존재하지 않는 ref 또는 sibling 외 ref 참조 | 해당 링크 1건만 skip + 경고. 나머지 생성/링크는 정상 진행. |
| E8 | 동일 summary의 이슈가 이미 존재 (project-wide JQL 검색) | import 모드에서는 Step 5 Preview 직전에 모든 노드 summary를 일괄 JQL로 검사하고 결과를 Preview의 `## Duplicate Warning` 블록에 포함. default 모드에서는 Step 6 직전에 1건씩 검사. 두 모드 모두 일치 시 경고 + `AskUserQuestion`으로 확정 진행/취소 선택. 자동 차단하지 않는다 (의도된 중복 등록 가능성 보존). |
| E9 | Epic/Story 타입 비활성 프로젝트 | 매핑 표의 폴백 규칙대로 `Task` + `parent` 또는 + label `epic-substitute`로 폴백. 사용자에게 폴백 사용을 즉시 알린다. |
| E10 | 트리 파싱 중 들여쓰기 혼용 감지 | 경고 출력 후 첫 자식 들여쓰기 기준으로 진행. 파싱 자체가 불가하면 종료. |

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
