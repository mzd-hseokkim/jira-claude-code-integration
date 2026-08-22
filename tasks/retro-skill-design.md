# 메타 루프 — `/jira-task retro` 스킬 설계

> 개선안 4번. `tasks/loop-engineering-roadmap.md` 참조. 의존: 독립 — 단, 텔레메트리 필드는 1~3 구현 시 함께 심는다 (§2).
> 상태: 설계 (미구현)

---

## 문제

하니스 개선 사이클이 전부 수동이다: 사용자가 실행을 관찰 → 이상 징후 기억 → 원인 진단 → 개선 지시. v0.47~0.51의 개선(리뷰 오탐 7건 수정, 과분해 방지, 병목 개선)이 전부 이 수동 루프의 산물이다. 관찰 데이터는 이미 쌓이고 있는데(review-log, context 타임스탬프) 소비자가 없다.

## 원칙

**하니스가 자기 실행 기록을 읽고 개선안을 diff로 제안한다. 사람은 진단자에서 승인자로 이동한다.** retro는 제안만 하고 절대 자동 적용하지 않는다.

## 1. 입력 — 현존 텔레메트리

| 소스 | 내용 | 상태 |
|---|---|---|
| `docs/review-log/<TASK-ID>.json` + `_index.jsonl` | outcome, findings(severity/category/file), severityCounts, timings(gapSec/lintSec/qualitySec), reviewerVersion | **있음** — `analyze-review-log.py` 집계 스크립트도 존재 |
| worktree/aggregate `.jira-context.json` | `<step>At` 타임스탬프 (start/approach/impl/test/review/merged/done) → 단계 소요시간 파생 가능, `implSelfCheck`(lint 결과, planMatched), `deferredReason` | **있음** — 단, worktree 정리(clean) 시 worktree-local이 소멸하므로 aggregate의 타임스탬프만 영속 |
| review-log `falsePositive` / `userOverride` 필드 | 스키마에 있으나 **항상 null** — 기록 경로 없음 | 반쪽 |
| 대시보드 활동 | in-memory ring buffer + 서버 로그 | **retro 입력으로 부적합** (비영속·이벤트 단위) |

## 2. 텔레메트리 보강 — 1~3 구현 시 함께 심을 것

retro의 가치는 입력 폭에 비례한다. 뒤에 심으면 그만큼 데이터 공백이므로 선행 구현에 끼워 넣는다:

- **run-log 신설** ✅ v0.53.0 구현: `docs/run-log/_index.jsonl` (append-only). auto(Workflow) 완료 시 **launcher 스킬**이 `append-run-log.py`로 1줄 기록 (`innerLoopIterations`는 2번 구현 전까지 null):
  ```json
  { "taskId", "timestamp", "status": "completed|aborted|scope_shortfall|fix_exhausted",
    "failedStage", "stagesRun": [], "skipped": {"user":[],"pdca":[]},
    "fixAttempts", "innerLoopIterations", "breakdownLevel",
    "stageDurationsSec": {"start":..,"approach":..,"implTest":..,"review":..},
    "harnessVersion": "<plugin.json version>" }
  ```
  - `stageDurationsSec`는 context의 `<step>At` 차분으로 launcher가 계산 (Workflow 스크립트는 시계가 없다).
  - `harnessVersion`이 핵심 — reviewerVersion과 같은 원리로, **개선 전후 비교(하니스 ratchet)의 축**이 된다.
- **loop run 기록**: 예외 리포트(개선안 3) 렌더링 시 격리 내역을 같은 run-log에 `{"kind":"loop-run", "quarantined":[{taskId, deferredKind}], "passed":[...]}` 1줄로.
- **falsePositive 기록 경로**: review 스킬 Step 5 이후, 사용자가 리뷰 지적을 자연어로 기각하면("이건 오탐이야") 해당 finding의 `falsePositive: true`를 review-log에 반영하는 마이크로 절차를 review SKILL.md에 추가. userOverride도 동일 (게이트 무시하고 merge 진행 시).

