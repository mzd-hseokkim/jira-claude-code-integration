# Plan: {task_id} - {summary}

<!--
Section contract:
- 필수: Background, Source Requirements, Scope, Acceptance Criteria, Scope Decisions, Task Breakdown, Risks
- 옵셔널: Open Items, Edge Cases — 필요 시 포함

옵셔널 섹션은 비면 헤더째 삭제. 필수 섹션이 비면 "N/A — <사유>" 한 줄.

plan vs design 경계:
- plan = "*무엇을 / 어디까지*" (스코프 결정)
- design = "*어떻게*" (구현 방식 결정)
-->

## Background

{description from Jira issue}

## Source Requirements

- **Requirements doc**: `docs/requirements/<slug>.requirements.md` *(discover 생략 시 "N/A — <출처>")*

<!-- discover 산출물(Open Questions, [CONFLICT], Goal Coverage)의 plan 처리 결과를 한 표로.
     discover 생략이면 표 대신 "N/A — discover 생략" 한 줄. -->

| 출처 | 항목 | plan에서의 처리 |
|---|---|---|
| Q4 (P1) | {discover 질문} | {답} |
| CONFLICT | {field}: a vs b | {선택 + 사유} |
| Goal 1 | {goal} | Y / Partial({무엇이 빠짐}) / N |

## Scope

### In Scope

- {item} *(source: FR-N — 가능하면 부착)*

### Out of Scope

- {item} — {왜 뺐는가} *(복귀: 다음 사이클 / 영구 제외 / TBD)*

## Acceptance Criteria

### AC-1: {criterion_name}
- Given: {precondition}
- When: {action}
- Then: {expected_result} *(covers: Goal 1, In Scope item-A)*

## Scope Decisions

<!-- plan이 내린 *스코프 결정*. 0건일 수 없음 — "변경 없음" 결정도 한 줄 기록.
     1건이면 bullet 가능. *어떻게 만들지*는 design으로. -->

| # | 결정 | 대안 | 선택 이유 | 영향 |
|---|---|---|---|---|
| 1 | {what} | {alt} | {why} | {scope/timeline/risk} |

## Task Breakdown

<!-- 규모: S(<반나절) / M(반나절~2일) / L(2일+). 우선순위: must / nice. -->

| # | Task | 의존 | 규모 | 우선순위 | Verification |
|---|------|---|---|---|------|
| 1 | {task} | - | M | must | {how_to_verify} |

## Risks

<!-- 빈 경우 "N/A — 식별된 위험 없음 (검토 완료)" 한 줄. -->

| Risk | Impact | Mitigation |
|------|--------|------------|
| {risk} | {impact} | {mitigation} |

<!-- optional: plan이 닫지 못하고 design으로 이월하는 항목이 있을 때만. -->
## Open Items

- {item — 사유 + 누가/언제}

<!-- optional: 경계 조건·예외 입력을 별도로 다뤄야 할 때만. -->
## Edge Cases

- {edge_case_and_handling}
