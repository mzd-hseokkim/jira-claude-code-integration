# Discover (requirements) 템플릿 보강 계획

- **Status**: Draft
- **Created**: 2026-04-29
- **Target**: `templates/requirements.template.md`, `skills/jira-task-discover/SKILL.md`
- **Related**: `tasks/improve-plan-template.md` (v0.18.0), `tasks/improve-design-template.md` (v0.19.0)

## 배경

discover는 PDCA에서 **결정을 위한 입력**을 만드는 단계다. 결정 자체는 plan에서 일어난다. 따라서 discover 템플릿의 책무는 "**plan이 결정할 때 필요한 정보를 빠짐없이 정리**"하는 것이다.

이전 평가에서 requirements 템플릿은 A-로 평가되었고, 권고된 보강 3가지가 있었다:

1. **Goals ↔ FR 매핑 표** — plan의 `Goal Coverage` 표(v0.18.0)와 호환. 어떤 FR이 어떤 Goal을 만족하는지 명시되어야 plan이 스코프 컷을 결정할 수 있음.
2. **Constraints 4종 분리** (기술/시간/비용/규제) — plan이 스코프를 자를 때 어느 제약이 살아있는지 봐야 함.
3. **NFR 항목별 명시 강제** (placeholder 통과 방지).

이 셋이 본 작업의 범위다.

## 목표

- discover의 trace marker가 plan의 결정 흐름에서 끊기지 않도록, **Goals ↔ FR 매핑**을 명시적으로 드러낸다.
- Constraints와 NFR이 비어 있거나 placeholder로 통과되는 경로를 차단한다.

## 변경 사항

### 1. `Goals ↔ FR 매핑` 표 신설 (필수)

**위치**: Functional Requirements 섹션 직후.

**목적**: plan의 `Goal Coverage` 표(v0.18.0)와 호환. plan은 이 매핑을 입력으로 받아 "이번 사이클에 어느 Goal까지 만족시킬지"를 결정.

```markdown
## Goals ↔ FR 매핑

<!-- Goals & Success Criteria의 각 Goal이 어떤 Functional Requirement로 만족되는지.
     - 한 Goal이 여러 FR에 걸쳐도 됨 (콤마 구분).
     - 어떤 FR도 매핑되지 않은 Goal이 있으면 Open Questions로 격상 ([P1] 권장).
     - 어떤 Goal에도 매핑되지 않은 FR이 있으면 Out of Scope 후보로 표시하거나 추가 Goal 도출. -->

| Goal | 만족하는 FR | 비고 |
|---|---|---|
| {Goal 1 — 측정 기준 포함} | FR-1, FR-3 | |
| {Goal 2} | FR-2 | |
```

**검증**:
- 모든 Goal에 최소 1개 FR이 매핑되거나 Open Questions로 격상.
- 모든 FR이 어떤 Goal에 기여 (안 그러면 합성 오류 가능성 → 재검토).

### 2. `Constraints` 섹션 4종 분리 (필수)

**현재**: "기술/시간/비용/규제 제약" 한 덩어리 자유 서술.
**변경 후**: 4 sub-section으로 명시 분리. 해당 없는 카테고리는 `N/A — <사유>` 한 줄.

```markdown
## Constraints

<!-- 4종 분리 강제. 빈 카테고리는 "N/A — 해당 없음" 한 줄.
     plan이 스코프 컷 결정 시 어느 제약이 살아있는지 보기 위함. -->

### Technical
- {기술 스택, 의존, 호환성 등}

### Schedule
- {일정/마감}

### Cost
- {예산/리소스}

### Regulatory
- {법적/컴플라이언스/보안 정책}
```

### 3. `Non-functional Requirements` 항목별 명시 강제

**현재**: 자유 서술. `--lite`면 `N/A — lite mode`.
**변경 후**: 권장 카테고리 표 형식. 각 카테고리는 값 또는 `N/A — <사유>` 명시. placeholder("TBD") 통과 차단.

