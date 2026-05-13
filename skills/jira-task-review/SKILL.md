---
name: jira-task-review
description: "Run code review and gap analysis on a Jira task's changes, then post results to Jira. Triggers: jira-task review, code review; 코드 리뷰, 리뷰 해줘."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_add_comment
---

# jira-task-review: Code Review + Gap Analysis with Jira Reporting

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Reviewer Independence Rule (필수)

Mode A/B 분기 규칙과 Mode A subagent prompt 전문은 `Read skills/jira-task-review/refs/reviewer-mode.md`로 참조.

요약: `[review-self-mode]` 마커가 없으면 Mode A(Agent 위임, opus 강제), 있으면 Mode B(wrapper agent가 직접 수행). self-praise / 사각지대 누락 차단이 목적.

## Workflow

### Context Optimization

이 스킬에서 `mcp__atlassian__jira_get_issue`를 호출해야 하면 먼저 `.jira-context.json`의 `cachedIssue`를 확인한다 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 다음 파라미터로 호출 후 cache 갱신:
- `fields="summary,status,description,issuetype"`
- `comment_limit=0`

### Step 1: Prepare Context (main 세션)

리뷰 컨텍스트를 준비한다 — main 세션이 한다.

```bash
git log --oneline <base-branch>..feature/<TASK-ID>
git diff --name-only <base-branch>..feature/<TASK-ID>
```

설계 문서 존재 여부 확인:
- `docs/design/<TASK-ID>.design.md` 존재? (Gap Analysis 가능 여부)
- `docs/plan/<TASK-ID>.plan.md` 존재? (Acceptance Criteria 참조)

### Step 2: Perform Review (Mode A: delegate / Mode B: self)

호출 prompt에 `[review-self-mode]` 마커가 있는지 확인하여 분기.

#### Mode B (self-mode) — 마커 있음

본 wrapper agent가 이미 격리된 컨텍스트이므로 추가 Agent를 띄우지 말고 다음 작업을 **직접 수행**:

1. **Gap Analysis**: `docs/design/<TASK-ID>.design.md`가 있으면 Implementation Plan 항목별로 실제 구현 여부를 `Glob`/`Grep`으로 확인하고 매칭률 산출. 없으면 스킵.
2. **Lint & Format Check**: 변경 파일 중 다음 확장자에 대해 lint/format 실행:
   - Node.js: `.js`/`.ts`/`.jsx`/`.tsx`/`.mjs`/`.cjs` → `npx eslint` / `npx prettier --check`
   - Python: `.py` → `ruff check` / `ruff format --check` 또는 `flake8`
   - Java/Kotlin: `.java`/`.kt`/`.kts` → `checkstyle`
   변경 파일만 대상, 도구 없으면 스킵, 기존 프로젝트 설정 우선. lint 실패가 있어도 리뷰를 중단하지 않고 정보로 포함.
3. **Code Quality Review**: 변경 파일을 `Read`로 검토 — 보안 취약점(injection/XSS/하드코딩 credentials), 에러 핸들링 누락, 네이밍 일관성, 불필요한 복잡도.
4. **Compile Findings**: Critical / Warning / Info 3단계로 분류. 파일:라인 참조 포함.

산출물: Mode A의 subagent 반환과 동일한 구조 (결과 / 검토 파일 수 / Gap matchRate / Lint 표 / findings / Positive Notes). 이걸 Step 4에 전달해 `docs/review/<TASK-ID>.review.md`로 저장.

self-mode에서도 Edit/Write로 코드를 직접 수정하지 마라 — 리뷰 자체에 한정. 수정은 별도 단계(예: auto의 review-fix sub-agent).

#### Mode A (delegate) — 마커 없음

`Agent` 도구로 `subagent_type: "jira-reviewer"`, `model: "opus"` 명시 호출. **subagent 호출 prompt 전문 + 금지 사항은 `Read skills/jira-task-review/refs/reviewer-mode.md`** (Mode A 단락)를 그대로 따른다.

`Agent` 도구를 쓸 수 없는 환경이면 즉시 에러로 중단하고 호출자에게 `[review-self-mode]` 마커 누락을 안내 — fallback으로 main 세션이 직접 리뷰하지 않는다.

### Step 3: Receive Subagent Result

`Agent` 도구의 반환값을 받는다. 이 결과가 리뷰의 단일 진실이다 (main 세션이 임의로 추가/수정 금지).

