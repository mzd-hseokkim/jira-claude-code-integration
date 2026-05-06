---
name: jira-task-design
description: "Generate a design document for a Jira task based on the plan doc and codebase analysis. Triggers: jira-task design, design task; 설계 문서, 디자인 문서."
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
2. **Acceptance Criteria**: plan의 모든 AC를 추출. *구현 위치*는 Plan Inputs 통합 표에, *검증 방법*은 Test Plan 표(Unit/E2E 행의 `검증 AC` 컬럼)에 기록한다.
3. **Source Requirements / Goal Coverage**: plan에 있는 경우 참고. design이 plan의 Goal Coverage를 깨지 않는지 확인 (예: plan에서 만족하기로 한 Goal이 design에서 누락되면 Open Items로 이월).
4. **Task Breakdown 규모 추정**: plan의 task별 규모(S/M/L)를 design의 Implementation Plan 규모와 대조. 어긋나면 Open Items에 명시.

plan이 없는 경우(`docs/plan/<TASK-ID>.plan.md` 부재): Plan Inputs 섹션은 `N/A — plan 생략 (출처: <Jira issue>)`로 표기하고, 통합 표는 Jira description의 AC 또는 사용자 협의 내용을 기반으로 채운다.

### Step 2: Analyze Codebase

Use Glob and Grep to understand the existing codebase:
- Find related files by searching for keywords from the issue summary
- Identify existing patterns (architecture, naming conventions, file structure)
- Check for existing similar implementations that can be referenced
- Note the tech stack and frameworks in use

### Step 3: Generate Design Document (Template Fill Flow)

**중요**: 본 단계는 **템플릿 복사 + placeholder 채우기** 흐름이다. 문서를 처음부터 Write하지 말 것. 출력 토큰을 줄이는 게 핵심.

#### 3.1 템플릿 복사 + 주석 제거 (한 번에)

```bash
mkdir -p docs/design
# HTML 주석(가이드)은 산출물에 불필요 — perl로 제거하면서 복사
perl -0777 -pe 's/<!--.*?-->//gs' templates/design.template.md \
    > docs/design/<TASK-ID>.design.md
```

위 명령은 단일/다중 라인 HTML 주석을 모두 제거한다. 결과 파일은 헤더 + placeholder + 빈 표 행만 남는다.

#### 3.2 Placeholder 일괄 치환 (Edit 도구)

복사된 파일의 placeholder만 Edit으로 교체한다. 전체 본문을 다시 쓰지 말 것.

기본 치환 대상:
- `{task_id}` → 실제 TASK-ID
- `{summary}` → Jira issue summary
- 표 본문의 `{...}` placeholder → 실제 내용 (Step 1.5 + Step 2 결과 반영)

표 행이 부족하면 행만 추가 Edit. 충분하면 그대로 채움.

#### 3.3 섹션별 채우기 가이드 (요약)

치환 시 따라야 할 contract:

**필수 섹션:**
- **Plan Inputs**: Step 1.5 결과 — plan doc 경로 + 단일 통합 표(`출처 | 항목 | design에서의 처리 / 구현 위치`). Open Items 처리 + AC↔구현 매핑을 한 표에 모은다. plan 미수행이면 `N/A — plan 생략` 한 줄.
- **Architecture**: (1) 신규 vs 수정 컴포넌트, (2) 모듈 의존 방향, (3) 외부 시스템 경계 — 셋 다 명시.
- **Key Decisions**: *구현 방식* 결정만. 0건 불가 — "기존 패턴 유지"도 한 줄 기록. 스코프 결정은 plan으로.
- **Data Model**: 시그니처/명세 수준만. 코드 금지. 변경 없으면 `N/A — no data changes`.
- **Implementation Plan**: 파일별 변경 유형 + 규모(S/M/L).
- **Error Handling**: 시나리오 → 유형(a/b/c) → 처리.
- **Test Plan**: Unit + E2E. 각 케이스 행의 `검증 AC` 컬럼으로 AC 매핑 (별도 매핑 표 없음).

**옵셔널 섹션** (해당 없으면 헤더째 삭제):
- **Overview**: plan으로 충분하면 생략.
- **Sequence Diagram**: 핵심 호출 흐름이 표만으로 안 보일 때만.
- **Security Checklist**: 보안 영향이 있을 때만 표를 펼친다. 영향 없으면 헤더 자체를 삭제하고, Architecture 또는 Notes에 `보안 영향: No — <사유>` 한 줄.
- **Out of Scope / Interfaces / Types / 작업 순서 / Notes**: 해당 사항 있을 때만.
- **Open Items**: 미해결 항목이 있을 때만. 미해결 P1이 남으면 impl 진입 금지 (사용자에게 경고).

### Step 4: Post Summary to Jira

`mcp__atlassian__jira_add_comment`로 핵심만 두 줄 요약하여 게시한다. 상세 내용은 첨부 문서를 참조하도록 안내:

```
## Design Document Created

- 핵심 설계: <Key Decisions 1줄 요약>
- 영향 범위: <수정/신규 파일 범위 1줄 요약>

상세 내용은 첨부된 `<TASK-ID>.design.md`를 참고하세요.
```

### Step 4.5: Attach Design Document to Jira

생성한 `docs/design/<TASK-ID>.design.md`를 공용 스크립트로 첨부 업로드. 스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
SCRIPT_NAME="jira-attach.sh" OUT_VAR="JIRA_ATTACH_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here
[ -n "$JIRA_ATTACH_SH" ] && bash "$JIRA_ATTACH_SH" <TASK-ID> docs/design/<TASK-ID>.design.md
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

**Progress**: init → start → approach → impl → test → review → merge → pr → done

> 참고: `design`은 레거시 단계입니다. 신규 워크플로는 `approach`로 통합됩니다 (`/jira-task approach <TASK-ID>`).

**Next**: `/jira-task impl <TASK-ID>` — 설계 기반으로 구현을 시작합니다
---
```
