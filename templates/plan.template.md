# Plan: {task_id} - {summary}

<!--
Section contract:
- 필수(required): Background, Source Requirements, Scope, Acceptance Criteria, Scope Decisions, Task Breakdown, Risks, Open Items
- 옵셔널(optional): Edge Cases — 필요 시 포함

가변 섹션 마커 규약:
- 형식: `<!-- optional: <조건 또는 사유> -->`
- 헤더 직전 줄에 위치. 자동 처리 대상이 아닌 LLM/사람 참고용 힌트.
- 옵셔널 섹션을 생략할 때는 헤더 자체를 제거하거나, 본문에 "N/A — <사유>" 한 줄로 둔다.
- 필수 섹션은 비어 있을 수 없다. 해당 사항이 없으면 "N/A — <사유>" 한 줄을 둔다.

plan vs design 결정 경계:
- plan은 "*무엇을 / 어디까지* 할 것인가"를 결정한다 (스코프 결정).
- design은 "*어떻게* 만들 것인가"를 결정한다 (구현 방식 결정).
- 예: "OTP 인증을 이번 사이클에 포함" = plan, "OTP를 동기/비동기 어디서 검증할지" = design.
-->

## Background

{description from Jira issue}

## Source Requirements

- **Requirements doc**: `docs/requirements/<slug>.requirements.md`
  (discover 생략 시: "N/A — discover 생략 (출처: <Jira issue / 회의록 / etc>)")

<!-- optional: discover를 생략한 경우, requirements 본문 대신 이 sub-section에 Goals와 답을 직접 적는다. -->
### Inline Requirements

- Goals: {측정 가능한 목표. 형식: <지표명> · <현재값> → <목표값> · <측정방법>}
- Resolved Questions: {plan 시점에 답이 정해진 질문과 답}

### Resolved Open Questions

<!-- discover의 P1/P2 항목을 plan에서 어떻게 답했는지 기록. discover를 생략했거나 해당 항목이 없으면 "N/A". -->

| # | 우선순위 | 질문 | 답 (plan에서의 결정) |
|---|---|------|------|
| Q4 | P1 | {discover의 질문} | {plan에서의 답} |

### Resolved [CONFLICT]s

<!-- discover의 [CONFLICT] 항목을 plan에서 어떻게 결정했는지 기록. 없으면 "N/A". -->

| 항목 | import 값 | answer 값 | 선택 | 사유 |
|---|---|---|---|---|
| {field} | {a} | {b} | {a or b} | {why} |

### Goal Coverage

| Discover Goal | 이번 plan에서 만족 (Y/N/Partial) | 비고 |
|---|---|---|
| Goal 1 | Y | |

## Scope

### In Scope

<!-- 가능하면 각 항목 끝에 source trace를 부착: *(source: requirements FR-2)* -->

- {item} *(source: FR-N)*

### Out of Scope

| 항목 | 사유 | 복귀 예정 |
|---|---|---|
| {item} | {왜 뺐는가} | {다음 사이클 / 영구 제외 / TBD} |

## Acceptance Criteria

### AC-1: {criterion_name}
- Given: {precondition}
- When: {action}
- Then: {expected_result}

### AC ↔ Goal/Scope 매핑

<!-- 양방향 누락 검증용. (a) AC가 discover Goal을 커버하는지, (b) In Scope item이 AC로 검증되는지. -->

| AC | Discover Goal | In Scope item |
|---|---|---|
| AC-1 | Goal 1 | item-A |

## Scope Decisions

<!-- plan이 내린 *결정의 근거*. 스코프 컷, 접근 방식 선택, 일정·자원 trade-off.
     결정이 0건일 수 없다 — 있다면 "변경 없음 — 기존 방식 유지" 결정 자체를 기록.
     1건 이하면 표 대신 bullet으로 대체 가능. -->

| # | 결정 | 대안 | 선택 이유 | 영향 |
|---|---|---|---|---|
| 1 | {what was decided} | {what else was considered} | {why this} | {scope/timeline/risk} |

## Task Breakdown

<!-- 의존: 다른 task 번호 또는 외부 시스템.
     규모: S(<반나절) / M(반나절~2일) / L(2일+). 정확한 추정이 아니라 재협상 가능성 표시.
     우선순위: 필수(must) / nice-to-have. 시간이 모자라면 어디까지 자를 수 있는지. -->

| # | Task | 의존 | 규모 | 우선순위 | Verification |
|---|------|---|---|---|------|
| 1 | {task} | - | M | must | {how_to_verify} |

## Risks

<!-- 빈 경우 표 대신 "N/A — 식별된 위험 없음 (검토 완료)" 한 줄. 섹션 누락 금지. -->

| Risk | Impact | Mitigation |
|------|--------|------------|
| {risk} | {impact} | {mitigation} |

## Open Items

<!-- plan이 닫지 못하고 design으로 이월하는 결정 항목. 빈 경우 "N/A — 모두 해결" 한 줄. -->

- {item — 사유 + 누가/언제 풀 것인가}

<!-- optional: 경계 조건·예외 입력·드문 시나리오를 별도로 다뤄야 할 때 포함. -->
## Edge Cases

- {edge_case_and_handling}
