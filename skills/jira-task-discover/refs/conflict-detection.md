# Step 3.5: Conflict Detection (--from mode only)

`--from` 모드에서 import 본문과 Step 3 답변 사이의 모순을 자동 감지하여 Open Questions 섹션에 `[CONFLICT]` 형식으로 격상한다. LLM이 둘 중 한쪽을 임의로 채택하지 않고 사용자 결정을 대기시키기 위함이며, 후속 `jira-task-create`로 잘못된 정보가 전달되는 것을 차단한다.

#### 진입 조건

| 조건 | Step 3.5 진입 |
|------|-------------|
| `--from` 모드 + import 파일 비어있지 않음 | **진입** (정상 케이스) |
| `--from` 모드 + import 파일이 빈 파일 (Step 0에서 default 모드로 fallback됨) | 통과 (Step 0에서 이미 `--from` 효과 무효화) |
| default 모드 (no `--from`) | 통과 (비교할 import 본문 없음) |
| `--lite` 모드 단독 (no `--from`) | 통과 (비교할 import 본문 없음) |
| `--lite + --from` 모드 | **진입** (Q4 비활성 → NFR 카테고리는 자동 제외, 나머지 3 카테고리만 비교) |

진입하지 않는 경우 본 단계는 통째로 건너뛰어진다 (no-op). 별도 안내 메시지 없음.

#### 비교 대상: 4 카테고리

| 카테고리 | 출처 | conflict 인정 케이스 |
|---------|------|--------------------|
| Stakeholders (Q1) | Step 3 답변 1번 | 사용자 그룹 명칭/범위가 명확히 다름 (예: "운영자" vs "일반 사용자") |
| Goals & Success Criteria (Q2) | Step 3 답변 2번 | 측정 기준이 상충 (예: "처리량 1k/s" vs "처리량 1만/s"; "응답 200ms" vs "응답 1s") |
| Constraints (Q3) | Step 3 답변 3번 | import에 없던 새 제약이 답변으로 등장; import의 기존 제약을 답변이 명시적으로 부정 |
| Non-functional Requirements (Q4) | Step 3 답변 4번 | 성능/보안/접근성/관측성 항목이 명시적으로 충돌 |

본 단계의 비교 대상은 위 4 카테고리에 한정한다. Step 4 합성 4종(FR/Edge Cases/Out of Scope/Open Questions)은 본 단계 비교 대상이 아니다 (그들은 Step 3.5보다 늦게 합성되며 별개 책임).

#### Prose 비교 휴리스틱

- **명시적으로 다른 결론일 때만** 격상한다. 키워드 또는 의미 단위로 비교 (의미 단위 비교는 LLM 추론에 의존).
- **단순 추가 정보(non-contradictory addition)는 conflict가 아니다.** import에 없던 새 정보가 답변에 추가되어도, 기존 정보를 부정하지 않으면 격상하지 않는다 (false positive 방지).
- **다국어 혼재(import 한국어 vs 답변 영어 또는 반대)**: LLM의 의미 단위 비교에 위임한다.
- **타이핑 실수에 의한 false positive**: 본 이슈 범위 밖. 사용자가 Step 4.5 confirm gate에서 수정 가능.
- **import 본문 자체가 내부 모순**: 본 이슈 범위 밖. import 자체의 품질은 가정한다.

#### 격상 형식 표준

```
- [CONFLICT] <카테고리>: import="<원본>" vs answer="<답변>" — 어느 쪽이 정확한지 결정 필요
```

원칙:
- `<카테고리>`: 4종 중 하나 (`Stakeholders` / `Goals` / `Constraints` / `NFR`). 풀네임 길면 약어 허용 (예: `NFR`, `Goals` 등)
- `<원본>` / `<답변>`: 한 줄 요약. 원문이 길면 의미가 통하는 짧은 인용. 인용부호 안에 줄바꿈/이탤릭/볼드 금지 (가독성)
- 마지막 한국어 문구("어느 쪽이 정확한지 결정 필요")는 고정 — 사용자 결정 대기임을 명시
- **민감 정보 redact**: `<원본>`/`<답변>` 인용에 자격증명·토큰·PII가 들어 있으면 가린다 (`***` 또는 한 줄 요약으로 대체).

예시:

```
- [CONFLICT] Stakeholders: import="운영자" vs answer="일반 사용자" — 어느 쪽이 정확한지 결정 필요
- [CONFLICT] Constraints: import="응답 시간 200ms 이내" vs answer="응답 시간 1초 이내" — 어느 쪽이 정확한지 결정 필요
```

한 카테고리에 conflict가 여러 개면 각각 별도 항목으로 격상한다 (멀티 conflict 허용, 같은 카테고리 묶기 없음).

#### Trace marker와의 상호 배타성

- `[CONFLICT]` 격상 항목은 Step 4의 trace marker(`*(source: Q<N>)*`, `*(synthesized)*` 등)를 **부착하지 않는다** — `[CONFLICT]` prefix 자체가 출처 표시 역할을 한다.
- import 본문에 이미 부착된 marker(`*(source: from)*` 등)는 비교 시 marker를 무시하고 본문만 비교한다. 격상 항목에 marker는 옮기지 않는다.

#### `--lite + --from` 정합성

`--lite` 모드는 Q4(NFR)을 비활성화하므로 `--lite + --from` 동시 사용 시 NFR 카테고리는 본 단계 비교 대상에서 자동 제외된다. 나머지 3 카테고리(Stakeholders/Goals/Constraints)는 정상 비교한다.

#### Step 4와의 협력

Step 3.5에서 격상된 `[CONFLICT]` 항목은 Step 4의 Open Questions 섹션에 자동 포함된다 (기존 TBD 항목과 함께 나열, 순서: TBD 항목 먼저 → conflict 항목 다음).

#### Step 4.5와의 협력

conflict가 1건 이상 감지되면 Step 4.5 Confirm Gate의 합성 결과 요약보다 **먼저** "Conflict Detection 결과" 섹션이 표시된다. 자세한 표시 규칙은 Step 4.5 본문 참조.
