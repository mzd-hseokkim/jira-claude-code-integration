---
name: jira-task-create
description: "Interactively create a new Jira issue (and optional sub-tasks) from conversation context — gathers details via dialog and creates in Jira. Triggers: jira-task create, create task, new task; Jira 이슈 만들어, 태스크 등록, 이슈 생성."
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

**중요**: `Read skills/jira-task-create/refs/mcp-schema.md` — Jira API 파라미터 규칙, 폴백 전략, 방향성 주의사항을 반드시 숙지 후 Step 6을 진행한다.

## Overview

신규 Jira 이슈 생성 단계 (PDCA의 `init` 이전). 완료 후 `/jira-task init <parent-key>` 또는 `start <key>`로 합류.

핵심:
- **컨텍스트 우선**: 대화에 충분한 정보가 있으면 질문 최소화, 부족하면 `AskUserQuestion` 배치 질문
- **자동 서브태스크 판단**: 스킬이 분해 필요 여부 판단 → 초안 제안 → 사용자 확인
- **의존성**: 서브태스크 간 `Blocks` 이슈 링크 (없으면 병렬, `jira-task-init`의 착수 분석과 호환)
- **에픽 연결**: 상위 이슈를 기존 에픽에 연결 가능

## Prerequisites

- Jira MCP 서버 (`atlassian`) 연결됨 — 미연결 시 `/jira setup` 안내 후 종료
- `JIRA_DEFAULT_PROJECT` 환경변수가 있으면 프로젝트 키로 사용, 없으면 Step 2에서 사용자에게 묻는다

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

**`--from-requirements` 인자 형식:**
- 형식: `/jira-task create --from-requirements <path>`
- `<path>`: 요구사항 문서의 상대 또는 절대 경로 (예: `docs/requirements/sample.requirements.md`)
- 상대 경로는 워크트리/리포 루트를 기준으로 해석한다.

### Step 1.5: Parse Requirements Document (★ import 모드 전용)

**실행 조건**: `importMode = true`. `importMode = false`이면 본 단계를 skip하고 Step 1로 이동한다.

**필수**: `Read skills/jira-task-create/refs/from-requirements-mode.md` — 파일 검증·섹션 추출·트리 파싱·ImportPayload 구성·Tree→Issue Mapping 표 전체를 이 파일에서 확인한다.

파싱 성공 시 Step 5(Final Preview)로 점프한다. Step 1~4는 skip한다.

### Step 1: Assess Context Sufficiency

> **import 모드에서는 본 단계를 skip하고 Step 5로 직행한다.**

현재 **대화 컨텍스트 + 초기 힌트**를 합쳐서 아래 필수 정보를 채울 수 있는지 평가한다:

**필수 정보:**
- [ ] **Project key** — `JIRA_DEFAULT_PROJECT` 환경변수 또는 대화에서 확인 가능?
- [ ] **Summary (제목)** — 명확히 유추 가능?
- [ ] **Description (무엇을/왜)** — 배경·목적·범위가 구체적인가?
- [ ] **Issue type** — Task/Story/Bug/Epic 중 명확한가? (기본값 Task 가능)
- [ ] **Priority** — 명시되었거나 합리적으로 기본값(`Medium`) 적용 가능?

**판단 기준:**
- 필수 정보 중 **2개 이상 부족** 또는 description이 한 줄 요약 수준 → **Step 2**로 진행
- 필수 정보가 대부분 충족 → **Step 3**로 직행하고, 부족한 것만 간단 확인

### Step 2: Gather Missing Info via AskUserQuestion (조건부)

> **import 모드에서는 본 단계를 skip한다.**

**Phase A — 상위 이슈 핵심 정보** (`AskUserQuestion` 1회, 여러 question 배치)

부족한 것만 선택적으로 포함:
1. **요약(Summary)**: 이슈 한 줄 제목
2. **이슈 타입**: `Task` / `Story` / `Bug` / `Epic` (기본 추천: 기능→Story, 단일→Task, 버그→Bug)
3. **Priority**: `Highest` / `High` / `Medium` / `Low` / `Lowest` (기본: `Medium`)
4. **프로젝트 키** (`JIRA_DEFAULT_PROJECT` 없을 때만): `jira_get_all_projects` 목록에서 선택

