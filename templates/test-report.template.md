# Test Report: {task_id}

**Date**: {ISO date}
**Branch**: feature/{task_id}
**Command**: `{test command used}`

<!--
Section contract:
- 필수(required): Summary, (Test 분류 1개 이상 — Unit/E2E/Scenario/Manual 등 자유), Failed Tests Detail, Screenshots
  · "Failed Tests Detail"은 실패 0건이어도 "없음"으로 명시
  · "Screenshots"는 UI가 없으면 "해당 없음"으로 명시
  · Test 분류 헤더의 명칭은 자유. 본 template의 `## Test Suites`는 권장 기본값 — 상황에 맞게 `## Unit Tests`, `## E2E Tests (Playwright)`, `## Manual Verification` 등으로 변경 가능. 단 1개 이상의 분류 헤더는 반드시 존재.
- 권장(recommended): Notes, Conclusion
- 옵셔널(optional): Test Strategy, Test Environment, Skipped Tests, Acceptance Criteria 매핑, Raw Output, Out of Scope

가변 섹션 마커 규약: `<!-- optional: <조건 또는 사유> -->` (헤더 직전 줄). 자동 처리 X, 사람/LLM 참고용.

L1 경량 경로 계약:
- L1 task에서 이 파일을 생성하지 않고 Jira 코멘트에 인라인 요약으로 대체하는 것이 허용됨.
- 파일을 생성하는 경우에도 Summary + 1개 분류 헤더 + Failed Tests Detail 만으로 축약 가능 (나머지 필수 섹션은 "해당 없음" 또는 생략 허용).
-->

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | {n} |
| Passed | {n} |
| Failed | {n} |
| Skipped | {n} |
| Duration | {time} |
| Result | **PASS / FAIL** |

<!-- optional: 테스트 전략을 plan/design과 별개로 설명할 필요가 있을 때. -->
## Test Strategy

{사용한 테스트 방식, 프레임워크, 커버리지 범위 등.}

<!-- optional: 환경 의존이 있는 테스트일 때. -->
## Test Environment

- OS: {}
- Node/Python/etc: {}
- 기타 의존: {}

## Test Suites

{1개 이상 필수. 분류 명칭은 자유 — 예: "Unit Tests", "E2E Tests (Playwright)", "Scenario Tests", "Manual Verification" 등.}

### {Suite Name}

{설명 + 결과 표 또는 케이스별 결과.}

| # | 케이스 | 결과 | 비고 |
|---|------|------|------|
| 1 | {case} | ✓ pass / ✗ fail / ⊘ skip | {} |

## Failed Tests Detail

{실패한 테스트 상세. 실패 0건이면 "없음" 한 줄.}

## Screenshots

{UI 변경 검증 스크린샷. UI 없으면 "해당 없음" 한 줄.}

<!-- optional: 의도적으로 skip한 테스트가 있을 때 사유 기록. -->
## Skipped Tests Rationale

- {test name}: {reason}

<!-- optional: AC와 테스트 결과를 명시적으로 매핑할 때 (review에서도 다룰 수 있음). -->
## Acceptance Criteria 매핑

| AC | 검증 방법 | 결과 |
|----|----------|------|
| AC-1 | {how} | Pass/Fail |

<!-- optional: 테스트 러너의 원본 출력 일부를 첨부할 때. -->
## Raw Output

```
{output}
```

<!-- optional: 본 리포트에서 다루지 않은 검증 항목. -->
## Out of Scope

- {item}

<!-- optional: 권장. 결과 해석/후속 액션이 필요할 때. -->
## Conclusion

{종합 판정 및 후속 액션.}

<!-- optional: 권장. 그 외 메모. -->
## Notes

- {note}
