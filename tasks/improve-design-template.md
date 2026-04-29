# Design 템플릿 보강 계획

- **Status**: Draft
- **Created**: 2026-04-29
- **Target file**: `templates/design.template.md`, `skills/jira-task-design/SKILL.md`
- **Related**: `tasks/improve-plan-template.md` (선행 작업 — v0.18.0에서 plan에 Source Requirements / Open Items 신설됨)

## 배경

PDCA 사이클에서 design은 "**어떻게 만들 것인가**"를 결정하는 단계다. 현재 `design.template.md`는 구조(Section contract, Data Model 6종 분류, AC↔Test 매핑)는 잘 잡혀 있으나, **결정의 근거가 기록되지 않는다**:

1. **`Key Decisions` 섹션이 없다.** 대안과 선택 이유, trade-off가 어디에도 기록되지 않아 6개월 뒤 "왜 이 방식을 골랐지?"의 답을 잃는다. 이전 평가에서 design 템플릿의 가장 큰 결함으로 지목됨.
2. **plan의 Open Items와 단절되어 있다.** v0.18.0에서 plan이 P1 Open Questions / [CONFLICT] / AC 매핑 누락을 Open Items로 design에 이월할 수 있게 됐는데, design 템플릿과 SKILL이 이를 명시적으로 소비하지 않는다.
3. **Open Items 섹션이 옵셔널이다.** impl로 들어갈 때 "남은 미결 항목 0건"을 강제할 게이트가 없다.
4. **Implementation Plan 표에 규모(S/M/L)가 없다.** plan의 Task Breakdown은 v0.18.0에서 규모 컬럼이 추가됐는데 design 쪽은 안 맞춰져 있어 일관성이 깨졌다.
5. **Architecture 섹션이 너무 자유롭다.** 결정해야 할 항목(컴포넌트 신규/수정, 의존 방향, 외부 시스템 경계)이 명시되어 있지 않다.

## 목표

design이 plan과 양방향 trace로 연결되고, "어떻게"에 대한 결정을 명시적으로 기록하도록 보강한다.

- **양방향 trace 완성**: discover → plan → design 사슬에서 design이 plan의 Open Items를 명시적으로 소비.
- **결정의 명시적 기록**: Key Decisions 섹션으로 ADR 형식의 결정 로그 강제.
- **impl 진입 게이트**: Open Items가 "N/A — 모두 해결" 또는 "이월 사유 명시"여야 impl 진입.

## 변경 사항

### 1. `Plan Inputs` 섹션 신설 (필수)

**위치**: Overview 다음 (또는 Architecture 직전).

**목적**: plan의 산출물을 design이 명시적으로 소비. design은 plan의 *결정*을 받아 *구현 방식*으로 변환하는 단계임을 구조적으로 강제.

```markdown
## Plan Inputs

- **Plan doc**: `docs/plan/<TASK-ID>.plan.md`
  (plan 미수행 시: "N/A — plan 생략 (출처: <Jira issue / 직접 협의>)")

### Plan Open Items 처리

<!-- plan의 Open Items 섹션을 그대로 받아, 각 항목에 design에서의 처리 결과를 기록. -->

| # | plan Open Item | design에서의 처리 | 결과 |
|---|---|---|---|
| 1 | {plan의 Open Item} | resolved / deferred / out-of-scope | {답 또는 사유} |

### AC ↔ 구현 매핑

<!-- plan의 AC가 design의 어느 컴포넌트/모듈로 실현되는지. Test Plan의 매핑(AC↔U/E)과는 별개:
     이건 "어디서 구현되는가", Test Plan은 "어디서 검증되는가". -->

| AC (plan) | 구현 위치 (design) |
|---|---|
| AC-1 | {component / module / file} |
```

### 2. `Key Decisions` 섹션 신설 (필수)

**위치**: Architecture 다음, Data Model 직전.

**목적**: design의 결정 근거를 ADR 형식으로 강제 기록. *어떻게 만들지*에 대한 결정만 (스코프 결정은 plan에 있음).

```markdown
## Key Decisions

<!-- design이 내린 *구현 방식*에 대한 결정. 스코프 결정은 plan으로. 0건일 수 없다. -->

| # | 결정 | 대안 | 선택 이유 | 비용/제약 |
|---|---|---|---|---|
| 1 | {what — e.g. "OTP를 비동기 큐로 검증"} | {alternative — e.g. "동기 호출"} | {why} | {cost/constraint} |
```

본문에 결정이 1건 이하면 표 대신 bullet 1-2개로 대체 가능하나, "변경 없음 — 기존 패턴 유지" 결정 자체는 반드시 기록.

### 3. `Open Items` 옵셔널 → 필수로

