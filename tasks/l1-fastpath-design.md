# L1 Fast Path — 파이프라인 압축 + Jira 코멘트 배치 — 설계

> 개선안 5번. `tasks/loop-engineering-roadmap.md` 참조. 의존: 1번 (fast path 분기는 auto.workflow.js의 plan 계산에 얹는다).
> 상태: 설계 (미구현)

---

## 문제

L1(Subtask/Task/Bug — 단일 파일군 surgical change)에도 full 파이프라인이 돈다:

- **sub-agent 4개** (start haiku → approach **opus** → impl+test sonnet → review sonnet), 각각 컨텍스트 재구성 비용.
- L1 approach의 산출물은 **5줄**인데 opus agent 기동 + 문서 파일 + Jira 코멘트 + 첨부가 따라붙는다.
- **Jira 코멘트 5회** (단계당 1회) + 첨부 업로드 — 단계마다 왕복.

L1이 태스크 분포의 다수(과분해 방지 이후에도 소형 태스크가 기본 단위)이므로, 여기의 상수 비용이 체감 시간을 지배한다.

## 원칙

**L1은 "한 사람이 앉은 자리에서 끝내는 크기"다 — agent 경계도 그에 맞춘다.** 단, 리뷰 독립성(fresh context)만은 크기와 무관한 불변식으로 유지한다.

```
표준 경로 (L2+):  start → approach → impl+test → review        (4 agents, 코멘트 5회)
Fast path (L1):   [start+approach+impl+test 통합 sonnet] → review(sonnet)   (2 agents, 코멘트 2회)
```

## 설계

### 1. 진입 판정 (auto.workflow.js plan 시점, JS)

- `breakdownLevel === "L1"` (SSOT: create가 기록) 또는 issuetype 폴백 Subtask/Task/Bug.
- **둘 다 불명이면 표준 경로** (1번 설계의 review 모델 판정과 동일한 보수 기본값).
- 사용자 `--skip`은 fast path에도 적용 (통합 agent에 전달할 SUBSTEPS에서 제외).

### 2. 통합 agent (sonnet, general-purpose)

start·approach·impl·test SKILL.md를 순서대로 호출하되 **한 컨텍스트에서** 수행. 각 스킬의 절차는 무수정 — 통합은 호출 경계만 없앤다. 프롬프트 핵심 지시:

1. 각 하위 단계는 해당 SKILL.md 절차 그대로 (context-update 포함 — `completedSteps` 단계별 기록 유지, 재개 호환).
2. **Jira 코멘트 유예**: start/approach/impl/test의 단계별 `jira_add_comment`를 **하지 않는다**. 대신 각 단계의 코멘트 본문을 로컬에 모아 두었다가, test 완료 후 **1회 통합 코멘트**로 포스팅:
   ```
   ## Fast Path Progress (start → test)
   ### Started       — 브랜치·워크트리
   ### Approach (L1) — 5줄 요약 인라인
   ### Implementation Complete — 변경 파일
   ### Test          — PASS/FAIL 표
   ```
   첨부는 L1 규칙상 원래 최소 (approach 5줄은 인라인이 첨부보다 낫고, test 리포트 파일은 L1에서 생략 가능) — 첨부 업로드는 실패 스크린샷 등 있을 때만.
3. approach는 L1 템플릿(5줄) 그대로 — 문서 파일도 기존대로 생성 (impl이 그걸 plan으로 소비하는 계약 유지).
4. **PDCA 권고는 fast path에 흡수** — start의 권고 블록 생성을 생략한다. L1에서 스킵할 만한 것(approach 5줄, test-lite)은 이미 충분히 싸다.

### 3. 승급 탈출구 (escalation) — fast path의 안전판

approach Step 0의 **설계 차원 승급 규칙**(데이터 모델/스키마, 트랜잭션 경계, 외부 API 계약, 동시성, 보안 경계를 건드리면 L1→L2 승급)은 fast path 안에서도 유효하다. 통합 agent가 approach 하위 단계에서 승급을 판정하면:

- 즉시 작업을 멈추고 구조화 반환: `{ escalated: true, toLevel: "L2", reason, completedStepsAfter }`.
- 스크립트는 fast path를 버리고 **표준 경로로 전환** — completedSteps 기준으로 남은 단계(approach부터)를 표준 stage agent로 실행. start가 이미 끝났으므로 중복 없음.
- 유예했던 Jira 코멘트 중 start분은 전환 시점에 표준 형식으로 포스팅 (누락 방지).

이 탈출구가 있어야 "L1이라더니 스키마를 바꾸더라" 케이스에서 opus approach·풀 리뷰로 복귀할 수 있다.

### 4. 리뷰 — 통합하지 않는다

review는 별도 sonnet agent (L1 리뷰 모델 규칙 기존과 동일). 근거:
- self-praise bias 차단은 fresh context가 유일한 방어 — 통합 agent가 자기 코드를 리뷰하면 Default-FAIL 계약이 무력화된다.
- review 코멘트(리뷰어 서명 포함)는 review-log Phase 1.4의 리뷰어 식별에 load-bearing — 기존 형식 유지.

fast path의 리뷰 입력은 표준과 동일 (`implSelfCheck` 인용, review-metrics 블록, 게이트 판정). fix loop도 표준 로직 공유 (2번 설계의 inner loop 포함).

### 5. 기대 효과 (retro로 검증할 지표)

| 지표 | 현재 (L1 표준 경로) | 목표 |
|---|---|---|
| agent 기동 | 4회 | 2회 |
| Jira API 왕복 (코멘트) | 5회 + 첨부 | 2회 |
| approach 모델 | opus | sonnet (통합 agent 내) |
| 태스크 wall-clock | — (run-log로 베이스라인 측정) | 40%↓ 가설 — retro에서 검증 |

베이스라인이 없으므로 **1번+run-log(4번 §2)를 먼저 배포해 L1 소요시간을 측정한 뒤** fast path를 넣는다 — 효과 검증이 가능한 순서.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/auto.workflow.js` | plan 시점 L1 분기 + 통합 agent prompt + escalation 전환 로직 |
| `skills/jira-task-start/SKILL.md` | "fast path 모드에서 Jira 코멘트·PDCA 생략" 마커 지원 (`[fastpath]` 인자 등 — 최소 침습) |
| approach/impl/test SKILL.md | 동일 — 코멘트 유예 마커만 (절차 본문 무수정) |
| `skills/jira-task-auto/SKILL.md` (launcher) | 실행 계획 표시에 fast path 여부 1줄 |

> 마커 방식 대안: 스킬 수정 없이 통합 agent prompt에서 "SKILL.md의 jira_add_comment 단계는 수행하지 말고 본문만 수집하라"로 오버라이드. **스킬 무수정이 더 단순하므로 이쪽을 1안**으로 하고, prompt 오버라이드가 무시되는 사례가 관측되면 마커로 격상.

## 비목표

- L2/L3 경로 변경 — 없음.
- merge/done 포함 — auto 스코프 불변 (quarantine 설계의 auto-done 옵션과 별개).
- 코멘트 완전 제거 — Jira는 팀 가시성 채널이므로 배치 1회는 유지. 0회로 줄이는 건 가시성 손실.

## 검증 계획

- L1 태스크 1건 fast path 실행: agent 2회·코멘트 2회·completedSteps 정상 기록·리뷰 게이트 동작 확인.
- 승급 시나리오: 스키마 변경이 포함된 "가짜 L1" → escalation 반환 → 표준 경로 전환 → approach가 opus로 실행되는지.
- 재개: 통합 agent가 impl까지 하고 죽은 상태에서 auto 재실행 → completedSteps 기준으로 test부터 (fast path 재진입 시 남은 하위 단계만).
- Jira 확인: 통합 코멘트 1회에 4개 섹션이 모두 있는지, 유예 중 실패 시(agent abort) start분 코멘트 누락이 다음 실행에서 복구되는지.
