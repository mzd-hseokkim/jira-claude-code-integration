# Breakdown Level Decision (Step 5 보조 자료)

분해 형식을 입력 규모에 맞게 LLM이 판단한다. **항상 트리를 강제하지 않는다** — 작은 작업은 Single이 정답.

## 3 레벨 정의

| 레벨 | 형태 | 적용 조건 (감각 기준) |
|---|---|---|
| **L1 Single** | 작업 1건 (Epic/Story 생략) | 단일 PR 범위 / 단일 버그 수정 / 변경 파일 ≲ 5개 / FR 1-2건 |
| **L2 Story+Subtasks** | Story 1 + Sub-task N | 한 영역 내 다단계 작업 / FR 3-6건 / 한 사람이 1주 안에 끝낼 수 있는 규모 / 별도 Epic이 과한 경우 |
| **L3 Epic+Stories+Subtasks** | Epic + Story N + Sub-task M | 여러 영역 병렬 작업 / FR 7+ / Goals 다수 / "도입/구축/리뉴얼" 어감 / 다중 PR 예상 |

## 추천 신호표

`Step 4.5 synthesis-confirm` 직전 LLM이 합성 산출물을 입력으로 1개 레벨을 추천한다. 신호 우세에 따른 점수 합산이 아니라 **지배 신호 1-2개로 결정**. 모호하면 L2 default.

| 신호 | L1 | L2 | L3 |
|---|---|---|---|
| FR 개수 | 1-2 | 3-6 | 7+ |
| Goals 개수 | 1 | 1-2 | 3+ |
| Codebase Context 면적 | 파일 1-3개 | 파일 4-10개 | 영역 다수 |
| 변경 영역 다양성 | 단일 모듈 | 한 영역 내 | 여러 영역 |
| Topic 어감 | "fix", "단일", "버그" | "확장", "추가" | "도입", "구축", "리뉴얼" |
| 의존/병렬성 | 단일 PR | 순차 | 병렬 PR 가능 |

## 출력 템플릿

확정된 레벨로 `Proposed Issue Breakdown` 섹션을 채운다.

### L1 Single

```markdown
## Proposed Issue Breakdown

단일 작업으로 한 PR 범위. Epic/Story 트리 대신 작업 1건으로 등록한다.

- **작업**: <한 줄 요약>
  - 범위: <변경 파일/모듈 한 줄>
  - 검증: <측정 가능한 완료 기준 한 줄>
```

### L2 Story+Subtasks

```markdown
## Proposed Issue Breakdown

한 영역의 다단계 작업. Epic 없이 Story 1건과 Sub-task N개로 등록한다.

- **Story**: <스토리 한 줄 요약>
  - Sub-task 1: <서브태스크 요약>
  - Sub-task 2: <서브태스크 요약>
  - Sub-task 3: <서브태스크 요약>
```

### L3 Epic+Stories+Subtasks

```markdown
## Proposed Issue Breakdown

여러 영역에 걸친 작업. Epic + Story + Sub-task 트리로 등록한다.

- **Epic**: <에픽 1줄 요약>
  - **Story 1**: <스토리 요약>
    - Sub-task 1.1: <서브태스크 요약>
    - Sub-task 1.2: <서브태스크 요약>
  - **Story 2**: <스토리 요약>
    - Sub-task 2.1: <서브태스크 요약>
```

공통 규칙:
- 각 항목은 명사구 또는 동사구 한 줄 요약
- 의존성 추정은 선택. 명시할 수 있으면 `(blocks: ...)` 등으로 표기
- L2/L3 트리 산출물은 `/jira-task create --from-requirements <경로>`로 일괄 등록 가능. L1은 `/jira-task create <자연어 힌트>`로 단건 등록 (import 파서가 Single 미지원)

## 사용자 변경

추천 레벨은 `Step 4.5 synthesis-confirm`에서 합성 결과와 함께 표시되며, 사용자가 `revise`로 다른 레벨을 지정 가능. 자유 입력 예: "L3 Tree로 바꿔줘" / "Single로 충분".

## Step 5에서 호출 흐름

1. `synthesis-confirm` proceed 통과 시 추천 레벨이 함께 확정된 상태로 진입.
2. 본 파일의 출력 템플릿 중 확정 레벨 1개를 골라 문서 마지막 부분에 채움.
3. `Technical Approach Hint` 섹션은 분해 레벨과 무관하게 항상 채운다 (요구사항 문서 말미 섹션).