만약 subagent 호출이 실패하거나(타임아웃, 권한 거부 등) 결과가 명확히 부족하면, **재시도 또는 사용자에게 보고**. main 세션이 fallback으로 직접 리뷰하지 않는다.

### Step 4: Save Review Report (main 세션)

subagent 반환값을 `docs/review/<TASK-ID>.review.md`에 저장. template contract를 따라 정형화한다.

`templates/review.template.md`를 Read해서 contract(필수: Summary, Gap Analysis, Lint & Format, Code Quality Findings, Positive Notes)를 따른다.

### Step 4.7: Append Review Log (best-effort)

Step 4에서 저장한 review 결과를 `docs/review-log/` 로그에 append한다. 실패는 워크플로를 차단하지 않는다.

> **선행 조건**: Step 3에서 받은 subagent 결과를 `SUBAGENT_RESULT_JSON` 변수(JSON 문자열)에 보관해야 한다.
> subagent 반환값 구조: `{ result: "Approve"|"Request Changes"|"Needs Discussion", findings: [{severity, file, line, category, message}, ...], ... }`

스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
SCRIPT_NAME="append-review-log-wrapper.sh" OUT_VAR="APPEND_LOG_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here

set +e
[ -n "$APPEND_LOG_SH" ] && SUBAGENT_RESULT_JSON="$SUBAGENT_RESULT_JSON" bash "$APPEND_LOG_SH" "<TASK-ID>"
set -e
```

### Step 4.5: Attach Review Report to Jira

저장한 `docs/review/<TASK-ID>.review.md`를 공용 스크립트로 첨부 업로드. 스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
SCRIPT_NAME="jira-attach.sh" OUT_VAR="JIRA_ATTACH_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here
[ -n "$JIRA_ATTACH_SH" ] && bash "$JIRA_ATTACH_SH" <TASK-ID> docs/review/<TASK-ID>.review.md
```

출력은 `HTTP 200: <file>` (성공) / 그 외면 실패. 실패 시 로컬 파일 경로 안내 후 계속 진행.

### Step 5: Post Review to Jira

`mcp__atlassian__jira_add_comment`로 핵심만 두 줄 요약하여 게시한다. 상세 findings/Gap Analysis는 첨부 문서를 참조하도록 안내. 본문 끝의 reviewer 서명은 review-log 분석(Phase 1.4)에서 reviewer 식별에 사용되므로 반드시 유지:

```
## Code Review Complete

- 결과: <Approve | Request Changes | Needs Discussion> (설계-구현 매칭률 <N>%)
- 주요 findings: <Critical/Warning 1건 요약, 없으면 "없음">

상세 내용은 첨부된 `<TASK-ID>.review.md`를 참고하세요.

---
Reviewed by jira-reviewer subagent (model: opus)
```

### Step 6: Completion Summary

Approve 시에만 `skills/_shared/context-update.md` 패턴으로 worktree-local + aggregate `.jira-context.json`을 갱신 (review는 Jira transition 없음 → `STATUS="-"`). Request Changes 시 호출하지 않는다:

```bash
SCRIPT_NAME="jira-context-update.py" OUT_VAR="JIRA_CTX_UPDATE_PY"
# Read skills/_shared/script-lookup.md and execute its lookup block here
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> review "-" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

**Approve 시:**
```
---
✅ **Review Complete** — <TASK-ID>

- 결과: Approve
- Reviewer: jira-reviewer subagent (opus)
- 설계-구현 매칭률: <N>%
- 리뷰 파일: <N>개
- Jira 코멘트 게시됨
- Jira 첨부파일 업로드됨 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → approach → impl → test → **review ✓** → merge → pr → done

**Next**: `/jira-task merge <TASK-ID>` — 로컬 병합 후, 메인 레포에서 `/jira-task pr <TASK-ID>`
---
```

**Request Changes 시:**
```
---
⚠️ **Review: Changes Requested** — <TASK-ID>

- 결과: Request Changes
- Reviewer: jira-reviewer subagent (opus)
- 주요 이슈:
  - <Critical/Warning findings>
- Jira 코멘트 게시됨

**Progress**: init → start → approach → impl → test → **review ✗** → merge → pr → done

**Next**: 이슈 수정 후 `/jira-task review <TASK-ID>` 재실행
---
```
