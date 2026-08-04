# Step 4.5: Synthesis Confirm

**모두(冒頭) — Conflict Detection 결과 표시:** Step 3.5에서 감지된 `[CONFLICT]` 항목이 1건 이상이면 합성 결과 요약보다 **먼저** "Conflict Detection 결과" 섹션을 표시한다. 표시 형식은 격상된 `[CONFLICT]` 항목들의 bullet 목록이며, 4건 이상 시 "상위 3개 + 외 N건" 형태로 축약한다 (요약 표시 규칙과 동일). 사용자는 이 섹션을 검토 후 `proceed`/`revise`/`cancel` 결정을 내린다. conflict 0건이면 본 섹션은 표시하지 않는다.

Step 4가 메모리상에 만든 합성 산출물(Functional Requirements / Edge Cases / Out of Scope / Open Questions)을 사용자에게 한 번 검증받는다. LLM hallucination·임의 분해 끊김·모순 입력으로 인한 품질 저하를 차단하기 위한 단일 confirm gate이다.

#### 요약 표시 규칙

- 각 confirm 대상 섹션은 **3줄 이내**로 요약 표시한다 (단순 입력에서 사용자 마찰 최소화).
- 항목이 4개 이상이면 **상위 3개 + "외 N건"** 형태로 축약한다.
- 표시 순서는 항상: Functional Requirements → Edge Cases → Out of Scope → Open Questions (해당 모드에서 생성된 섹션만).
- **추천 분해 레벨 표시 (필수)**: 마지막에 레벨과 **노드 수를 함께** 1줄로 표시한다. 레벨 문자열만 보여주면 사용자는 자기가 몇 건에 동의하는지 모른 채 승인하게 된다.

  ```
  추천 분해: L3 Epic+Stories+Subtasks — Epic 1 / Story 5 / Sub-task 10 (사유 1줄)
  ```

  추천 산정은 `refs/breakdown-level.md`의 신호표(레벨)와 서브태스크 경계 규칙(개수)을 따른다. `proceed` 선택 시 추천 레벨과 트리가 그대로 확정되어 Step 5에 전달된다. 다른 레벨이나 분해 정도를 원하면 `revise`에서 자유 입력으로 지정 (예: "L3 Tree로 바꿔줘", "서브태스크 좀 합쳐줘") — Step 4의 합성은 재실행하지 않고 트리만 갱신한다.

- **과분해 경고**: 개수로 판정하지 않는다 — 15건이 필요한 일도 있다. `refs/breakdown-level.md`의 세 조건(파일 독점 / 독립 머지 / 독립 완료 판정) 중 **파일 독점이 깨진 쌍**이 보일 때만 요약 표시 **위에** 경고 1줄을 붙인다. 나머지 둘은 기계적으로 판정되지 않으므로 경고 대상이 아니다.

  ```
  ⚠️ Sub-task N.1과 N.2는 같은 파일을 고칠 것으로 보입니다. 서브태스크 하나는
     worktree 하나라 나눠 두면 병렬 진행이 막힙니다 — 합치는 편이 낫습니다.
  ```

  경고는 `proceed`의 default를 바꾸지 않는다 (사용자 결정에 위임). 겹치는 쌍이 없으면 개수와 무관하게 경고하지 않는다.

#### 모드별 confirm 대상 매핑

| 모드 | confirm 대상 섹션 |
|------|------------------|
| default | Functional Requirements / Edge Cases / Out of Scope / Open Questions |
| `--lite` | Functional Requirements / Open Questions (Edge Cases·Out of Scope는 lite에서 생성하지 않으므로 자동 제외) |
| `--from` | default와 동일 — 단, "import 베이스 위에서 합성·보강된 부분"임을 안내 문구 1줄로 표기 (실제 마커 적용은 Trace Marker MAE-169로 위임) |

`--lite` 모드에서도 Functional Requirements와 Open Questions는 confirm 대상으로 유지한다 — hallucination 위험이 가장 큰 두 섹션이므로 lite gate 무의미화를 방지한다.

#### Goals ↔ FR 매핑 검증 (필수)

confirm 표시 *전*에 합성 산출물의 Goals ↔ FR 매핑을 자동 검증한다:

