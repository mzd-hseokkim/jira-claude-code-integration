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
2. Use `mcp__atlassian__jira_get_issue` to fetch current issue details
   - **Context optimization**: `fields="summary,status,description,labels,issuetype,parent"`, `comment_limit=0`

### Step 2: Analyze Codebase

Use Glob and Grep to understand the existing codebase:
- Find related files by searching for keywords from the issue summary
- Identify existing patterns (architecture, naming conventions, file structure)
- Check for existing similar implementations that can be referenced
- Note the tech stack and frameworks in use

### Step 3: Generate Design Document

Plan 문서 + 코드베이스 분석 결과를 기반으로 `docs/design/<TASK-ID>.design.md` 생성.

문서에 포함할 내용:
- **Architecture**: 관련 컴포넌트/모듈 구조
- **Data Model**: 데이터 모델링 합의 (엔티티 / 스키마 / DTO / 도메인 / 상태 / 흐름)
  - 권장 하위 항목 6종 (모두 **해당 시 (applicable when)** 채움 — 권장(recommended)이며 강제 아님):
    1. **새/변경되는 엔티티**: 속성 · 타입 · 제약 · 관계
    2. **DB 스키마**: 테이블 / 컬럼 / 인덱스 / FK / 마이그레이션 전략
    3. **API 페이로드**: 요청 / 응답 DTO 구조 (시그니처 수준)
    4. **도메인 객체**: 핵심 entity / value object 구조 (이름과 역할)
    5. **상태 모델**: 상태 전이 다이어그램 (Mermaid `stateDiagram` 권장)
    6. **데이터 흐름**: source → transform → sink (in-memory 캐시/세션 포함)
  - **코드 작성 금지**: 실제 코드 스니펫·구현체를 포함하지 않음 (Implementation Plan과 동일). 시그니처 수준의 명세만 허용
  - 데이터 변경이 전혀 없는 task는 **`N/A — no data changes`** 한 줄로 처리 가능
- **Sequence Diagram**: 주요 플로우 (Mermaid 형식)
- **Implementation Plan**: 구현 순서와 파일별 변경 사항 요약
  - 각 파일에 대해 "무엇을 변경하는지"를 1-2줄로 기술 (예: "인증 미들웨어 추가", "API 엔드포인트 정의")
  - **코드 작성 금지**: 실제 코드 스니펫, 함수 구현체, 클래스 정의 등을 포함하지 않음. 코드는 `impl` 단계에서만 작성
  - 필요한 인터페이스/타입은 이름과 역할만 기술 (시그니처 수준까지만 허용)
- **Error Handling**: 에러 시나리오와 처리 전략
- **Security Checklist**: 해당하는 보안 고려사항
- **Test Plan**: 테스트 전략 및 구체적 테스트 케이스 명세
  - Unit test: 함수/모듈별 테스트 케이스 목록 (입력, 기대 결과, 경계 조건)
  - E2E test: 사용자 시나리오별 테스트 케이스 (해당하는 경우)
  - 각 케이스는 `impl` 단계에서 구현과 함께 작성할 수 있을 정도로 구체적이어야 함
  - 테스트 케이스도 코드가 아닌 명세(설명) 수준으로 작성

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
