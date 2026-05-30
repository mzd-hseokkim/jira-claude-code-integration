# Code Review: {task_id} - {summary}

**Date**: {ISO date}
**Branch**: feature/{task_id}
**Reviewed by**: {reviewer}

<!--
Section contract:
- 필수(required): Summary, Gap Analysis, Lint & Format, Code Quality Findings, Positive Notes
- 권장(recommended): Changed Files, Conclusion / Recommendation
- 옵셔널(optional): Acceptance Criteria 검증, Security Review, Out of Scope, Open Items / Follow-ups, Verification Commands

가변 섹션 마커 규약: `<!-- optional: <조건 또는 사유> -->` (헤더 직전 줄). 자동 처리 X, 사람/LLM 참고용.

L1 경량 경로 계약:
- L1 task에서 이 파일을 생성하지 않고 Jira 코멘트에 인라인 핵심 findings만 포함하는 것이 허용됨.
- 파일을 생성하는 경우에도 Summary + Gap Analysis(핵심 항목만) + Code Quality Findings(Critical/Warning) 만으로 축약 가능 (Lint & Format·Positive Notes는 "해당 없음" 또는 생략 허용).
-->

## Summary

**결과**: **Approve / Request Changes / Needs Discussion**

{한 단락 요약: 무엇을 검토했고 핵심 판단 근거가 무엇인지.}

<!-- optional: 변경 파일이 많거나 분류가 의미 있을 때. -->
## Changed Files

| 파일 | 유형 | 설명 |
|------|------|------|
| `{path}` | 신규/수정/삭제 | {1줄 설명} |

## Gap Analysis

**설계-구현 일치율**: **{n}% ({passed}/{total})**

| Design Implementation Plan | 구현 여부 | 위치 |
|---------------------------|----------|------|
| {plan item} | O / X / Partial | `{file}:{line}` |

{설계와 구현 사이 차이점 요약. 100% 일치면 "차이점 없음".}

## Lint & Format

| 도구 | 대상 파일 수 | 결과 |
|------|------------|------|
| ESLint | {n} | Pass / Fail / Skipped(사유) |
| Prettier | {n} | Pass / Fail / Skipped |
| {기타 syntax check} | {n} | Pass / Fail |

{프로젝트가 lint 도구를 안 쓰면 "스킵" 사유와 대체 검증(예: `node -c`) 명시.}

## Code Quality Findings

### Critical

{즉시 수정 필요. 없으면 "없음".}

### Warning

{권장 수정. 없으면 "없음".}

### Info

{참고/개선 의견. 없으면 "없음".}

## Positive Notes

{잘 작성된 부분. YAGNI 준수, 적절한 추상화, 좋은 테스트 커버리지 등.}

<!-- optional: AC를 review 단계에서 한 번 더 검증할 때 (test report와 중복 가능). -->
## Acceptance Criteria 검증

| AC | 검증 방법 | 결과 |
|----|----------|------|
| AC-1 | {how} | Pass/Fail |

<!-- optional: 보안 영향이 있을 때. -->
## Security Review

- {finding}

<!-- optional: 의도적으로 본 리뷰 범위에서 제외한 항목. -->
## Out of Scope (intentional)

- {item}

<!-- optional: 후속 task로 넘길 항목. -->
## Open Items / Follow-ups

- {item}

<!-- optional: 다른 사람이 동일 검증을 재현할 수 있도록 명령어 기록. -->
## Verification Commands

```bash
{commands used}
```

<!-- optional: 권장. 종합 결론과 후속 액션. -->
## Conclusion

{Approve 사유 / 수정 요청 사항 / 다음 단계.}