**현재**: `<!-- optional: impl 진입 직전 결정해야 할 미결 항목이 있을 때. -->`
**변경 후**: 필수. 없으면 `N/A — 모두 해결` 한 줄.

**근거**: impl 진입 게이트. plan의 Open Items가 design을 거치며 모두 처리되어야 한다. 미해결 항목이 코드 안으로 숨는 것을 막음.

### 4. `Implementation Plan` 표에 `규모` 컬럼 추가

```markdown
| # | 파일 | 변경 유형 | 규모 | 요약 |
|---|------|---------|---|------|
| 1 | `{path}` | 신규/수정/삭제 | S/M/L | {1-2줄 요약} |
```

plan의 Task Breakdown 규모 컬럼과 일관성 맞춤. design이 추정한 파일별 규모가 plan 추정과 어긋나면 Open Items로 이월.

### 5. `Architecture` 섹션 가이드 강화

기존 자유 서술을 유지하되, **최소 결정 항목**을 가이드로 명시:

```markdown
## Architecture

<!-- 최소한 다음 셋은 명시 (해당 없으면 "N/A"):
     1. 새로 추가되는 컴포넌트 vs 기존 컴포넌트 수정
     2. 모듈 간 의존 방향
     3. 외부 시스템과의 경계 (in-process / sync API / async)
-->
```

본문 형식은 자유(다이어그램 / 트리 / 텍스트). 강제는 위 세 항목의 답이 어딘가 들어가 있어야 한다는 것뿐.

### 6. Section contract 갱신

```
필수: Plan Inputs (신설), Architecture, Key Decisions (신설), Data Model, Sequence Diagram,
      Implementation Plan, Error Handling, Security Checklist, Test Plan, Open Items (격상)
권장: Overview
옵셔널: Out of Scope, Interfaces / Types, Notes
```

### 7. SKILL.md 보강

`skills/jira-task-design/SKILL.md`:

- **Step 1.5 신설**: plan 문서를 Read한 뒤 Open Items / Source Requirements / AC 표를 추출. P1 미해결 항목이 있으면 design에서 풀거나 명시적으로 이월.
- **Step 3 작성 가이드 추가**: 신설/강화 섹션별 작성 지침. 특히 Key Decisions가 0건일 수 없음, Plan Open Items 처리 표가 빠짐없이 채워져야 함을 명시.

## 최종 구조 (변경 후)

```
## Overview                 (권장)
## Plan Inputs              (신설, 필수)
## Architecture             (필수, 가이드 강화)
## Key Decisions            (신설, 필수)
## Data Model               (필수)
## Sequence Diagram         (필수)
## Implementation Plan      (필수, 규모 컬럼 추가)
## Error Handling           (필수)
## Security Checklist       (필수)
## Test Plan                (필수)
## Out of Scope             (옵셔널)
## Open Items               (필수로 격상)
## Notes                    (옵셔널)
```

## 영향 범위

- `templates/design.template.md` 본체.
- `skills/jira-task-design/SKILL.md` Step 1.5 신설 + Step 3 가이드.
- `.claude-plugin/plugin.json` 버전 → `0.18.1` (template contract 변경, 하지만 plan과 동일 minor 사이클이므로 patch).
  - 재고: contract 추가는 minor 변경에 가까움. 0.19.0이 더 정확. → **0.19.0으로 결정**.

## 비목표

- discover 템플릿 수정 (별도 task: Goals↔FR 매핑 추가).
- plan 템플릿 추가 수정.
- design 단계의 자동 분석 로직 강화 (예: codebase 분석 결과를 Architecture에 자동 채움).

## 검증 기준

1. **Trace 검증**: 임의의 design.md를 골라 → plan의 모든 Open Item이 Plan Inputs > Plan Open Items 처리 표에 들어가 있는가? plan의 모든 AC가 AC↔구현 매핑 표에 있는가?
2. **결정 검증**: design을 읽은 사람이 "왜 이 구현 방식을 골랐는가, 무엇을 거부했는가"를 답할 수 있는가?
3. **impl 게이트 검증**: Open Items에 미해결 P1 항목이 있는 채로 impl이 시작되지 않는가? (SKILL이 경고하는가)

## Resolved Decisions

- **Plan Inputs 위치**: Overview 다음 / Architecture 직전. design 본문 시작 전에 plan과의 연결을 먼저 명시하는 것이 자연스러움.
- **Key Decisions 위치**: Architecture 다음, Data Model 직전. Architecture에서 큰 그림을 잡고, 그 그림을 *왜* 그렇게 그렸는지 Key Decisions가 설명하고, 그 결과로 Data Model이 따라오는 흐름.
- **plan vs design 결정 경계** (v0.18.0과 동일): plan은 "*무엇을 / 어디까지*", design은 "*어떻게*". Key Decisions에는 후자만.
- **버전**: 0.19.0 (template contract 추가 변경).
