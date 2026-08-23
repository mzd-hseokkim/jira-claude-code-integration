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
---

# jira-task-review: Code Review + Gap Analysis with Jira Reporting

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Reviewer Independence Rule (필수)

Mode A/B 분기 규칙과 Mode A subagent prompt 전문은 `Read skills/jira-task-review/refs/reviewer-mode.md`로 참조.

요약: `[review-self-mode]` 마커가 없으면 Mode A(Agent 위임, opus 강제), 있으면 Mode B(wrapper agent가 직접 수행). self-praise / 사각지대 누락 차단이 목적. Mode B에 `[review-delta-mode]`가 함께 오면 fix loop 재리뷰 — 직전 Critical/미충족 Gap + 수정 파일만 재검증하고 나머지는 승계 (같은 문서의 Delta Mode 단락).

## Workflow

### Context Optimization

이슈 정보가 필요하면 먼저 `.jira-context.json`의 `cachedIssue`를 확인한다 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 `python3 "<scripts>/jira-cli.py" get <TASK-ID>` 후 cache 갱신 (`skills/_shared/jira-cli.md`).

### Step 1: Prepare Context (main 세션)

**Level 판정**: `.jira-context.json.breakdownLevel` → 없으면 `cachedIssue.issuetype` 폴백 (approach Step 0 동일 규칙: Subtask/Task/Bug→L1, Story→L2, Epic→L3, 그 외→L1). 판정 결과를 이후 단계에서 사용.

| Level | 동작 |
|-------|------|
| L1 | 경량 리뷰 — 핵심 findings만 (gap-analysis 경량, report 인라인/파일 생략 허용) |
| L2 | 현행 유지 — 전체 gap-analysis + 리뷰 report 파일 생성 |
| L3 | child Story별 책임 — 본 스킬이 L3 Epic에서 호출되면 "child Story 단위로 실행할 것" 안내 후 조기 종료 |

리뷰 컨텍스트를 준비한다 — main 세션이 한다. 첫 줄에 `date +%s`를 편승시켜 리뷰 시작 시각을 **출력**한다 (변수 할당 금지 — Bash 호출 간 변수는 유지되지 않으므로, 출력값을 기억해 Step 4.7의 `totalSec` 계산에 리터럴로 쓴다):

```bash
date +%s   # REVIEW_START — 출력값 기억
git log --oneline <base-branch>..feature/<TASK-ID>
git diff --name-only <base-branch>..feature/<TASK-ID>
```

Approach 문서 존재 여부 확인 (Acceptance Criteria와 Implementation Plan이 모두 이 문서 안에 있다):
- `docs/approach/<TASK-ID>.approach.md` 존재? (Gap Analysis 가능 여부)
- 없으면 legacy fallback으로 `docs/design/<TASK-ID>.design.md` 확인 — 반대 순서 금지

### Step 2: Perform Review (Mode A: delegate / Mode B: self)

호출 prompt에 `[review-self-mode]` 마커가 있는지 확인하여 분기.

#### Mode B (self-mode) — 마커 있음

본 wrapper agent가 이미 격리된 컨텍스트이므로 추가 Agent를 띄우지 말고 다음 작업을 **직접 수행**:

1. **Gap Analysis**: `docs/approach/<TASK-ID>.approach.md`(없으면 legacy `docs/design/<TASK-ID>.design.md`)가 있으면 Implementation Plan 항목별로 실제 구현 여부를 `Glob`/`Grep`으로 확인하고 매칭률 산출. 둘 다 없으면 스킵하되 조용히 넘기지 말고 리포트에 `Gap Analysis: 스킵 (approach 문서 없음 — <조회한 경로>)`를 남기고 `matchRate: null`로 보고.
2. **Lint & Format (인용 우선)**: worktree-local `.jira-context.json`의 `implSelfCheck.lint`를 확인한다.
   - **있으면 lint를 재실행하지 않는다.** 그 기록을 `Lint & Format` 표에 인용하고 출처를 `impl self-check 인용`으로 표기한다 (lint는 커밋 시점 1회 원칙 — impl Step 2.5가 그 1회).
   - **없으면 fallback**으로 직접 실행: 도구 판정은 `bash <scripts>/detect-lint.sh` **1회**로 (출력 `LINT`/`FORMAT`/`NONE` — 선언된 도구만 판정하는 규칙이 스크립트에 있다; `package.json`·`node_modules`를 직접 cat/ls/grep 하지 마라). 출력된 명령에 **변경 파일 전체를 인자로 한 번에** 실행 — 파일별 반복 실행 금지. `NONE`이면 `Skipped (선언된 도구 없음)`으로 기록.

   lint 실패가 있어도 리뷰를 중단하지 않는다. 포맷터 결과는 `Lint & Format` 표에만 남기고 findings로 승격하지 않는다.
