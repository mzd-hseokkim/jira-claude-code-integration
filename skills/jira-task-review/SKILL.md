---
name: jira-task-review
description: |
  Run code review and gap analysis on changes for a Jira task using bkit tools,
  then post results to Jira. Uses bkit gap-detector for design-implementation
  matching and code-analyzer for code quality.

  Use when: user says "review task", "code review", "jira-task review",
  "코드 리뷰", "리뷰 해줘", or wants to review changes before completing a task.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Task
  - Skill
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

### Step 2: Gap Analysis (bkit)

설계 문서가 있으면(`docs/design/<TASK-ID>.design.md`), bkit의 PDCA analyze로
설계-구현 매칭률을 검증:

```
/pdca analyze <TASK-ID>
```

결과:
- 설계-구현 매칭률 (%)
- 누락된 항목
- 설계와 다르게 구현된 항목

**매칭률 < 90%이면**: bkit pdca-iterator로 자동 개선을 제안.

### Step 3: Code Quality Analysis (bkit)

bkit의 code-analyzer 에이전트를 활용하여 코드 품질 분석:

- 코드 품질 이슈 (복잡도, 중복, 네이밍)
- 보안 취약점 (injection, XSS, 하드코딩된 credentials)
- 성능 이슈
- 아키텍처 일관성

### Step 4: Compile Review Report

두 분석 결과를 통합하여 구조화된 리뷰 생성:
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
Reviewed by Claude Code + bkit
```

### Step 6: Summary

Tell the user:
- Review results (pass/fail)
- Design-implementation match rate
- Key findings
- If match rate < 90%, suggest `/pdca iterate <TASK-ID>` for auto-improvement
- If approved, suggest `/jira-task done <TASK-ID>`
- If changes needed, list what to fix