**Phase B — 설명 보강** (A 답변 후 설명이 여전히 부족하면)

`AskUserQuestion`으로 배경·AC 힌트·기술 접근·제외 범위 중 필요한 것만 질문.

**Phase C — 선택 정보** (A/B 완료 후)

Epic 연결 여부, Labels, Components, Assignee를 배치 질문.

**Epic 선택 서브 플로우** (사용자가 "기존 에픽 선택"한 경우):
1. JQL: `project = <PROJECT_KEY> AND issuetype = Epic AND status != Done ORDER BY created DESC` (limit=10)
2. 상위 10개 테이블 표시 후 `AskUserQuestion`으로 에픽 키 선택

### Step 3: Decide Sub-task Split (스킬 자동 판단)

> **import 모드에서는 본 단계를 skip하고 Step 5로 직행한다.**

수집된 정보를 바탕으로 **스킬이 직접** 서브태스크 필요 여부를 판단한다.

| 서브태스크 필요 | 서브태스크 불필요 |
|---|---|
| 여러 레이어 동시 수정 | 단일 파일/함수 수정 |
| 순차 단계가 명확히 구분됨 | 버그 수정 (단일 원인) |
| 독립 검증 가능 단위 3개 이상 | 소규모 리팩토링 / 문서 업데이트 |

판단 결과를 사용자에게 투명하게 공유 후 Step 4 또는 Step 5로 진행.

### Step 4: Propose Sub-task Breakdown (분해 필요한 경우)

> **import 모드에서는 본 단계를 skip하고 Step 5로 직행한다.**