## 3. retro 스킬 동작

`/jira-task retro [--since <날짜|N-tasks>]` — user-invocable, 메인 레포 cwd에서 실행.

### Step 1: 집계 (결정론적)
`analyze-review-log.py`를 확장하거나 별도 `analyze-run-log.py` 추가 — LLM이 jsonl을 직접 읽지 않고 스크립트 집계 결과(JSON)만 소비한다 (컨텍스트 절약 + 재현성):
- 단계별 소요시간 분포 (level별 중앙값/최대) — 병목 단계 식별
- fix loop 진입률·평균 회차, inner loop 수렴률 (2번 도입 후)
- finding category 상위 N + falsePositive 비율 (reviewerVersion별 추이)
- bail/격리 사유 분포 (deferredKind별)
- PDCA 스킵 권고 적중률 (스킵된 단계가 이후 문제를 일으켰는지 — fix loop 사유와 교차)

### Step 2: 진단 (LLM)
집계 결과에서 **패턴 → 하니스 원인 가설**을 세운다. 예상 패턴 예:
- "L1 태스크의 approach 단계가 중앙값 4분 — 5줄 산출물 대비 과함" → L1 fast path(개선안 5) 근거 데이터
- "category X 오탐이 reviewerVersion abc 이후 급증" → review 게이트 문구 회귀
- "scope-shortfall의 80%가 create 단계 과분해 태스크" → discover/create 규칙 조정

### Step 3: 제안 (diff 형태)
각 제안은 다음 형식 — **증거 없는 제안 금지**:
```
### 제안 N: <한 줄>
- 증거: <집계 수치 — 최소 3건 이상의 관측>
- 대상 파일: skills/... (구체 diff 또는 변경 요지)
- 기대 효과: <측정 가능한 지표 — 다음 retro에서 검증할 것>
- 리스크: <부작용 가능성>
```
산출물: `docs/retro/<날짜>.retro.md`. 사용자가 승인한 제안만 별도 세션에서 구현 (버전 범프 포함 — 다음 retro가 harnessVersion으로 효과를 측정).

### Step 4: ratchet 확인
직전 retro의 제안 중 구현된 것의 "기대 효과" 지표를 이번 집계와 대조 — 효과 없으면 **롤백 후보로 명시**. 하니스 가정은 상하면 쳐낸다는 원칙의 데이터 버전.

## 실행 주기

- 수동 트리거 기본. loop 예외 리포트 말미에 "마지막 retro 이후 N개 태스크 누적 — /jira-task retro 권장" 한 줄로 리마인드 (N=10 시작).
- 자동 실행은 하지 않는다 — retro 자체가 opus급 판단 작업이라 비용이 있고, 제안 승인이 어차피 사람 게이트다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `skills/jira-task-retro/SKILL.md` | 신규 |
| `scripts/append-run-log.py`, `scripts/analyze-run-log.py` | 신규 (기존 review-log 스크립트 패턴 복제) |
| auto launcher 스킬 / loop SKILL.md | run-log 기록 1줄 추가 (1·3번 구현에 편승) |
| `skills/jira-task-review/SKILL.md` | falsePositive/userOverride 기록 마이크로 절차 |
| `commands/` | `/jira-task retro` 라우팅 추가 |

## 비목표

- 하니스 자동 패치 — 제안까지만. 승인·구현·버전 범프는 사람과 별도 세션.
- 대시보드 연동 — retro 리포트는 마크다운 산출물로 충분. 대시보드 시각화는 수요가 생기면.
- 실시간/스트리밍 분석 — retro는 배치 회고다.

## 검증 계획

- 시드 데이터: 현존 review-log(있는 만큼) + 수동 작성 run-log 픽스처로 집계 스크립트 단위 테스트 (`tests/`).
- 첫 실제 retro는 1·2번 구현 후 태스크 10건 누적 시점 — 그 전에 돌리면 "데이터 부족" 명시 출력 확인.
