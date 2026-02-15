---
name: jira-task-review
description: |
  Run code review and gap analysis on changes for a Jira task,
  then post results to Jira. Compares design document against
  implementation and reviews code quality.

  Use when: user says "review task", "code review", "jira-task review",
  "코드 리뷰", "리뷰 해줘", or wants to review changes before completing a task.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - mcp__jira__get-issue
  - mcp__jira__add-comment
---

# jira-task-review: Code Review + Gap Analysis with Jira Reporting

## Workflow

### Step 1: Identify Changes

Determine the feature branch and base branch:
```bash
git log --oneline <base-branch>..feature/<TASK-ID>
git diff --name-only <base-branch>..feature/<TASK-ID>
```

### Step 2: Gap Analysis

설계 문서가 있으면(`docs/design/<TASK-ID>.design.md`), 설계와 구현을 직접 비교:

1. Design 문서의 Implementation Plan에 나열된 항목을 체크리스트로 변환
2. 각 항목에 대해 실제 구현 코드가 존재하는지 Glob/Grep으로 확인
3. 결과를 표로 정리:

| Design 항목 | 구현 여부 | 파일 위치 | 비고 |
|------------|----------|----------|------|
| <item> | O / X | <path> | <note> |

매칭률 = 구현된 항목 / 전체 항목 x 100

설계 문서가 없으면 이 단계를 스킵하고 코드 품질 리뷰만 수행.

### Step 3: Code Quality Review

변경된 파일을 직접 읽고 다음을 검토:
- 보안 취약점 (injection, XSS, 하드코딩된 credentials)
- 에러 핸들링 누락
- 네이밍 컨벤션 일관성
- 불필요한 복잡도

### Step 4: Compile Review Report

분석 결과를 통합하여 구조화된 리뷰 생성:
- **Summary**: Overall assessment (Approve / Request Changes / Needs Discussion)
- **Gap Analysis**: 설계-구현 매칭률 및 주요 차이
- **Code Quality**: 이슈별 심각도 분류 (Critical / Warning / Info)
- **Positive Notes**: 잘 된 점

### Step 5: Post Review to Jira

Use `mcp__jira__add-comment` to post the review:

```
## Code Review: <TASK-ID>

**Result**: <Approve | Request Changes | Needs Discussion>
**Files Reviewed**: <count>
**Commits**: <count>

### Gap Analysis
**Design-Implementation Match**: <percentage>%
- <gaps or mismatches if any>

### Code Quality Findings

#### Critical
- <finding with file:line reference>

#### Warnings
- <finding with file:line reference>

#### Info
- <suggestion or note>

### Positive Notes
- <things done well>

---
Reviewed by Claude Code
```

### Step 6: Completion Summary

Approve 시 `.jira-context.json`의 `completedSteps`에 `"review"` 추가 (Request Changes 시 추가하지 않음).
리뷰 결과에 따라 분기하여 완료 요약 출력:

**Approve 시:**
```
---
✅ **Review Complete** — <TASK-ID>

- 결과: Approve
- 설계-구현 매칭률: <N>%
- 리뷰 파일: <N>개
- Jira 코멘트 게시됨

**Progress**: init → start → plan → design → impl → test → **review ✓** → pr → done

**Next**: `/jira-task pr <TASK-ID>` — Pull Request를 생성합니다
---
```

**Request Changes 시:**
```
---
⚠️ **Review: Changes Requested** — <TASK-ID>

- 결과: Request Changes
- 주요 이슈:
  - <Critical/Warning findings>
- Jira 코멘트 게시됨

**Progress**: init → start → plan → design → impl → test → **review ✗** → pr → done

**Next**: 이슈 수정 후 `/jira-task review <TASK-ID>` 재실행
---
```
