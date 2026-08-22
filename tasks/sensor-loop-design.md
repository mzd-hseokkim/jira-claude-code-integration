# Fix Loop의 Computational Sensor 재구성 — 설계

> 개선안 2번. `tasks/loop-engineering-roadmap.md` 참조. 의존: 1번(auto Workflow화) 권장 — fix prompt 수정 위치가 스크립트냐 SKILL.md냐의 차이일 뿐, 독립 구현도 가능.
> 상태: 구현됨 (v0.54.0) — 검증은 fix loop이 실제 발생하는 태스크에서 수행

---

## 문제

auto의 fix loop 1회 = 수정 + **전체 테스트 스위트 재실행**(test 스킬 경유 → 리포트 재생성 + Jira 코멘트 재포스팅) + **opus 재리뷰 전체**. 회차당 20분+라서 상한을 2회로 묶을 수밖에 없고, 수렴 실패 시 사람에게 떨어진다.

비용의 정체:
1. test 스킬은 diff 기반 선별이 없다 — 항상 전체 스위트 (unit → E2E). fix 회차마다 이걸 다시 돈다.
2. 재리뷰가 **전체 리뷰**다 — 이전 리뷰에서 통과한 항목까지 Default-FAIL로 재검증.
3. 회차마다 test 스킬의 부수 산출물(리포트 파일, Jira 코멘트, 첨부)이 다시 만들어진다.

## 원칙

**루프 안쪽엔 초 단위 computational sensor, 루프 바깥에 분 단위 inferential 판정.** 수렴은 fix agent 내부에서 싸게 끝내고, 비싼 것(전체 스위트, 재리뷰)은 수렴 후 각 1회만.

```
[fix agent 내부 — inner loop, 초 단위]
  수정 → lint(배치 1회) + typecheck + 관련 테스트만 → 실패 항목을 다음 수정 입력으로 → green까지 반복 (상한 5회)
[fix agent 종료 후 — 바깥, 각 1회]
  전체 스위트 (test 스킬 경유, 리포트·코멘트 갱신) → 재리뷰 (delta 모드) → 게이트
```

## 설계

### 1. Inner loop — fix agent가 test 스킬을 부르지 않는다

fix prompt(auto Step 3의 수정+test sub-agent)를 다음으로 교체:

- 수정 후 회차마다:
  - **lint**: impl Step 2.5와 동일 규칙 (선언 도구만, `npx --no-install`, 변경 파일 배치 1회). 기존 "변경 확정 시점 재도래 = lint 1회 원칙 비위배" 해석을 회차 단위로 확장 — 회차당 1회, 파일 저장마다 아님.
  - **typecheck**: impl Step 2의 syntactic 검증과 동일 (tsc 등 선언된 것만).
  - **관련 테스트만 직접 실행** — test 스킬 미경유. 러너별 선별 옵션:
    | 러너 | 선별 방법 |
    |---|---|
    | vitest | `vitest related <changed-files> --run` |
    | jest | `jest --findRelatedTests <changed-files>` |
    | playwright | 직전 리뷰/테스트 실패 spec만 `--grep` 또는 파일 지정 |
    | pytest | 직전 실패만 `pytest --lf` |
    | 선별 불가(custom) | 직전 **실패 테스트 목록**만 재실행, 그것도 불가면 inner loop에서 테스트 생략하고 바깥 전체 스위트에 위임 |
  - 실패 출력은 그대로 다음 수정의 입력 (같은 컨텍스트라 자연 순환). 회차 상한 **5회** — 도달 시 미수렴으로 반환.
- 종료 시 worktree `.jira-context.json`에 기록 (aggregate 금지, `_AGGREGATE_POLLUTION_KEYS`에 키 추가 필요):
  ```json
  "fixSelfCheck": { "iterations": 3, "lint": {...implSelfCheck.lint와 동일형}, "typecheck": "pass|fail|skipped", "relatedTests": "pass|fail|skipped", "ranAt": "<ISO8601>" }
  ```
  `implSelfCheck.lint`도 최신 값으로 갱신 (재리뷰가 인용하는 대상은 기존대로 유지).

### 2. 전체 스위트는 수렴 후 1회

inner loop green 후에만 기존 test 스킬 호출 (completedSteps에서 test 제거 → 재실행). 리포트/Jira 코멘트/첨부는 이 1회에서만 갱신된다. **fix loop 2회를 돌아도 test 스킬 실행은 최대 2회로 동일하지만, 그 앞의 수렴 비용이 전체 스위트에서 관련 테스트로 바뀐다.**

### 3. 재리뷰 delta 모드

재리뷰 프롬프트에 이전 리뷰 산출물을 입력으로 제공:
- 입력: `docs/review/<TASK-ID>.review.md`(직전) + 직전 리뷰 커밋 이후의 diff + `fixSelfCheck`.
- 재검증 범위: **직전 Critical/미충족 Gap 항목 + 이번 fix에서 변경된 파일**만. 직전 리뷰에서 통과한 항목 중 변경 파일과 무관한 것은 "직전 결과 승계"로 표기 (Default-FAIL은 재검증 대상 항목에만 적용 — 승계 항목은 이미 증거 확인을 거친 판정이므로 계약 위반 아님).
- 출력: 동일 review-metrics 블록 (auto 게이트 입력 불변). review-log에는 `deltaReview: true` 필드 추가 — retro(개선안 4)에서 full/delta 리뷰 판정 품질을 분리 추적할 수 있게.
- **1회차 리뷰는 항상 full**. delta는 fix loop 재리뷰에만.

### 4. fix loop 상한 재조정

inner loop가 수렴을 흡수하므로 바깥 상한은 2회 유지가 아니라 **오히려 줄일 수 있다**: 재리뷰 미통과가 반복된다는 건 computational sensor로 안 잡히는 종류의 문제(설계 갭)라는 신호다. 바깥 상한 **2회 유지 + inner 미수렴 시 즉시 bail** (fix agent가 5회 내 green을 못 만들면 재리뷰 없이 사용자 위임 — sensor 출력 첨부).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/auto.workflow.js` (1번 선행 시) 또는 `skills/jira-task-auto/SKILL.md` | fix prompt 교체 (inner loop 지시 + fixSelfCheck 계약), bail 분기 추가 |
| `skills/jira-task-review/SKILL.md` + `agents/jira-reviewer.md` | delta 모드 입력·범위 규칙 추가 (마커 `[review-delta-mode]` 또는 prompt 인자) |
| `scripts/jira-context-update.py` | `_AGGREGATE_POLLUTION_KEYS`에 `fixSelfCheck` 추가 |
| `scripts/append-review-log.py` | `deltaReview` 필드 수용 |

## 비목표

- test 스킬 자체에 diff 선별 모드 추가 — inner loop가 러너를 직접 부르므로 불필요. test 스킬은 "전체 스위트 + 리포트"라는 단일 책임 유지.
- 1회차(정상 경로) 파이프라인 변경 — impl의 "테스트 금지" / test의 전체 스위트 원칙은 그대로.

## 검증 계획

- 시나리오: 리뷰 Critical 2건(트리비얼) 태스크로 fix loop 1회 유도 → inner loop 회차 수, 전체 스위트 실행 횟수(기대: 1), 재리뷰가 delta 범위만 검증했는지 review.md로 확인.
- 미수렴 bail: 고의로 안 고쳐지는 실패(모순된 테스트)로 5회 소진 → sensor 출력 포함 bail 메시지 확인.
- 회귀: `matchRate: null`(Gap 스킵) 경로에서 delta 모드가 Gap 항목 없이도 동작하는지.