초안 테이블 표시 (# / Summary / Type / Priority / Depends on / Parallel?).

**설계 규약:**
- `Depends on`이 비어 있으면 `Parallel ✓`
- 의존성은 **`Blocks` 이슈 링크**로 저장됨 (`init <parent-key>`가 착수 가능 분석에 활용)

**사용자 확인 (`AskUserQuestion`):** `그대로 진행` / `수정 요청` / `서브태스크 없이 단일 이슈로` / `취소`

### Step 5: Final Preview

생성 직전에 전체 계획을 한 번 더 요약한다.

**Default 모드:**

```
📦 생성 예정 이슈

## Parent Issue
- Project / Summary / Type / Priority / Epic Link / Labels / Components / Assignee
- Description: (요약 3~5줄)

## Sub-tasks (N개) / Issue Links (M개)
```

**Import 모드 (`--from-requirements`):**

Preview 출력 **직전**에 모든 노드 summary를 일괄 JQL로 중복 검사. 일치 시 `## Duplicate Warning` 블록 포함.

```
📦 생성 예정 이슈 (import)

Source: docs/requirements/<slug>.requirements.md

## Epic / ## Stories (N개) / ## Sub-tasks (M개) / ## Issue Links (K개)
```

**최종 확인 (`AskUserQuestion`):** `생성 진행` / `수정` / `취소`

### Step 6: Create in Jira

> 모드별 호출 시퀀스:
> - **default**: 6-1 (Parent) → 6-2 (Epic 연결 검증) → 6-3 (Subtask 루프) → 6-4 (링크) → 6-5 (검증)
> - **import**: 6-1 (Epic 생성) → 6-2 **skip** → 6-1b (Story 루프) → 6-3 (Subtask 루프) → 6-4 (링크) → 6-5 (검증)

**6-1. 상위 이슈 생성**

`additional_fields`는 **JSON 문자열**로 직렬화. priority/labels/epic_key를 dict에 조립 후 `json.dumps()`.

폴백 규칙 (mcp-schema.md 참고):
- Epic 타입 실패 → `Task` + label `epic-substitute`
- Story 타입 실패 → `Task` + parent=Epic-KEY
- Subtask 타입 실패 → `Task` + parent=Story-KEY

폴백 사용 시 사용자에게 즉시 알린다.

**6-1b. Story 생성 루프 (★ import 모드 전용)**

각 Story에 `parent = epic.created_key` 설정. 생성 직후 `(story.index → story.created_key)` 누적.

**6-2. 에픽 연결 검증 (default 모드 전용)**

`jira_get_issue`로 재조회 → epic link 미설정 시 `jira_link_to_epic` 폴백 → 이것도 실패 시 경고 후 계속.

**6-3. 서브태스크 생성 (순차 루프)**

각 서브태스크에 `jira_create_issue` 개별 호출. import 모드에서 PARENT_KEY = 해당 Story의 `created_key`.

**6-4. 의존성 링크 생성**

`jira_get_link_types(name_filter="block")`로 "Blocks" 타입명 확인 후 `jira_create_issue_link` 호출.

방향성: "A가 B를 블록" → `outward_issue_key=A`, `inward_issue_key=B`.

**Import 모드의 `(blocks: <ref>)` 변환**: `<N>` → Story 키, `<N>.<M>` → Subtask 키. E7 위반 시 해당 링크 skip + 경고.

**6-5. 결과 검증**

모든 이슈를 `jira_get_issue`로 재조회 (`fields="summary,issuetype,priority,parent,labels,issuelinks,status"`, `comment_limit=0`). 불일치 시 경고.

### Step 7: Post Creation Comment (선택)

상위 이슈에 요약 코멘트 게시 (서브태스크 개수, 링크 개수, 병렬 가능 개수, Next 안내). 서브태스크에는 코멘트 생략.

### Step 8: Completion Summary

```
─────────────────────────────────────────
✅ Create Complete

**Parent Issue**: <JIRA_URL>/browse/PROJ-NEW — <summary>  [Type, Priority]
**Sub-tasks** (N개): 각 이슈 키 + summary + 병렬/블록 표시
**Links 등록**: Blocks 링크 M개

**Next Steps:**
- `/jira-task init PROJ-NEW` — 서브태스크 기반 worktree 세팅
- 또는 `/jira-task start PROJ-NEW` — 부모 이슈 작업 바로 시작
─────────────────────────────────────────
```

`.jira-context.json`은 건드리지 않는다 (새 이슈는 아직 활성 작업이 아님).

## Error Handling

**공통**: MCP 연결 실패 → Step 0 종료 + `/jira setup` 안내. `jira_create_issue` 실패 → 타입 미존재 시 Task 폴백, 인증 오류 시 토큰 만료 안내, 필드 오류 시 원본 메시지 표시. 서브태스크 일부 실패 → 성공 것 유지, 실패 목록 표시, 재시도 confirm (자동 롤백 없음).

| # | 시나리오 | 처리 |
|---|---------|------|
| E1 | `--from-requirements` 경로 누락 | `AskUserQuestion`으로 경로 요청 |
| E2 | 지정 경로 파일 부재 | 에러 + 종료 |
| E3 | 빈 파일 | 에러 + 종료 |
| E4 | `Proposed Issue Breakdown` 섹션 부재 | 자연어 모드 폴백 제안 (`AskUserQuestion`) |
| E5 | 트리 노드 0개 | 보강 입력 요청 또는 종료 |
| E6 | Epic 없이 Story만 존재 | 기본 Epic 자동 생성 + confirm |
| E7 | sibling 외 `(blocks: ...)` 참조 | 해당 링크 skip + 경고 |
| E8 | 동일 summary 이슈 존재 | Preview에 `## Duplicate Warning` + 진행/취소 confirm |
| E9 | Epic/Story 타입 비활성 | Task + parent 또는 + label `epic-substitute` 폴백, 즉시 알림 |
| E10 | 트리 들여쓰기 혼용 | 경고 + 첫 자식 기준 진행 (불가 시 종료) |

**Non-goals**: worktree/branch 생성, `.jira-context.json` 수정, 구현/테스트/리뷰 수행, 기존 이슈 수정.
