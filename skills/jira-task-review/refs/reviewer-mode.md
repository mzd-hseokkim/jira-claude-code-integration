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

## Mode A — Subagent 호출 (delegate)

**반드시 `Agent` 도구로 `subagent_type: "jira-reviewer"`, `model: "opus"`를 명시하여 호출**한다. main 세션이 직접 1-4를 수행하는 것을 금지한다 (self-praise bias 차단).

`Agent` 도구를 사용할 수 없는 환경(sub-agent 컨텍스트 등)이면 즉시 에러로 중단하고 호출자에게 `[review-self-mode]` 마커 누락을 안내한다 — fallback으로 main 세션이 직접 리뷰하지 않는다.

호출 prompt에 다음 컨텍스트를 명시적으로 전달:

```
TASK-ID: <TASK-ID>
Base branch: <base-branch>
Feature branch: feature/<TASK-ID>
Repo root: <REPO_ROOT 절대경로>

## 작업
다음 4가지를 순서대로 수행하고 결과를 구조화된 형태로 반환:

1. **Gap Analysis**: docs/approach/<TASK-ID>.approach.md가 있으면 Implementation Plan 항목별로 실제 구현 여부를 Glob/Grep으로 확인하고 매칭률 산출. 없을 때만 legacy fallback docs/design/<TASK-ID>.design.md 확인 (반대 순서 금지). 둘 다 없으면 스킵하되 리포트에 "Gap Analysis: 스킵 (approach 문서 없음 — <조회한 경로>)"를 명시하고 matchRate는 null로 반환.

2. **Lint & Format Check**: 변경 파일 중 다음 확장자에 대해, 프로젝트가 선언한 도구만 실행:
   - Node.js: .js/.ts/.jsx/.tsx/.mjs/.cjs → npx --no-install eslint, npx --no-install prettier --check
   - Python (pyproject.toml/setup.py/requirements.txt 있을 때): .py → ruff check / ruff format --check, 또는 flake8
   - Java/Kotlin (pom.xml/build.gradle 있을 때): .java/.kt/.kts → checkstyle

   도구 존재 판정은 실행 성공 여부가 아니라 package.json의 dependencies/devDependencies 선언 또는 node_modules/<tool> 존재로 한다 — npx가 레지스트리에서 자동 설치해버려 "없으면 스킵"이 발동하지 않는다. 포맷터는 설정 파일(.prettierrc*/prettier.config.*/package.json의 prettier 키)이 있을 때만 실행하고, 없으면 "Skipped (prettier 설정 없음)"으로 기록.

   lint/format은 변경 파일 전체를 인자로 한 번에 실행한다. 파일별로 반복 실행하지 마라 — 도구 기동 비용이 파일당 10초 이상이다.
   예: npx --no-install eslint <file1> <file2> ... <fileN>

   lint 실패가 있어도 리뷰를 중단하지 않는다. 포맷터 결과는 Lint & Format 표에만 남기고 findings로 승격하지 않는다.

3. **Code Quality Review**: 1차 입력은 `git diff <base-branch>..feature/<TASK-ID>` 본문 — 변경 파일 전문을 읽지 마라. 보안 취약점(injection/XSS/하드코딩 credentials), 에러 핸들링 누락, 네이밍 일관성, 불필요한 복잡도를 검토. findings는 diff에 포함된 라인에 대해서만 생성하고, 맥락이 필요할 때만 해당 파일을 선택적으로 Read한 뒤 그 사실을 리포트에 남긴다.

4. **Compile Findings**: Critical / Warning / Info 3단계로 분류. 파일:라인 참조 포함.

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