- **매핑되지 않은 Goal**: 모든 Goal이 최소 1개 FR에 매핑되는가? 매핑 없는 Goal은 `[P1]` 우선순위로 Open Questions에 자동 격상한다 (sort 순서: TBD → 매핑 누락 → CONFLICT).
- **고아 FR**: 어떤 Goal에도 기여하지 않는 FR이 있는가? 있으면 confirm 표시 위에 경고 1줄: "⚠️ FR-N은 어떤 Goal에도 매핑되지 않습니다. Out of Scope 후보 또는 Goal 누락일 수 있습니다."

이 검증은 hallucinated FR을 잡는 추가 게이트이기도 하다 (Goal과 무관한 FR을 LLM이 만들어내는 경우 식별 가능).

#### AskUserQuestion 호출 (의사코드)

```
AskUserQuestion(
  question: "합성 결과를 검토해주세요. 어떻게 할까요?",
  options: [
    { id: "proceed", label: "그대로 진행", default: true },
    { id: "revise",  label: "수정 요청" },
    { id: "cancel",  label: "취소" }
  ],
  context: "<요약 표시 규칙에 따른 섹션별 3줄 이내 요약>"
)
```

사용자에게 노출되는 라벨은 한국어("그대로 진행" / "수정 요청" / "취소")로 고정한다. 내부 식별자는 `proceed` / `revise` / `cancel`을 사용한다.

#### 분기 처리 절차

**proceed (그대로 진행)**
1. Step 4 산출물을 `docs/requirements/<slug>.requirements.md`에 파일로 쓴다 (이때까지 파일 시스템에는 어떤 부분 결과도 쓰지 않은 상태).
2. Step 5(Issue Breakdown Section) 진입.

**revise (수정 요청)**
1. 자유 입력 1줄을 수신한다: "어느 섹션의 어느 항목을 어떻게 수정할까요?"
2. 입력이 빈 문자열 또는 공백뿐이면 직전 합성 결과 그대로 confirm 단계로 복귀한다(재합성 X — Edge Case 회피).
3. 재합성 카운터(`resynthesisCount`)를 증가시킨다.
4. Step 2(코드베이스 컨텍스트)·Step 3(질문 답변) 캐시는 재사용하고, Step 4의 합성 부분만 사용자 수정 요청을 반영해 재실행한다.
5. 갱신된 합성 산출물로 Step 4.5를 다시 진입한다.
6. 재합성 결과가 직전 결과와 **완전히 동일**하면 사용자에게 "변경 없음" 안내를 1줄 표시하고 카운터는 계속 증가시킨다(무한 루프 회피).

**cancel (취소)**
1. 메모리상의 합성 산출물을 폐기한다(Garbage Collection 대상으로 두기만 하면 충분).
2. 파일 시스템에는 아직 쓰지 않은 상태이므로 별도 cleanup이 불필요하다.
3. 한국어 종료 메시지 1줄을 출력한다: "요구사항 문서 생성을 취소했습니다."
4. 비정상 종료 코드 없이 정상 종료한다.

#### 무한 루프 방지 가드

- 재합성 최대 횟수 `RESYNTHESIS_LIMIT = 3` (사용자 마찰 vs 정확도 균형값).
- `resynthesisCount`가 `RESYNTHESIS_LIMIT`에 도달하면, 다음 confirm에서는 `revise` 옵션을 **제거**하고 `proceed` / `cancel` 2분기로 축약한다.
- 사용자에게 "재합성 한도(3회)에 도달했습니다. 그대로 진행하거나 취소를 권장합니다." 안내를 1줄 출력한다.

#### 비대화형 환경 안전장치

본 스킬은 `user-invocable: false`로 항상 사용자 세션 내에서 호출되지만, 안전장치로 `AskUserQuestion` 응답이 부재한 경우 default `proceed`를 적용한다.

#### Functional Requirements 0건 경고

합성된 Functional Requirements가 0건이면(예: 모든 답변이 "Other → 빈" 극단 케이스), 요약 표시 위에 다음 경고 1줄을 추가한다:

> "⚠️ 합성된 항목이 없습니다. 그대로 진행하면 빈 문서가 생성됩니다."

이 경고는 `proceed`의 default를 변경하지 않는다(사용자 결정에 위임).
