---
name: jira-task-plan
description: "Generate a planning document from a Jira issue. Fetches issue details, related issues, and epic context. Triggers: jira-task plan, create plan; 기획 문서, 계획 작성."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_search
  - mcp__atlassian__jira_add_comment
---

# jira-task-plan: Generate Planning Document

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Workflow

### Step 1: Gather Context from Jira

**Context optimization 공통 원칙:**
- `jira_get_issue`: `fields="summary,status,description,labels,issuetype,parent,priority,assignee,components"`, `comment_limit=0`
- `jira_search`: `fields="summary,status,issuetype,priority"`, `limit=20` (description 제외, 결과는 요약 카드 용도)

1. **Cache-first**: `.jira-context.json`의 `cachedIssue`를 먼저 확인 (CLAUDE.md "Issue Cache" 참고). 다음 필수 필드(`summary`, `description`, `issuetype`, `priority`, `parent`, `labels`)가 모두 있고 `fetchedAt`이 있으면 fetch 생략. 부족하면 `mcp__atlassian__jira_get_issue` 호출(위 fields/comment_limit 사용) 후 `cachedIssue` 갱신 — `fetchedAt`은 반드시 `new Date().toISOString()` (UTC `Z`).
2. If the issue has a parent epic, fetch the epic details too (동일 fields 사용; epic은 본 task의 cachedIssue에 들어가지 않으므로 매번 fetch — 다만 plan 1회만 수행)
3. Use `mcp__atlassian__jira_search` with JQL to find related issues.
   **JIRA_DEFAULT_PROJECT가 설정되어 있으면 모든 JQL에 `project = <JIRA_DEFAULT_PROJECT>` 조건을 반드시 포함:**
   - Same epic: `project = <JIRA_DEFAULT_PROJECT> AND "Epic Link" = <epic-key>`
   - Same component: `project = <JIRA_DEFAULT_PROJECT> AND component = <component>`
   - Recently resolved similar: `project = <JIRA_DEFAULT_PROJECT> AND status = Done AND resolved >= -30d`

### Step 1.7: Load Requirements Document (discover 산출물)

discover 단계가 선행되었으면 그 산출물을 plan의 입력으로 명시적으로 소비한다.

1. `docs/requirements/` 디렉토리를 Glob으로 확인 (`docs/requirements/*.requirements.md`)
2. 후보 파일이 있으면:
   - 단일 파일: 자동 채택
   - 복수 파일: Jira 이슈 summary/description에 가장 가까운 slug를 우선. 모호하면 `AskUserQuestion`으로 사용자에게 선택받는다.
   - 없음: discover 미수행으로 간주
3. 채택한 파일을 Read하여 다음 항목을 추출:
   - **Goals & Success Criteria** (측정 가능한 목표 목록)
   - **Functional Requirements** (FR-N과 trace marker)
   - **Open Questions** (P1/P2/P3 우선순위, [CONFLICT] 항목 포함)
   - **Out of Scope** 후보
4. P1 Open Questions가 남아 있으면 plan에서 답을 정해야 한다 — Step 1.5에서 사용자에게 묻는다.
5. [CONFLICT] 항목이 있으면 plan에서 어느 쪽을 선택할지 결정해야 한다 — Step 1.5에서 사용자에게 묻는다.

discover를 거치지 않은 경우 (requirements 파일 없음): Source Requirements 섹션은 `N/A — discover 생략`으로 표기하고, 옵셔널 `Inline Requirements`를 사용자 답변으로 채운다.

### Step 1.5: Validate Information Sufficiency

Step 1에서 수집한 Jira 정보의 충분성을 평가한다. 다음 항목이 부족하면 사용자에게 질문:

**필수 정보 체크리스트:**
- [ ] 이슈 설명(Description)이 구체적인가? (한 줄 요약만 있거나 비어 있으면 부족)
- [ ] 무엇을 구현해야 하는지 명확한가?
- [ ] Acceptance Criteria가 있거나 유추할 수 있는가?
- [ ] (requirements 문서가 있는 경우) P1 Open Questions가 모두 답이 있는가? — 없으면 사용자에게 묻는다. 답을 못 받은 P1은 Open Items로 이월하고 design에서 다시 시도.
- [ ] (requirements 문서가 있는 경우) [CONFLICT] 항목이 모두 결정되었는가? — 없으면 사용자에게 묻는다. 결정 보류는 Open Items로.
- [ ] discover의 Goals 각각이 이번 plan의 AC로 커버되는지 확인 가능한가? (Partial이면 무엇이 빠졌는지 명시)

**부족한 경우**: `AskUserQuestion`으로 사용자에게 보충 질문을 한다.

