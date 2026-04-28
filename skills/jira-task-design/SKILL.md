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

### Step 2: Analyze Codebase

Use Glob and Grep to understand the existing codebase:
- Find related files by searching for keywords from the issue summary
- Identify existing patterns (architecture, naming conventions, file structure)
- Check for existing similar implementations that can be referenced
- Note the tech stack and frameworks in use

### Step 3: Generate Design Document

Plan 문서 + 코드베이스 분석 결과를 기반으로 `docs/design/<TASK-ID>.design.md` 생성.

산출물 작성 전 반드시 Read tool로 `templates/design.template.md`를 읽고 contract(필수/권장/옵셔널 분류, Data Model·Implementation Plan 코드 작성 금지 규약, 옵셔널 마커 규약)를 따른다.

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
