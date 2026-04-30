# Step 4: Trace Marker 자동 부여 규칙

LLM 합성 항목의 출처를 사후 검증 가능하게 만들기 위해, **합성 4종 섹션**의 각 항목 끝에 출처 태그(trace marker)를 자동으로 부여한다.

**Marker 부여 대상 (합성 4종):**

| 대상 (marker 부여) | 비대상 (답변·메타 직접 매핑이라 marker 불요) |
|----|----|
| Functional Requirements | Stakeholders (= `Q1`) |
| Edge Cases | Goals & Success Criteria (= `Q2`) |
| Out of Scope | Constraints (= `Q3`) |
| Open Questions | Non-functional Requirements (= `Q4`) |
| | Codebase Context (Step 2 메타 자체) |

비대상 5종은 답변(`Q<N>`) 또는 Step 2 메타가 곧 출처이므로 marker 불요. 대상 4종(FR/Edge Cases/Out of Scope/Open Questions)에만 항목 단위 marker를 부여한다.

**Marker 형식 표준 (5 case + `--from` 변형):**

```
| 케이스 | Marker 형식 | 사용 시점 |
|--------|-------------|----------|
| 답변 1개에서 유래       | *(source: Q<N>)*                            | Q<N> 답변에서 직접 도출 |
| 답변 다수에서 유래       | *(source: Q1, Q3)*                          | 콤마 구분, 최대 3개. 4개 이상이면 가장 강한 1개만 |
| 코드 1곳에서 유래       | *(code: <path>:<line-range>)*               | Step 2 (file_path, line_range) 메타에서 직접 도출 |
| 코드 다수에서 유래       | *(code: src/a.ts:10-20, src/b.ts:5-15)*     | 콤마 구분, 최대 2개. 3개 이상이면 가장 대표적 1개만 |
| 답변 + 코드 결합        | *(source: Q<N>, code: <path>:<line>)*       | 답변과 코드 양쪽 모두에서 도출 |
| 둘 다 없음 (LLM 합성)  | *(synthesized)*                              | 답변·코드 어디에도 직접 근거가 없는 LLM 자체 합성 |
```

**`--from` 모드 변형 (1 case 추가):**

```
| 케이스 | Marker 형식 |
|--------|-------------|
| --from import 본문 그대로                        | *(source: from)*                          |
| --from import + 답변 보강                        | *(source: from, Q<N>)*                    |
| --from import + 코드 보강                        | *(source: from, code: <path>:<line>)*     |
| --from 본문 외 추가 합성 항목                    | default 모드 규칙 그대로 (Q<N> / code: / synthesized) |
```

**다중 출처 표기 원칙: 가독성보다 추적성 우선.** 단, marker가 본문보다 길어지면 가독성이 깨지므로 source 최대 3개·code 최대 2개 상한을 둔다. 초과 시 가장 강한/대표적 1개만 표기.

**`*(synthesized)*` 사용 가이드 (남용 방지):**

- **사용 가능 조건**: `Q<N>` 답변 어디에도 직접 근거가 없고, Step 2 코드 발췌(`(file_path, line_range)`) 어디에도 직접 근거가 없는 LLM 자체 합성 항목에만 사용한다.
- **권장 우선순위**: `Q<N>` 추적 > `code:` 추적 > 둘 다 결합 > `synthesized` (가능하면 `synthesized` 회피).
- **Open Questions 섹션 예외**: Open Questions는 본질이 "결정 보류"이므로 `*(source: Q<N>)*` (어느 답변이 부족했는지)가 자연스럽다. `*(synthesized)*` 사용은 지양한다.
- **Edge Cases 기본 marker**: Edge Cases는 거의 LLM 합성이라 `*(synthesized)*` 또는 `*(code: ...)*`가 일반적이다. 사용자 답변에서 직접 도출된 경우(예: "동시 호출 시 어떻게?"라는 답변)에 한해 `*(source: Q<N>)*`를 사용한다.

**`--lite` 모드 정합성:**

`--lite`는 Edge Cases/Out of Scope 섹션이 통째로 생략되므로 marker 적용 대상은 자연 축소되어 **Functional Requirements + Open Questions 2개 섹션**만 남는다. Q 인덱스 범위도 `Q1`~`Q3`로 축소된다 (`Q4` NFR 비활성화). 그 외 marker 형식·`synthesized` 가이드는 default와 동일하게 적용한다.
