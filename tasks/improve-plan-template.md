# Plan 템플릿 보강 계획

- **Status**: Draft
- **Created**: 2026-04-29
- **Target file**: `templates/plan.template.md`
- **Related templates**: `templates/requirements.template.md`, `templates/design.template.md`

## 배경

PDCA 사이클에서 **plan은 "스코프·범위를 결정"하는 단계**다. discover는 결정을 위한 입력(requirements 문서)을 만들고, design은 구현 방식을 결정하며, plan은 그 사이에서 **무엇을 어디까지 할 것인가**를 정한다.

현재 `plan.template.md`는 구조적으로는 깔끔하지만, 다음 결함이 있다:

1. **discover 산출물과의 연결이 0**이다. requirements 문서의 trace marker, P1 Open Questions, [CONFLICT] 항목이 plan에서 명시적으로 소비되지 않아, plan이 끝난 뒤에도 "이 plan이 discover의 어떤 요구를 충족하는가"를 역추적할 수 없다.
2. **Out of Scope에 사유·복귀시점이 없다.** plan의 핵심 결정인 "왜 이걸 뺐는가"가 기록되지 않는다.
3. **AC가 discover Goal과 In Scope에 매핑되지 않는다.** 누락 검증 불가능.
4. **Task Breakdown에 의존·규모·우선순위가 없다.** critical path와 재협상 여지가 보이지 않는다.
5. **결정 자체를 기록하는 섹션이 없다.** 스코프 컷, 접근 방식 선택, trade-off 등 plan이 내린 결정의 *근거*가 사라진다.
6. **Open Items 섹션이 없다.** discover의 P1 Open Questions를 plan이 못 풀고 design으로 넘길 때 그 자리가 없다.

## 목표

plan 템플릿이 다음 둘을 동시에 만족하도록 보강한다:

- **양방향 trace**: discover의 요구(Goals/FR/Open Questions/CONFLICT) → plan의 결정 → design의 구현. 어느 방향에서도 추적 가능.
- **결정의 명시적 기록**: 무엇을 골랐고, 왜 골랐고, 무엇은 미뤘는가.

## 변경 사항

### 1. `Source Requirements` 섹션 신설 (필수)

**위치**: Background 다음, Scope 앞.

**목적**: discover 산출물을 plan이 명시적으로 소비하게 한다.

```markdown
## Source Requirements

- **Requirements doc**: `docs/requirements/<slug>.requirements.md`
  (discover 단계를 거치지 않은 경우 "N/A — discover 생략, 출처: <Jira issue / 회의록 / etc>")
- **Resolved Open Questions** (discover의 P1/P2 항목):
  | # | 우선순위 | 질문 | 답 (plan에서의 결정) |
  |---|---|---|---|
  | Q4 | P1 | {discover의 질문} | {plan에서의 답} |
- **Resolved [CONFLICT]s**:
  | 항목 | import 값 | answer 값 | 선택 | 사유 |
- **Goal Coverage**:
  | Discover Goal | 이번 plan에서 만족 (Y/N/Partial) | 비고 |
```

**검증**: P1 Open Questions가 모두 답이 있거나 명시적으로 design으로 이월되어야 한다 (Open Items 섹션 참조).

### 2. Scope 섹션 강화 (필수)

**Out of Scope를 표 형식으로 변경**:

```markdown
### Out of Scope

| 항목 | 사유 | 복귀 예정 |
|---|---|---|
| {item} | {왜 뺐는가} | {다음 사이클 / 영구 제외 / TBD} |
```

**In Scope에 source trace 추가** (선택적이나 권장):

```markdown
### In Scope

- {item} *(source: requirements FR-2)*
```

### 3. `Acceptance Criteria` 매핑 표 추가 (필수)

기존 AC 본문 아래에 매핑 표를 추가한다:

```markdown
### AC ↔ Goal/Scope 매핑

| AC | Discover Goal | In Scope item |
|---|---|---|
| AC-1 | Goal 1 | item-A |
```

이 표 하나로 (a) AC가 discover Goal을 커버하는지, (b) In Scope item이 AC로 검증되는지 — 양방향 누락을 검증한다.

### 4. `Scope Decisions` 섹션 신설 (필수)

**위치**: Acceptance Criteria 다음.

**목적**: plan이 내린 *결정의 근거*를 기록한다. 스코프 컷, 접근 방식 선택, 일정·자원 trade-off.