3. **Code Quality Review**: 1차 입력은 `git diff <base-branch>..feature/<TASK-ID>` 본문 — 변경 파일 전문을 읽지 마라. 보안 취약점(injection/XSS/하드코딩 credentials), 에러 핸들링 누락, 네이밍 일관성, 불필요한 복잡도를 검토. findings는 diff에 포함된 라인에 대해서만 생성하고, 맥락이 필요할 때만 해당 파일을 선택적으로 `Read`한 뒤 그 사실을 리포트에 남긴다.
4. **Compile Findings**: Critical / Warning / Info 3단계로 분류. 파일:라인 참조 포함. severity별 상위 10건까지.

**단계별 소요 기록 (관측용)**: 1~3 각 단계에서 **어차피 실행하는 bash 명령에 `date +%s`를 편승**시켜 단계별 소요(초)를 근사 측정한다 — 타이밍만을 위한 별도 Bash 호출 금지. 결과는 산출물 맨 앞 `review-metrics` 블록 바로 다음에 추가한다:

```
<!-- review-timings
gapSec: <N | null>
lintSec: <N | null>
qualitySec: <N | null>
-->
```

측정 못 한 단계는 `null`. lint를 implSelfCheck 인용으로 대체한 경우도 `lintSec: null` (실행 없음 = 측정 없음). 이 블록은 게이트 판정에 쓰이지 않으며 review-log 축적용이다.

산출물: Mode A의 subagent 반환과 동일한 구조 (`review-metrics` 블록 / `review-timings` 블록 / 결과 / 검토 파일 수 / Gap matchRate / Lint 표 / findings / Positive Notes). 이걸 Step 4에 전달해 `docs/review/<TASK-ID>.review.md`로 저장.

self-mode에서도 Edit/Write로 코드를 직접 수정하지 마라 — 리뷰 자체에 한정. 수정은 별도 단계(예: auto의 review-fix sub-agent).

#### Mode A (delegate) — 마커 없음

`Agent` 도구로 `subagent_type: "jira-reviewer"`, `model: "opus"` 명시 호출. **subagent 호출 prompt 전문 + 금지 사항은 `Read skills/jira-task-review/refs/reviewer-mode.md`** (Mode A 단락)를 그대로 따른다.

`Agent` 도구를 쓸 수 없는 환경이면 즉시 에러로 중단하고 호출자에게 `[review-self-mode]` 마커 누락을 안내 — fallback으로 main 세션이 직접 리뷰하지 않는다.

### Step 3: Receive Subagent Result

`Agent` 도구의 반환값을 받는다. 이 결과가 리뷰의 단일 진실이다 (main 세션이 임의로 추가/수정 금지).

만약 subagent 호출이 실패하거나(타임아웃, 권한 거부 등) 결과가 명확히 부족하면, **재시도 또는 사용자에게 보고**. main 세션이 fallback으로 직접 리뷰하지 않는다.

### Step 4: Save Review Report (main 세션)

#### L1 — 경량 산출물

파일 생성 없이 Jira 코멘트 인라인에 핵심 findings만 포함 가능. gap-analysis는 변경 파일 대비 핵심 항목(Critical/Warning)만 열거. `docs/review/` 파일 생성은 선택 사항이며, 생략해도 워크플로를 계속 진행한다.

#### L2 — 전체 리포트 (현행)

subagent 반환값을 `docs/review/<TASK-ID>.review.md`에 저장. template contract를 따라 정형화한다.

`templates/review.template.md`를 Read해서 contract(필수: Summary, Gap Analysis, Lint & Format, Code Quality Findings, Positive Notes)를 따른다.

**subagent 반환 맨 앞의 `<!-- review-metrics ... -->` 블록을 파일 최상단에 그대로 보존한다.** `jira-task-auto`(v0.52.0+)는 같은 값을 wrapper의 구조화 반환으로 받지만, 이 블록은 리포트 열람·대시보드·review-log의 정본 기록이다 — 누락 금지. 정형화 과정에서 본문 문구를 다듬는 것은 허용되지만 이 블록의 키·형식은 변경 금지. 바로 뒤의 `<!-- review-timings ... -->` 블록도 있으면 함께 보존한다 (Step 4.7이 review-log에 기록).

### Step 4.7: Append Review Log (best-effort)

Step 4에서 저장한 review 결과를 `docs/review-log/` 로그에 append한다. 실패는 워크플로를 차단하지 않는다.

