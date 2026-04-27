---
name: jira-task-review
description: Run code review and gap analysis on changes for a Jira task, then post results to Jira. Compares design document against implementation and reviews code quality. Use when user says "review task", "code review", "jira-task review", "코드 리뷰", "리뷰 해줘", or wants to review changes before completing a task.
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

# jira-task-review: Code Review + Gap Analysis with Jira Reporting

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Workflow

### Context Optimization

이 스킬에서 `mcp__atlassian__jira_get_issue`를 호출해야 하면 먼저 `.jira-context.json`의 `cachedIssue`를 확인한다 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 다음 파라미터로 호출 후 cache 갱신 (디자인 문서 기반 리뷰가 주이므로 이슈 본문 외 메타는 불필요):
- `fields="summary,status,description,issuetype"`
- `comment_limit=0`

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

### Step 2.5: Lint & Format Check

변경된 파일에 대해 프로젝트 타입을 감지하고 lint/format 체크를 실행한다.
**대상 파일**: Step 1에서 `git diff --name-only`로 추출한 변경 파일 목록 중 해당 언어 파일만.

#### 프로젝트 타입 감지

프로젝트 루트의 설정 파일로 타입을 판별한다 (복수 해당 시 모두 실행):

| 감지 파일 | 프로젝트 타입 | 대상 확장자 |
|-----------|-------------|------------|
| `package.json` | Node.js | `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs` |
| `pyproject.toml`, `setup.py`, `requirements.txt` | Python | `.py` |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | Java/Kotlin | `.java`, `.kt`, `.kts` |

#### 실행 규칙

1. **변경 파일 필터링**: 해당 확장자를 가진 변경 파일이 없으면 해당 타입 스킵
2. **도구 존재 확인**: `command -v` 또는 프로젝트 내 실행 스크립트 존재 여부로 판별. 도구가 없으면 경고 메시지 출력 후 스킵
3. **기존 설정 우선**: 프로젝트에 `.eslintrc*`, `.prettierrc*`, `ruff.toml`, `pyproject.toml [tool.ruff]`, `checkstyle.xml` 등 설정 파일이 있으면 해당 설정을 사용
4. **변경 파일만 대상**: 전체 프로젝트가 아닌 변경된 파일만 검사

#### Node.js

```bash
# ESLint (lint 체크)
CHANGED_JS=$(git diff --name-only <base-branch>..feature/<TASK-ID> -- '*.js' '*.ts' '*.jsx' '*.tsx' '*.mjs' '*.cjs')
if [ -n "$CHANGED_JS" ]; then
  npx eslint --no-error-on-unmatched-pattern $CHANGED_JS 2>&1 || true
fi

# Prettier (format 체크)
if [ -n "$CHANGED_JS" ]; then
  npx prettier --check $CHANGED_JS 2>&1 || true
fi
```

#### Python

```bash
CHANGED_PY=$(git diff --name-only <base-branch>..feature/<TASK-ID> -- '*.py')
if [ -n "$CHANGED_PY" ]; then
  # ruff 우선, 없으면 flake8 시도
  if command -v ruff &>/dev/null; then
    ruff check $CHANGED_PY 2>&1 || true
    ruff format --check $CHANGED_PY 2>&1 || true
  elif command -v flake8 &>/dev/null; then
    flake8 $CHANGED_PY 2>&1 || true
  fi
fi
```

#### Java/Kotlin

```bash
# Maven 프로젝트
if [ -f "pom.xml" ]; then
  ./mvnw checkstyle:check 2>&1 || true
fi

# Gradle 프로젝트
if [ -f "build.gradle" ] || [ -f "build.gradle.kts" ]; then
  ./gradlew checkstyleMain 2>&1 || true
fi
```

#### 결과 정리

실행 결과를 다음 형식으로 정리하여 Step 4 리포트에 포함:

| 도구 | 대상 파일 수 | 결과 | 주요 이슈 |
|------|------------|------|----------|
| ESLint | <N>개 | Pass / <N> errors, <N> warnings | <요약> |
| Prettier | <N>개 | Pass / <N> files unformatted | <파일 목록> |
| ruff | <N>개 | Pass / <N> issues | <요약> |

- lint/format 이슈가 있어도 리뷰를 중단하지 않는다 (정보로 포함)
- Critical 수준의 lint 오류(미사용 import 수준이 아닌 실제 버그 가능성)는 Code Quality Findings의 Warning으로도 반영

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
- **Lint & Format**: 도구별 실행 결과 표 (Step 2.5 결과)
- **Code Quality**: 이슈별 심각도 분류 (Critical / Warning / Info)
- **Positive Notes**: 잘 된 점

### Step 4.5: Save Review Report

리뷰 리포트를 `docs/review/<TASK-ID>.review.md`에 저장.
다른 PDCA 문서들(plan, design, test)과 동일한 패턴으로 로컬 파일로 보존.

### Step 4.7: Attach Review Report to Jira

저장한 `docs/review/<TASK-ID>.review.md`를 공용 스크립트로 첨부 업로드 (스크립트 위치는 프로젝트 CLAUDE.md의 "Jira Attach Script" 섹션 참고):

```bash
bash "$JIRA_ATTACH_SH" <TASK-ID> docs/review/<TASK-ID>.review.md
```

출력은 `HTTP 200: <file>` (성공) / 그 외면 실패. 실패 시 로컬 파일 경로 안내 후 계속 진행.

### Step 5: Post Review to Jira

Use `mcp__atlassian__jira_add_comment` to post the review:

```
## Code Review: <TASK-ID>

**결과**: <Approve | Request Changes | Needs Discussion>
**검토 파일 수**: <count>개
**커밋 수**: <count>개

### Gap Analysis
**설계-구현 일치율**: <percentage>%
- <차이점 또는 불일치 사항>

### Lint & Format
| 도구 | 대상 파일 수 | 결과 |
|------|------------|------|
| <tool> | <N>개 | Pass / <issues> |

### Code Quality Findings

#### Critical
- <파일:라인 참조와 함께 발견 사항>

#### Warnings
- <파일:라인 참조와 함께 발견 사항>

#### Info
- <제안 또는 참고 사항>

### Positive Notes
- <잘 된 점>

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
- Jira 첨부파일 업로드됨 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → plan → design → impl → test → **review ✓** → merge → pr → done

**Next**: `/jira-task merge <TASK-ID>` — 로컬 병합 후, 메인 레포에서 `/jira-task pr <TASK-ID>`
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

**Progress**: init → start → plan → design → impl → test → **review ✗** → merge → pr → done

**Next**: 이슈 수정 후 `/jira-task review <TASK-ID>` 재실행
---
```
