# Plan: {task_id} - {summary}

<!--
Section contract:
- 필수(required): Background, Scope, Acceptance Criteria, Task Breakdown
- 옵셔널(optional): Risks, Edge Cases — 필요 시 포함

가변 섹션 마커 규약:
- 형식: `<!-- optional: <조건 또는 사유> -->`
- 헤더 직전 줄에 위치. 자동 처리 대상이 아닌 LLM/사람 참고용 힌트.
- 옵셔널 섹션을 생략할 때는 헤더 자체를 제거하거나, 본문에 "N/A — <사유>" 한 줄로 둔다.
-->

## Background

{description from Jira issue}

## Scope

### In Scope
- {item}

### Out of Scope
- {item}

## Acceptance Criteria

### AC-1: {criterion_name}
- Given: {precondition}
- When: {action}
- Then: {expected_result}

## Task Breakdown

| # | Task | Verification |
|---|------|-------------|
| 1 | {task} | {how_to_verify} |

<!-- optional: 의존성·기술적 위험·외부 시스템 영향 등 식별된 위험이 있을 때 포함. 사소한 task는 생략 가능. -->
## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| {risk} | {impact} | {mitigation} |

<!-- optional: 경계 조건·예외 입력·드문 시나리오를 별도로 다뤄야 할 때 포함. -->
## Edge Cases

- {edge_case_and_handling}
