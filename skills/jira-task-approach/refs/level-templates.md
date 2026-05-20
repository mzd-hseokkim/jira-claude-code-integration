# Approach Output Templates (3 levels)

본 파일은 `jira-task-approach` Step 3.2에서 결정된 레벨의 출력 블록만 본문에 사용한다. 다른 레벨은 무시.

레벨 결정은 SKILL.md Step 0 참조. 분량은 토큰 비용 절감을 위해 의도적으로 제한 — 초과하면 줄여서 채운다.

---

## L1 Single — 5줄 요약

작업 1건(단일 PR 범위 / 변경 파일 ≲ 5). 다음 5줄로 끝낸다 — 각 줄 1문장.

```markdown
## Approach (L1 Single)

- **변경 영역**: <파일/모듈 한 줄>
- **핵심 결정**: <`X 대신 Y — 이유 Z` 형식. 기각한 대안을 한 줄에 박는다. 진짜 결정거리가 없으면 "기존 패턴 답습"으로 충분>
- **검증**: <완료 기준 측정 방법 한 줄>
- **리스크**: <식별된 위험 한 줄 — 없으면 "없음">
- **롤백**: <revert 가능 여부 한 줄>
```

L1에서는 별도 표나 다이어그램을 만들지 않는다. requirements doc의 Technical Approach Hint를 1-2 문장으로 압축하여 위 항목에 분배.

---

## L2 Story — 한 페이지

한 영역의 다단계 작업(FR 3-6건 / 변경 파일 4-10개). 다음 6 섹션으로 한 페이지 내 마무리. 각 섹션 5-10줄.

```markdown
## Approach Summary (L2 Story)

<2-4줄: 무엇을 어떻게 만들 것인지 요지. plan의 Background + design의 Overview를 합친 분량.>

## Architecture

<나중에 못 바꾸는 경계(seam) 하나를 지목 — 모듈 의존 방향 · 데이터/트랜잭션 경계 · 외부 시스템 경계 중 이 작업의 핵심. 형식 자유(트리/텍스트). 다이어그램은 흐름이 표로 안 보일 때만.>

## Implementation Plan

| # | 파일 | 변경 유형 | 규모 | 요약 |
|---|------|---------|---|------|
| 1 | `{path}` | 신규/수정/삭제 | S/M/L | <1-2줄> |

## Key Decisions

| # | 결정 | 대안 | 선택 이유 |
|---|---|---|---|
| 1 | <what> | <alt> | <why> |

작성 전 다음 **설계 차원을 ruling in/out** 한다 — 작업이 건드리는 것만 결정으로 등장시킨다(해당 없으면 행을 만들지 않는다, 빈 행 강제 금지):
데이터 모델/스키마 · 트랜잭션·원자성 경계 · 인터페이스/API 계약 · 동시성·멱등성·순서 · 보안·권한 경계.
각 결정은 어떤 FR/AC 또는 Risk에서 비롯됐는지 추적 가능해야 한다 — 출처 없는 결정은 가짜다. *구현 방식* 결정만. 0건 불가 — "기존 패턴 유지"도 한 줄.

## Test Plan

| # | 케이스 | 검증 AC |
|--|--|--|
| T1 | <시나리오> | AC-1 |

Unit/E2E 구분은 필요 시에만. 핵심 케이스 3-5건.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| <risk> | <impact> | <mitigation> |

식별된 위험 없으면 `N/A — 검토 완료` 한 줄.
```

옵셔널: `## Open Items` — 미해결 P1/[CONFLICT] 이월. impl 진입 게이트.

데이터 모델 변경, 보안 영향, 시퀀스 다이어그램이 필요한 작업은 L2 분량으로는 부족할 수 있다 — 사용자가 L3로 격상시키도록 제안.

---

## L3 Epic — child Story 시퀀싱만

여러 영역에 걸친 작업. **상세 설계는 각 child Story의 approach가 담당**한다. 본 문서는 시퀀싱과 의존성만 담는다.

```markdown
## Approach Summary (L3 Epic)

<2-3줄: Epic의 목표 + 분해 전략의 요지.>

## Child Story Sequencing

| # | Story Key | Summary | 의존 | 병렬 가능 | 비고 |
|---|---|---|---|---|------|
| 1 | <STORY-1> | <한 줄 요약> | - | Y | 선행 작업 |
| 2 | <STORY-2> | <한 줄 요약> | STORY-1 | N | |
| 3 | <STORY-3> | <한 줄 요약> | - | Y | STORY-1과 병렬 가능 |

child Story 식별 출처: cachedIssue의 `subtasks` + `issuelinks`(`Blocks`/`is blocked by`).

## Cross-Story Concerns

<여러 Story에 걸치는 횡단 관심사가 있으면 1-3줄. 없으면 섹션 헤더째 삭제.
예: 공용 인터페이스 합의, 마이그레이션 순서, 롤백 전략.>

## Risks (Epic-level)

| Risk | Impact | Mitigation |
|------|--------|------------|
| <epic-level risk> | <impact> | <mitigation> |

식별된 위험 없으면 `N/A — 검토 완료` 한 줄.
```

L3에서는 파일별 Implementation Plan, Key Decisions, Test Plan을 본 문서에서 다루지 않는다 — 각 child Story의 approach 문서가 담당. 본 문서에서 다루면 child와 중복 + 토큰 낭비.

미식별 child Story가 있으면 `Open Items`로 이월하고 사용자에게 child issue 등록을 권고.