```markdown
## Scope Decisions

| # | 결정 | 대안 | 선택 이유 | 영향 |
|---|---|---|---|---|
| 1 | {what was decided} | {what else was considered} | {why this} | {scope/timeline/risk} |
```

본문에 결정이 1건 이하면 표 대신 bullet 1-2개로 대체 가능. 결정이 0건일 수 없음 (있다면 "변경 없음 — 기존 방식 유지" 결정 자체를 기록).

### 5. `Task Breakdown` 표 컬럼 확장 (필수)

```markdown
| # | Task | 의존 | 규모(S/M/L) | 우선순위 (필수/nice) | Verification |
|---|------|---|---|---|---|
```

- **의존**: 다른 task 번호 또는 외부 시스템.
- **규모**: S(<반나절) / M(반나절~2일) / L(2일+). 정확한 추정이 아니라 **재협상 가능성**을 보기 위함.
- **우선순위**: 필수 / nice-to-have. 시간이 모자라면 어디까지 자를 수 있는지 보이도록.

### 6. `Open Items` 섹션 신설 (필수)

**위치**: Scope Decisions 다음.

```markdown
## Open Items

- {item — 사유 + 누가/언제 풀 것인가}
- (없으면) "N/A — 모두 해결"
```

design의 Open Items와 동일한 역할. plan을 닫는 게이트.

### 7. `Risks`를 옵셔널 → 필수로

빈 경우 표 대신 "N/A — 식별된 위험 없음 (검토 완료)" 한 줄. 그냥 섹션 누락은 금지.

## 최종 구조 (변경 후)

```
## Background                  (필수)
## Source Requirements         (신설, 필수)
## Scope                       (필수, Out of Scope 표 형식 변경)
## Acceptance Criteria         (필수, 매핑 표 추가)
## Scope Decisions             (신설, 필수)
## Task Breakdown              (필수, 컬럼 확장)
## Risks                       (필수로 격상)
## Open Items                  (신설, 필수)
## Edge Cases                  (옵셔널, 유지)
```

## 영향 범위

- `templates/plan.template.md` 본체 수정.
- `skills/jira-task-plan/SKILL.md` — 신설 섹션을 채우도록 지시 보강. 특히 Source Requirements 섹션은 discover 산출물을 읽는 단계가 추가되어야 함.
- `skills/jira-task-design/SKILL.md` — design 단계에서 plan의 Source Requirements / Open Items / AC 매핑 표를 참조하도록 보강 (양방향 trace 완성).
- `templates/design.template.md` — design의 AC 매핑 표가 plan의 매핑 표와 호환되는지 재검토.

## 비목표 (이번 작업에서 다루지 않음)

- discover 템플릿(requirements.template.md) 수정. 별도 task로 분리.
- design 템플릿의 `Key Decisions` 섹션 추가. 별도 task로 분리.
- plan 단계의 자동화(LLM이 Source Requirements를 자동 채우는 로직 등). 템플릿 정비가 우선이고, 자동화는 그 다음 단계.

## 검증 기준

이 보강이 성공했는지는 다음 셋으로 판단한다:

1. **Trace 검증**: 임의의 plan.md를 골라 → 그 plan의 모든 AC가 discover Goal로 역추적 가능한가? 모든 In Scope가 AC로 검증되는가?
2. **결정 검증**: plan을 읽은 사람이 "왜 X를 뺐고, 왜 Y 방식을 골랐는가"를 답할 수 있는가?
3. **재협상 검증**: 시간이 절반으로 줄었을 때, plan을 보고 "어디를 자를 것인가"를 정할 수 있는가?

## Resolved Decisions

- **discover 미수행 레거시 케이스**: Source Requirements 섹션에서 `Requirements doc: N/A — discover 생략 (출처: <Jira issue / 회의록 / etc>)`로 표기하고, 그 아래 옵셔널 sub-section `Inline Requirements`를 둔다. 거기에 Goals / Resolved Questions를 직접 적도록 한다. trace marker는 없지만 결정 흔적은 남는다.
- **plan Scope Decisions vs design Key Decisions 경계**: plan = "*무엇을 / 어디까지* 할 것인가" (스코프 결정). design = "*어떻게* 만들 것인가" (구현 방식 결정). 예: "OTP 인증을 이번 사이클에 포함" = plan, "OTP를 동기/비동기 어디서 검증할지" = design. 이 원칙을 plan 템플릿 상단 주석(Section contract)에 박아둔다.