> **선행 조건**: Step 3에서 받은 subagent 결과를 `SUBAGENT_RESULT_JSON` 변수(JSON 문자열)에 보관해야 한다.
> subagent 반환값 구조: `{ result: "Approve"|"Request Changes"|"Needs Discussion", findings: [{severity, file, line, category, message}, ...], timings: {gapSec, lintSec, qualitySec, totalSec} | 생략, deltaReview: true | 생략, ... }` — `deltaReview`는 `[review-delta-mode]`로 수행했을 때만 `true`.
> `timings`는 subagent 산출물의 `review-timings` 블록 값에 `totalSec`(아래에서 계산)을 더해 구성한다. 블록이 없으면 키 생략.

두 번의 Bash 호출로 수행한다 (①의 출력을 봐야 ②를 구성할 수 있으므로 한 호출로 합치지 마라):

**Bash 호출 ① — 경로 결정 + 종료 시각**: 호출 prompt가 스크립트 절대 경로(`<scripts>/`)를 이미 줬으면 lookup 없이 `date +%s`만 실행한다. 아니면 `Read skills/_shared/script-lookup.md`의 **Batch Lookup** 블록을 실행하고 끝에 `date +%s`를 편승:

```bash
SCRIPT_NAMES="append-review-log-wrapper.sh jira-attach.sh jira-context-update.py"
# Read skills/_shared/script-lookup.md and execute its Batch Lookup block here
date +%s   # REVIEW_END — 출력값 기억
```

출력된 `RESOLVED` 경로 3개는 이 단계와 Step 4.5/6에서 **리터럴로 재사용**한다 (Bash 호출 간 변수는 유지되지 않으므로 lookup 재실행 금지).

**Bash 호출 ② — append 실행**: `totalSec = REVIEW_END − REVIEW_START`(둘 다 출력값)를 계산해 `timings`에 포함하고, JSON을 **인라인 리터럴**로 넘긴다:

```bash
set +e
SUBAGENT_RESULT_JSON='<result/findings/timings를 담은 JSON 리터럴>' bash "<APPEND_LOG_SH 경로>" "<TASK-ID>"
set -e
```

`APPEND_LOG_SH`가 `NOT_FOUND`면 이 단계를 스킵하고 계속 진행한다.

### Step 4.5: Attach Review Report to Jira

저장한 `docs/review/<TASK-ID>.review.md`를 공용 스크립트로 첨부 업로드. 경로는 **Step 4.7의 Batch Lookup 출력값을 리터럴로 사용** (lookup 재실행 금지, `NOT_FOUND`면 스킵 + 로컬 경로 안내):

```bash
bash "<JIRA_ATTACH_SH 경로>" <TASK-ID> docs/review/<TASK-ID>.review.md
```

출력은 `HTTP 200: <file>` (성공) / 그 외면 실패. 실패 시 로컬 파일 경로 안내 후 계속 진행.

### Step 5: Post Review to Jira

`python3 "<scripts>/jira-cli.py" comment <TASK-ID> @<scratchpad md 파일>`로 핵심만 두 줄 요약하여 게시한다 (`skills/_shared/jira-cli.md`). 상세 findings/Gap Analysis는 첨부 문서를 참조하도록 안내. 본문 끝의 reviewer 서명은 review-log 분석(Phase 1.4)에서 reviewer 식별에 사용되므로 반드시 유지:

```
## Code Review Complete

- 결과: <Approve | Request Changes | Needs Discussion> (설계-구현 매칭률 <N>%)
- 주요 findings: <Critical/Warning 1건 요약, 없으면 "없음">

상세 내용은 첨부된 `<TASK-ID>.review.md`를 참고하세요.

---
Reviewed by jira-reviewer subagent (model: <실제 리뷰 모델>)
```

### Step 6: Completion Summary

Approve 시에만 `skills/_shared/context-update.md`의 **호출 인자 구조만** 따라 worktree-local + aggregate `.jira-context.json`을 갱신 (review는 Jira transition 없음 → `STATUS="-"`). Request Changes 시 호출하지 않는다. 스크립트 경로는 그 문서의 lookup 지시 대신 **Step 4.7의 Batch Lookup 출력값을 리터럴로 사용** (lookup 재실행 금지):

```bash
python3 "<JIRA_CTX_UPDATE_PY 경로>" <TASK-ID> review "-" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

**Approve 시:**
```
---
✅ **Review Complete** — <TASK-ID>

- 결과: Approve
- Reviewer: jira-reviewer subagent (<실제 리뷰 모델>)
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
- Reviewer: jira-reviewer subagent (<실제 리뷰 모델>)
- 주요 이슈:
  - <Critical/Warning findings>
- Jira 코멘트 게시됨

**Progress**: init → start → approach → impl → test → **review ✗** → merge → pr → done

**Next**: 이슈 수정 후 `/jira-task review <TASK-ID>` 재실행
---
```
