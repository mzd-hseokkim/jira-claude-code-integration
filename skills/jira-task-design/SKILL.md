---
name: jira-task-design
description: Generate a design document for a Jira task. Analyzes the codebase, references the planning document, then generates a structured design document. Use when user says "design task", "create design", "jira-task design", "설계 문서", "디자인 문서", or wants to design the implementation of a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_add_comment
---

# jira-task-design: Generate Design Document

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Workflow

### Step 1: Check Prerequisites

1. Check if `docs/plan/<TASK-ID>.plan.md` exists
   - If yes, read it for context
   - If no, suggest running `/jira-task plan <TASK-ID>` first (but proceed if user wants)
2. **Cache-first**: `.jira-context.json`의 `cachedIssue`를 먼저 확인 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 `mcp__atlassian__jira_get_issue` 호출 (`fields="summary,status,description,labels,issuetype,parent"`, `comment_limit=0`) 후 결과를 `cachedIssue`에 갱신.

### Step 1.5: Extract Plan Inputs (필수)

plan 문서가 있는 경우, design의 입력으로 명시적으로 소비할 항목을 추출한다:

1. **Open Items**: plan의 `## Open Items` 섹션 전체. 각 항목은 design에서 다음 중 하나로 처리:
   - `resolved`: design에서 답을 정함
   - `deferred`: impl 또는 후속 단계로 추가 이월 (사유 명시 필수)
   - `out-of-scope`: 본 task 범위 밖으로 결정 — Out of Scope 섹션에도 반영
2. **Acceptance Criteria**: plan의 모든 AC를 추출. design의 AC↔구현 매핑 표(Plan Inputs 섹션)와 Test Plan의 AC 매핑 표(Test Plan 섹션) 둘 다 채워야 한다 — 전자는 *구현 위치*, 후자는 *검증 방법*.
3. **Source Requirements / Goal Coverage**: plan에 있는 경우 참고. design이 plan의 Goal Coverage를 깨지 않는지 확인 (예: plan에서 만족하기로 한 Goal이 design에서 누락되면 Open Items로 이월).
4. **Task Breakdown 규모 추정**: plan의 task별 규모(S/M/L)를 design의 Implementation Plan 규모와 대조. 어긋나면 Open Items에 명시.

plan이 없는 경우(`docs/plan/<TASK-ID>.plan.md` 부재): Plan Inputs 섹션은 `N/A — plan 생략 (출처: <Jira issue>)`로 표기하고, Plan Open Items / AC↔구현 매핑 표는 Jira description의 AC 또는 사용자 협의 내용을 기반으로 채운다.

### Step 2: Analyze Codebase

Use Glob and Grep to understand the existing codebase:
- Find related files by searching for keywords from the issue summary
- Identify existing patterns (architecture, naming conventions, file structure)
- Check for existing similar implementations that can be referenced
- Note the tech stack and frameworks in use

### Step 3: Generate Design Document

Step 1.5의 plan 입력 + Step 2의 코드베이스 분석 결과를 기반으로 `docs/design/<TASK-ID>.design.md` 생성.

산출물 작성 전 반드시 Read tool로 `templates/design.template.md`를 읽고 contract(필수/권장/옵셔널 분류, Data Model·Implementation Plan 코드 작성 금지 규약, 옵셔널 마커 규약, plan vs design 결정 경계)를 따른다.

**필수 섹션 작성 가이드 (요점만):**

- **Plan Inputs**: plan doc 경로 + Plan Open Items 처리 표 + AC↔구현 매핑 표. plan 미수행이면 `N/A — plan 생략` + Jira/협의 기반으로 채움.
- **Architecture**: 자유 서술이지만 다음 셋은 반드시 답이 보여야 함 — (1) 신규 vs 수정 컴포넌트, (2) 모듈 의존 방향, (3) 외부 시스템 경계(in-process / sync API / async).
- **Key Decisions**: design이 내린 *구현 방식* 결정. 0건일 수 없음 — 변경 없음을 결정한 경우에도 그것 자체를 한 줄 기록. *스코프* 결정은 plan으로 (여기 적지 않음).
- **Data Model**: 시그니처/명세 수준만, 코드 작성 금지. 데이터 변경 없으면 `N/A — no data changes`.
- **Implementation Plan**: 파일별 변경 유형 + 규모(S/M/L). plan의 Task Breakdown 규모와 어긋나면 Open Items로 이월.
- **Error Handling**: 시나리오 → 유형(a/b/c) → 처리. 유형 분류로 누락 검증.
- **Security Checklist**: 6개 항목 모두 Yes/No/N/A 명시. 빈칸 금지.
- **Test Plan**: Unit + E2E 케이스 + AC 매핑 표 (plan AC와 검증 케이스 연결). impl 단계에서 그대로 구현 가능한 수준이어야 함.
- **Open Items**: 미해결 결정 항목. `N/A — 모두 해결`이거나 미해결 항목이 있는 경우 이월 사유 필수. **미해결 P1 항목이 남으면 impl 진입 금지** — 사용자에게 명시적으로 경고.

### Step 4: Post Summary to Jira

Use `mcp__atlassian__jira_add_comment` to post:

```
## Design Document Created

이슈에 대한 기술 설계 문서가 생성되었습니다.

**아키텍처:**
- <주요 아키텍처 결정 사항>

**수정 파일:**
- <주요 파일 목록>

**테스트 전략:**
- <간단한 테스트 방식>

문서 경로: docs/design/<TASK-ID>.design.md
```

### Step 4.5: Attach Design Document to Jira

생성한 `docs/design/<TASK-ID>.design.md`를 공용 스크립트로 첨부 업로드 (스크립트 위치는 프로젝트 CLAUDE.md의 "Jira Attach Script" 섹션 참고):

```bash
bash "$JIRA_ATTACH_SH" <TASK-ID> docs/design/<TASK-ID>.design.md
```

출력은 `HTTP 200: <file>` (성공) / 그 외면 실패. 실패 시 로컬 파일 경로 안내 후 계속 진행.

### Step 5: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"design"` 추가 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **Design Complete** — <TASK-ID>

- 설계 문서 생성: `docs/design/<TASK-ID>.design.md`
- Jira 코멘트 게시됨
- Jira 첨부파일 업로드됨 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → plan → **design ✓** → impl → test → review → merge → pr → done

**Next**: `/jira-task impl <TASK-ID>` — 설계 기반으로 구현을 시작합니다
---
```
