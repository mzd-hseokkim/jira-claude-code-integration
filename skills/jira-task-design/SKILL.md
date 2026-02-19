---
name: jira-task-design
description: Generate a design document for a Jira task. Analyzes the codebase, references the planning document, then generates a structured design document. Use when user says "design task", "create design", "jira-task design", "설계 문서", "디자인 문서", or wants to design the implementation of a Jira issue.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - mcp__jira__jira_get_issue
  - mcp__jira__jira_add_comment
---

# jira-task-design: Generate Design Document

## Workflow

### Step 1: Check Prerequisites

1. Check if `docs/plan/<TASK-ID>.plan.md` exists
   - If yes, read it for context
   - If no, suggest running `/jira-task plan <TASK-ID>` first (but proceed if user wants)
2. Use `mcp__jira__jira_get_issue` to fetch current issue details

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

Use `mcp__jira__jira_add_comment` to post:

```
## Design Document Created

Technical design has been created for this issue.

**Architecture:**
- <key architectural decisions>

**Files to modify:**
- <list of key files>

**Test approach:**
- <brief test strategy>

See: docs/design/<TASK-ID>.design.md
```

### Step 5: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"design"` 추가 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **Design Complete** — <TASK-ID>

- 설계 문서 생성: `docs/design/<TASK-ID>.design.md`
- Jira 코멘트 게시됨

**Progress**: init → start → plan → **design ✓** → impl → test → review → pr → done

**Next**: `/jira-task impl <TASK-ID>` — 설계 기반으로 구현을 시작합니다
---
```