질문 예시:
- "이슈 설명이 `<summary>` 한 줄뿐입니다. 구체적으로 어떤 기능을 구현해야 하나요?"
- "Acceptance Criteria가 없습니다. 이 기능이 완료되려면 어떤 조건을 만족해야 하나요?"
- "대상 사용자나 사용 시나리오가 명시되어 있지 않습니다. 어떤 상황에서 사용되나요?"

사용자 답변을 수집한 뒤 Step 2의 컨텍스트에 반영한다.

**충분한 경우**: 바로 Step 2로 진행.

### Step 2: Prepare Context Summary

Jira에서 수집한 정보를 정리:

```markdown
## Jira Issue Context

- **Key**: <TASK-ID>
- **Summary**: <summary>
- **Description**: <description>
- **Priority**: <priority>
- **Assignee**: <assignee>
- **Sprint**: <sprint>
- **Epic**: <epic-key> - <epic-summary>
- **Labels**: <labels>
- **Components**: <components>

### Related Issues
- <related-key>: <summary> (status: <status>)

### Acceptance Criteria (from Jira)
<if available in description or custom fields>
```

### Step 3: Generate Plan Document

Step 1.7의 requirements 산출물 + Step 2의 Jira 컨텍스트를 기반으로 `docs/plan/<TASK-ID>.plan.md` 생성.

산출물 작성 전 반드시 Read tool로 `templates/plan.template.md`를 읽고 contract(필수/옵셔널 분류, 옵셔널 마커 규약, plan vs design 결정 경계)를 따른다.

**필수 섹션 작성 가이드 (요점만):**

- **Source Requirements**: requirements doc 경로 + 단일 통합 표(`출처 | 항목 | plan에서의 처리`). Open Questions(P1/P2) · [CONFLICT] · Goal Coverage를 한 표에 모은다. discover 미수행이면 `N/A — discover 생략 (출처: <Jira/협의>)` 한 줄.
- **Scope > In Scope**: 가능한 한 `*(source: FR-N)*` trace marker 부착.
- **Scope > Out of Scope**: bullet 형식 (`- 항목 — 사유 *(복귀: ...)*`).
- **Acceptance Criteria**: 각 AC 끝에 `*(covers: Goal X, In Scope item-Y)*`로 매핑 inline. 별도 매핑 표 없음. 매핑 누락이 있으면 Open Items로 이월.
- **Scope Decisions**: 0건일 수 없음 — "변경 없음" 결정도 한 줄 기록. *어떻게 만들지*는 design으로.
- **Task Breakdown**: 의존/규모(S/M/L)/우선순위(must/nice) 컬럼 채움.
- **Risks**: 없으면 `N/A — 식별된 위험 없음 (검토 완료)` 한 줄. 섹션 누락 금지.

**옵셔널 섹션** (해당 없으면 헤더째 삭제):
- **Open Items**: 풀지 못한 결정을 design으로 이월할 때만.
- **Edge Cases**: 경계 조건·예외 입력을 별도로 다룰 때만.

### Step 4: Post Summary to Jira

`mcp__atlassian__jira_add_comment`로 핵심만 두 줄 요약하여 게시한다. 상세 내용은 첨부 문서를 참조하도록 안내:

```
## Planning Document Created

- 목표: <plan의 Goals/Acceptance Criteria 1줄 요약>
- 범위: <In Scope 핵심 항목 1줄 요약>

상세 내용은 첨부된 `<TASK-ID>.plan.md`를 참고하세요.
```

### Step 4.5: Attach Plan Document to Jira

생성한 `docs/plan/<TASK-ID>.plan.md`를 공용 스크립트로 첨부 업로드. 스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
SCRIPT_NAME="jira-attach.sh" OUT_VAR="JIRA_ATTACH_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here
[ -n "$JIRA_ATTACH_SH" ] && bash "$JIRA_ATTACH_SH" <TASK-ID> docs/plan/<TASK-ID>.plan.md
```

출력은 `HTTP 200: <file>` (성공) / 그 외면 실패. 실패 시 로컬 파일 경로 안내 후 계속 진행.

### Step 5: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"plan"` 추가 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **Plan Complete** — <TASK-ID>

- 기획 문서 생성: `docs/plan/<TASK-ID>.plan.md`
- Jira 코멘트 게시됨
- Jira 첨부파일 업로드됨 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → approach → impl → test → review → merge → pr → done

> 참고: `plan`은 레거시 단계입니다. 신규 워크플로는 `approach`로 통합됩니다 (`/jira-task approach <TASK-ID>`).

**Next**: `/jira-task approach <TASK-ID>` — level-aware approach 문서로 통합 진행
---
```
