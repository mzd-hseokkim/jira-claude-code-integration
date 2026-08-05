# Requirements: <Topic>

- **Slug**: <slug>
- **Mode**: <default | lite | from | lite+from>
- **Generated At**: <ISO8601 timestamp>
- **Source**: jira-task-discover

## Stakeholders

<Step 3 답변 1번. 주 사용자/호출자/관계자>

## Goals & Success Criteria

<Step 3 답변 2번. 측정 가능한 완료 기준. 각 줄을 다음 형식으로:
`<지표명> · <현재값> → <목표값> · <측정방법>`>

- 응답 시간 · 800ms → 200ms · p95 latency 모니터링
- 합성 정확도 · 70% → 90% · 샘플 50건 manual review

## Constraints

<!-- Step 3 답변 3번을 4 카테고리로 분리. 빈 카테고리는 "N/A — 해당 없음" 한 줄.
     plan이 스코프 컷 결정 시 어느 제약이 살아있는지 보기 위함. -->

### Technical
- <기술 스택, 의존, 호환성>

### Schedule
- <일정/마감>

### Cost
- <예산/리소스>

### Regulatory
- <법적/컴플라이언스/보안 정책>

## Non-functional Requirements

<!-- 각 항목은 값 또는 "N/A — <사유>"로 명시. "TBD" placeholder는 Open Questions로 격상 권장.
     --lite 모드에서는 본 섹션 전체를 "N/A — lite mode" 한 줄로 대체. -->

| 항목 | 값 | 비고 |
|---|---|---|
| 성능 (응답시간/처리량) | <값 또는 N/A — 사유> | |
| 가용성 / SLA | <값 또는 N/A — 사유> | |
| 보안 (인증/암호화) | <값 또는 N/A — 사유> | |
| 확장성 (사용자/데이터 규모) | <값 또는 N/A — 사유> | |
| 관측성 (로깅/메트릭) | <값 또는 N/A — 사유> | |
| 호환성 (브라우저/OS/API) | <값 또는 N/A — 사유> | |

## Codebase Context

<Step 2 결과. 파일별 경로 + 30줄 이내 발췌 요약. 없으면 "관련 영역 미발견">

## Functional Requirements

<답변과 컨텍스트로부터 합성한 기능 요구사항. 번호 매김. 각 항목 끝에 trace marker 부착>

1. <Req-1> *(source: Q2, code: src/notify.ts:45-60)*
2. <Req-2> *(source: Q1)*
3. <Req-3> *(code: src/foo.ts:12-30)*
4. <Req-4> *(synthesized)*

## Goals ↔ FR 매핑

<!-- Goals & Success Criteria의 각 Goal이 어떤 FR로 만족되는지.
     - 한 Goal이 여러 FR에 걸쳐도 됨 (콤마 구분).
     - 어떤 FR도 매핑되지 않은 Goal이 있으면 Open Questions로 격상 권장 ([P1]).
     - 어떤 Goal에도 매핑되지 않은 FR이 있으면 Out of Scope 후보로 표시하거나 추가 Goal 도출.
     - plan의 Goal Coverage 표(plan.template.md)와 호환 — plan이 이 매핑을 입력으로 받아 스코프 결정. -->

| Goal | 만족하는 FR | 비고 |
|---|---|---|
| <Goal 1 — 측정 기준 포함> | FR-1, FR-3 | |
| <Goal 2> | FR-2 | |

## Edge Cases

<-- --lite 모드면 이 섹션 통째로 생략. 각 항목 끝에 trace marker 부착 -->

- <Edge case 1> *(synthesized)*
- <Edge case 2> *(code: src/notify.ts:80-95)*

## Out of Scope

<-- --lite 모드면 이 섹션 통째로 생략. 각 항목 끝에 trace marker 부착 -->

- <Item 1> *(source: Q3)*
- <Item 2> *(synthesized)*

## Open Questions

<TBD로 답변된 항목 또는 답변 부족으로 결정 보류된 항목. 각 항목 앞에 우선순위 마커 부착 (P1: 다음 단계 차단 / P2: 확인 필요 / P3: 참고). 어느 답변이 부족했는지 source: Q<N>로 표기. --from 모드에서 import 본문과 답변이 모순된 경우 [CONFLICT] prefix로 격상 (Step 3.5 참조). [CONFLICT] 항목은 우선순위 마커와 trace marker 모두 부착하지 않음.>

- [P1] <Q1> *(source: Q4)*
- [P2] <Q2> *(synthesized)*
- [P3] <Q3> *(source: Q2)*
- [CONFLICT] Stakeholders: import="운영자" vs answer="일반 사용자" — 어느 쪽이 정확한지 결정 필요

## Proposed Issue Breakdown

<!-- 분해 레벨 3종 (L1 Single / L2 Story+Subtasks / L3 Epic+Stories+Subtasks).
     입력 규모에 맞는 1개만 채운다. 항상 트리 강제 X.
     서브태스크는 파일군 덩어리에서 도출한다 — 덩어리 1개 = 서브태스크 1개.
     모든 Sub-task는 `범위:` 자식 줄 필수. 채울 수 없으면 서브태스크가 아니다.
     레벨 정의·도출 순서·경계 규칙은 skills/jira-task-discover/refs/breakdown-level.md 참조. -->

<!-- L1 Single 예시:

- **작업**: <한 줄 요약>
  - 범위: <변경 파일/모듈 한 줄>
  - 검증: <측정 가능한 완료 기준 한 줄>
-->

<!-- L2 Story+Subtasks 예시:

- **Story**: <스토리 요약>
  - Sub-task 1: <서브태스크 요약>
    - 범위: <이 서브태스크가 독점하는 파일/모듈>
  - ... (파일군 덩어리 수만큼. 0개도 정답)
-->

<!-- L3 Epic+Stories+Subtasks 예시:

- **Epic**: <에픽 요약>
  - **Story 1**: <스토리 요약>
    - Sub-task 1.1: <서브태스크 요약>
      - 범위: <이 서브태스크가 독점하는 파일/모듈>
    - ... (파일군 덩어리 수만큼)
  - **Story 2**: <스토리 요약>
    - (서브태스크 없이 스토리 자체가 머지 단위여도 된다)
-->

## Technical Approach Hint

<!-- 요구사항 문서 말미 섹션. plan/design 단계가 approach로 통합됨에 따라 구현 방향의 1차 힌트.
     입력: Codebase Context · Functional Requirements · Constraints.
     코드 스니펫 금지 — 의사결정/접근 옵션/주의사항 위주.
     --lite 모드는 3-5줄 요약. -->

### 핵심 구현 포인트
- <FR을 만족하기 위해 손볼 모듈/파일 영역 1-3줄>

### 검토할 접근 옵션
- 옵션 A: <접근명> — 장점 / 단점 1줄씩
- 옵션 B: <접근명> — 장점 / 단점 1줄씩

### 주의 지점
- <리스크/의존/마이그레이션/롤백 고려>
