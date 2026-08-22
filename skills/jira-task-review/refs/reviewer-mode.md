# Reviewer Mode 분기 + Mode A subagent prompt

> jira-task-review SKILL.md Step 2에서 호출 prompt에 `[review-self-mode]` 마커 유무에 따라 분기.

## Reviewer Independence Rule (필수)

코드 리뷰 본 작업(Gap Analysis + Lint & Format + Code Quality Review)은 plan/design/impl을 수행한 컨텍스트와 **분리된 환경**에서 수행되어야 한다 — self-praise / 사각지대 누락 차단 목적.

분리 환경 충족 방식 두 가지 (호출 컨텍스트에 따라 자동 분기):

### Mode A: Subagent Delegation (manual 호출)

**조건**: 호출 prompt에 `[review-self-mode]` 마커가 **없는** 경우 (예: 사용자가 `/jira-task review <TASK-ID>`를 main 세션에서 직접 실행).

**동작**: Step 2에서 `Agent` 도구로 `jira-reviewer` subagent를 띄워 리뷰 작업을 위임. main 세션은 Step 4 이후의 persistence/Jira 게시만 담당.

**모델 강제**: subagent 호출 시 `model: "opus"` 명시.

### Mode B: Self-Mode (이미 격리된 wrapper에서 호출)

**조건**: 호출 prompt에 `[review-self-mode]` 마커가 있는 경우 (예: `jira-task-auto`가 review 단계를 위해 띄운 격리된 wrapper sub-agent에서 본 Skill을 호출). 이 경우 wrapper sub-agent 자체가 plan/design/impl과 분리된 fresh context이므로 추가 nesting 불요.

**동작**: Step 2의 `Agent` 도구 호출을 **생략**하고, wrapper agent가 직접 리뷰 작업(gap analysis + lint + code quality + compile findings)을 수행. 출력 구조는 Mode A의 subagent 반환과 동일.

**제약**: sub-agent는 일반적으로 추가 `Agent` 호출 권한이 없으므로 self-mode를 강제하지 않으면 무조건 실패한다 — `[review-self-mode]` 마커가 없는데 `Agent` 도구가 부재한 환경에서 실행되면 즉시 에러로 중단(fallback 금지).

### Delta Mode (`[review-delta-mode]` — Mode B 전용 수식자)

**조건**: `[review-self-mode]`와 함께 `[review-delta-mode]` 마커가 있는 경우 — `jira-task-auto`의 fix loop 재리뷰. 1회차 리뷰는 항상 full이며, 이 마커 없이 delta로 줄이지 않는다.

**입력**: 직전 `docs/review/<TASK-ID>.review.md` + worktree `.jira-context.json`의 `fixSelfCheck` (`files` = fix agent가 수정한 파일, `lint`/`typecheck`/`relatedTests` 센서 결과).

**재검증 범위** — 다음만 Default-FAIL로 다시 검증한다:
1. 직전 리뷰의 Critical findings 전부
2. 직전 Gap Analysis 미충족 항목 전부
3. `fixSelfCheck.files`에 든 파일의 diff 라인 (새 findings 생성은 이 파일들에 한정)

그 외 직전 리뷰에서 통과한 항목은 **승계**한다 — 리포트에 `(직전 리뷰 승계)`로 표기하고 재확인하지 않는다. 승계는 이미 증거 확인을 거친 판정이므로 Default-FAIL 계약 위반이 아니다. Lint는 `implSelfCheck.lint`(fix agent가 갱신) 인용.

**출력**: Mode B와 동일 구조. `review-metrics`의 카운트는 승계 항목 + 재검증 결과를 **합산**한 현재 상태 (delta 범위만 세지 않는다 — auto 게이트가 그대로 읽는다). Step 4.7 review-log에 `deltaReview: true`를 포함한다.

## Mode A — Subagent 호출 (delegate)

**반드시 `Agent` 도구로 `subagent_type: "jira-reviewer"`, `model: "opus"`를 명시하여 호출**한다. main 세션이 직접 1-4를 수행하는 것을 금지한다 (self-praise bias 차단).

`Agent` 도구를 사용할 수 없는 환경(sub-agent 컨텍스트 등)이면 즉시 에러로 중단하고 호출자에게 `[review-self-mode]` 마커 누락을 안내한다 — fallback으로 main 세션이 직접 리뷰하지 않는다.

호출 prompt에 다음 컨텍스트를 명시적으로 전달:

```
TASK-ID: <TASK-ID>
Base branch: <base-branch>
Feature branch: feature/<TASK-ID>
Repo root: <REPO_ROOT 절대경로>
Worktree: <worktree 절대경로 — cwd가 워크트리면 cwd, 메인 레포면 aggregate `.jira-context.json`의 `tasks[]`에서 해당 TASK-ID의 `worktreePath`. implSelfCheck 조회는 이 경로의 `.jira-context.json`을 쓴다>

## 작업
다음 4가지를 순서대로 수행하고 결과를 구조화된 형태로 반환:

1. **Gap Analysis**: docs/approach/<TASK-ID>.approach.md가 있으면 Implementation Plan 항목별로 실제 구현 여부를 Glob/Grep으로 확인하고 매칭률 산출. 없을 때만 legacy fallback docs/design/<TASK-ID>.design.md 확인 (반대 순서 금지). 둘 다 없으면 스킵하되 리포트에 "Gap Analysis: 스킵 (approach 문서 없음 — <조회한 경로>)"를 명시하고 matchRate는 null로 반환.

2. **Lint & Format (인용 우선)**: worktree-local .jira-context.json의 implSelfCheck.lint를 먼저 확인한다.
   - 있으면 **lint를 재실행하지 않는다**. 그 기록을 Lint & Format 표에 인용하고 출처를 "impl self-check 인용"으로 표기한다 (lint는 커밋 시점 1회 원칙 — impl 단계가 그 1회).
   - 없으면 fallback으로 직접 실행: 도구 판정은 `bash <scripts>/detect-lint.sh` 1회로 (출력 LINT/FORMAT/NONE — 선언된 도구만 판정). 출력된 명령에 변경 파일 전체를 인자로 한 번에 실행 — 파일별 반복 실행 금지. NONE이면 "Skipped (선언된 도구 없음)"으로 기록.

   lint 실패가 있어도 리뷰를 중단하지 않는다. 포맷터 결과는 Lint & Format 표에만 남기고 findings로 승격하지 않는다.

3. **Code Quality Review**: 1차 입력은 `git diff <base-branch>..feature/<TASK-ID>` 본문 — 변경 파일 전문을 읽지 마라. 보안 취약점(injection/XSS/하드코딩 credentials), 에러 핸들링 누락, 네이밍 일관성, 불필요한 복잡도를 검토. findings는 diff에 포함된 라인에 대해서만 생성하고, 맥락이 필요할 때만 해당 파일을 선택적으로 Read한 뒤 그 사실을 리포트에 남긴다.

4. **Compile Findings**: Critical / Warning / Info 3단계로 분류. 파일:라인 참조 포함.

단계별 소요 기록: 1~3 각 단계에서 어차피 실행하는 bash 명령에 `date +%s`를 편승시켜 단계별 소요(초)를 근사 측정한다 — 타이밍만을 위한 별도 Bash 호출 금지. 측정 못 한 단계는 null. lint를 implSelfCheck 인용으로 대체한 경우도 lintSec: null (실행 없음 = 측정 없음).

## 출력 형식 (반드시 따를 것)
- 맨 앞에 구조화 필드 블록 (형식 변경 금지 — 호출자가 자동 판정에 사용):
  ```
  <!-- review-metrics
  matchRate: <N | null>
  criticalCount: <N>
  warningCount: <N>
  infoCount: <N>
  -->
  ```
- 그 바로 다음에 소요 기록 블록 (게이트 판정에 미사용, review-log 축적용):
  ```
  <!-- review-timings
  gapSec: <N | null>
  lintSec: <N | null>
  qualitySec: <N | null>
  -->
  ```
- 결과: Approve / Request Changes / Needs Discussion 중 하나
- 검토 파일 수, 커밋 수
- Gap Analysis: 매칭률 + 미구현 항목
- Lint & Format: 도구별 표 (대상 파일 수 / 결과 / 주요 이슈)
- Code Quality Findings: Critical / Warnings / Info 분류 (severity별 상위 10건)
- Positive Notes: 잘 된 점 (3건 이내)

분량 상한: 전체 200줄 이내. 각 finding은 `파일:라인 — 한 줄 요약` + 근거 1문장 (항목당 문단 금지).

산출물 작성 시 templates/review.template.md를 Read해서 contract(필수/옵셔널 분류, 옵셔널 마커 규약)를 따른다.
```

**금지 사항**:
- `Agent` 호출 없이 main 세션이 Bash로 lint를 직접 실행하는 것 금지
- `Agent` 호출 없이 main 세션이 변경 파일을 Read해서 코드 품질 평가하는 것 금지
- subagent에 `model` 파라미터 생략 금지 (반드시 `"opus"`)