```markdown
## Non-functional Requirements

<!-- 각 항목은 값 또는 "N/A — <사유>"로 명시. "TBD" placeholder는 Open Questions로 격상 권장.
     --lite 모드에서는 본 섹션 전체를 "N/A — lite mode" 한 줄로 대체 (--lite 정합성 유지). -->

| 항목 | 값 | 비고 |
|---|---|---|
| 성능 (응답시간/처리량) | {값 또는 N/A — <사유>} | |
| 가용성 / SLA | {값 또는 N/A — <사유>} | |
| 보안 (인증/암호화) | {값 또는 N/A — <사유>} | |
| 확장성 (사용자/데이터 규모) | {값 또는 N/A — <사유>} | |
| 관측성 (로깅/메트릭) | {값 또는 N/A — <사유>} | |
| 호환성 (브라우저/OS/API) | {값 또는 N/A — <사유>} | |
```

### 4. SKILL.md 보강

`skills/jira-task-discover/SKILL.md`:

- **Step 4 (Generate Requirements Document)** 채워야 할 내용 목록에 다음 추가:
  - `Goals ↔ FR 매핑 표` (Functional Requirements 합성 직후 매핑 도출)
  - `Constraints` 4 sub-section (Q3 답변을 4종으로 분류. 답변에 명시되지 않은 카테고리는 `N/A — 해당 없음`).
  - `NFR` 표 형식 (Q4 답변을 6 카테고리로 분류).
- **Step 4.5 (Synthesis Confirm)**: confirm 대상에 `Goals ↔ FR 매핑 검증` 추가 — 매핑되지 않은 Goal이 있으면 사용자에게 경고하고 Open Questions로 격상할지 묻는다.
- **Inline Fallback Template** (SKILL 하단의 fallback 구조)도 위 3개 변경에 맞춰 동기화.

### 5. 마이그레이션·호환성

- 기존 requirements.md (v0.18.0 이전 형식)는 그대로 유효. plan SKILL은 신설 표가 *없으면* `Goal Coverage`를 사용자 답변으로 채우는 fallback이 이미 있음.
- v0.19.0의 design SKILL도 `requirements 형식 변경`에 직접 의존하지 않음 (plan을 통해서만 간접 소비).

따라서 본 변경은 신규 산출물에만 적용되며, 기존 산출물은 영향 없음.

## 최종 구조 (변경 후)

```
## Stakeholders
## Goals & Success Criteria
## Constraints                  (4 sub-section 분리)
## Non-functional Requirements  (6 카테고리 표)
## Codebase Context
## Functional Requirements
## Goals ↔ FR 매핑              (신설, 필수)
## Edge Cases                   (--lite 시 생략, 기존 유지)
## Out of Scope                 (--lite 시 생략, 기존 유지)
## Open Questions
## Proposed Issue Breakdown
```

## 영향 범위

- `templates/requirements.template.md` 본체 수정.
- `skills/jira-task-discover/SKILL.md` Step 4 / Step 4.5 / Inline Fallback 보강.
- `.claude-plugin/plugin.json` → `0.20.0` (template contract 추가, 신설 섹션 1개 + 형식 강제 2개).

## 비목표

- requirements 템플릿의 다른 섹션 재구조화 (Stakeholders 확장 등 — 이전 평가에서 결정 단계의 일이라 제외).
- Goals 자체의 형식 강제 강화 (이미 `<지표명> · <현재값> → <목표값> · <측정방법>`로 잡혀 있음).
- discover의 LLM 합성 알고리즘 개선.

## 검증 기준

1. **매핑 검증**: 임의의 requirements.md를 골라 → 모든 Goal에 FR이 매핑되는가? plan이 그 매핑을 그대로 Goal Coverage 표로 옮길 수 있는가?
2. **Constraints 분리 검증**: 4 sub-section이 모두 있는가? 빈 카테고리가 명시적으로 N/A인가, 누락인가?
3. **NFR placeholder 차단**: 6 카테고리 모두 값 또는 N/A인가? `TBD`가 슬쩍 통과하는 케이스가 없는가?

## Resolved Decisions

- **위치**: Goals ↔ FR 매핑은 Functional Requirements 직후. Goals와 FR이 모두 정의된 다음에 매핑이 의미를 가짐.
- **`--lite` 모드 정합성**: NFR은 기존대로 `N/A — lite mode` 한 줄. Goals↔FR 매핑은 `--lite`에서도 유지 (FR 합성이 활성이므로).
- **버전**: 0.20.0 (신설 섹션 1개 + 형식 강제 2개. 기존 산출물 호환은 깨지 않으나 신규 contract 추가로 minor bump).
