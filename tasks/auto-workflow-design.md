# jira-task-auto Workflow 스크립트화 — 설계

> `tasks/harness-improvement-review.md` 후속. loop-engineering 개선 1번: 오케스트레이션을 프롬프트 해석에서 결정론적 코드로 이관.
> 상태: 설계 (미구현)

---

## 목표 / 비목표

**목표**
- `jira-task-auto`의 제어 흐름(단계 순서, 게이트 판정, triage 분기, fix loop)을 Claude Code **Workflow 스크립트**(JS)로 이관.
- 오케스트레이터 LLM 턴 제거 → 토큰 비용·레이턴시·오실행 리스크 절감.
- SKILL.md의 방어 프롬프트(⛔ 순차 호출 강제, 재-Read 지시, fallback 정규식 파싱) 삭제.

**비목표 (이번 단계에서 안 함)**
- `loop`의 스크립트화 — Phase 2. loop는 `Skill(jira-task-auto)`를 호출하므로 auto 내부가 바뀌어도 **loop는 무수정**으로 동작한다.
- fix loop 내부의 computational sensor 재구성(개선안 2번) — 단, 이번 설계에서 훅만 마련.
- 단계 스킬(start/approach/impl/test/review SKILL.md) 변경 — 재사용. 단, review에 구조화 반환 요구가 추가됨(아래).

---

## 아키텍처

```
사용자 / loop
   │  Skill(jira-integration:jira-task-auto, "<TASK-ID> [--skip ...]")
   ▼
auto SKILL.md  (thin launcher, ~80줄)
   │  1. 인자 파싱 (TASK-ID, --skip)
   │  2. .jira-context.json Read → args 조립
   │  3. script-lookup으로 auto.workflow.js 절대 경로 확정
   │  4. Workflow({scriptPath, args}) 호출 → 완료 notification 대기
   │  5. 반환 객체로 한국어 Completion Summary / Bail 메시지 렌더링
   ▼
auto.workflow.js  (결정론적 오케스트레이터)
   │  plan 계산 → stage별 agent() 순차 실행 → 게이트 판정 → fix loop
   ▼
stage sub-agents (general-purpose)  — 기존 단계 SKILL.md를 그대로 호출
```

**책임 분리 원칙**: 판단이 필요 없는 것(순서·분기·파싱·카운팅)은 전부 JS. 판단이 필요한 것(코드 작성·리뷰·요약)만 agent(). 한국어 사용자 메시지는 스킬(launcher)이 렌더링 — 스크립트는 데이터만 반환.

### Workflow 사용 근거

Workflow 도구는 명시적 옵트인이 필요하지만, **"스킬의 지시로 호출하는 경우"는 옵트인 조건을 충족**한다. auto SKILL.md가 그 지시 주체다.

Workflow는 **백그라운드로 실행**되고 완료 시 task notification이 온다. auto 스킬은 호출 후 notification을 받아 요약을 렌더링한다. loop가 auto를 부르는 경우에도 동일 — loop 턴은 notification 후 재개된다.

---

## 파일 배치

| 파일 | 상태 | 내용 |
|---|---|---|
| `scripts/workflows/auto.workflow.js` | 신규 | 오케스트레이터 스크립트 (아래 스켈레톤) |
| `skills/jira-task-auto/SKILL.md` | 축소 (374→~80줄) | thin launcher + 메시지 렌더링 템플릿 |
| `skills/jira-task-auto/refs/review-wrapper.md` | 축소 | wrapper 근거 서술 중 제어 흐름 관련 삭제, triage 임계값 근거만 유지 |
| `skills/_shared/script-lookup.md` | 무수정 | `auto.workflow.js`도 동일 lookup 규약 사용 |

---

## args 계약 (스킬 → 스크립트)

스킬이 `.jira-context.json`(worktree-local)을 읽어 조립. **스크립트는 파일시스템 접근이 불가능**하므로 시작 상태는 전부 args로 주입한다.

```js
args = {
  taskId: "MAE-123",
  worktreePath: "C:/.../project_worktree/MAE-123",   // cwd 검증용
  completedSteps: ["start"],                          // 재개 시 skip 계산 입력
  userSkipSteps: ["test"],                            // --skip 파싱 결과 (스킬이 파싱)
  breakdownLevel: "L1" | "L2" | "L3" | null,          // review 모델 선정
  issueType: "Subtask" | "Story" | ... | null,        // breakdownLevel 폴백
  matchRateThreshold: 90,                             // reviewGate 오버라이드 반영
  ctxFiles: ["<worktree ctx 절대경로>", "<aggregate 절대경로>"]  // prompt에 전달
}
```

- `--skip` 파싱(자연어 포함)과 유효성 검증은 스킬이 담당 — 자연어 해석은 LLM 일이 맞다.
- `Date.now()`는 스크립트에서 사용 불가 → 타임스탬프는 기존대로 `jira-context-update.py`가 기록 (변경 없음).

---

## 구조화 반환 스키마 (agent → 스크립트)

기존의 "최소 요약 텍스트 형식"을 **schema 강제 구조화 반환**으로 대체. 파싱 자체가 사라진다.

```js
const STAGE_SCHEMA = {
  type: "object",
  required: ["step", "result", "cwdVerified", "completedStepsAfter"],
  properties: {
    step: { type: "string" },
    result: { enum: ["success", "failed"] },
    cwdVerified: { type: "boolean" },          // pwd == worktreePath 확인 여부
    completedStepsAfter: { type: "array", items: { type: "string" } },
    artifactPaths: { type: "array", items: { type: "string" } },
    jiraCommentPosted: { type: "boolean" },
    nextStepHint: { type: ["string", "null"] },      // start의 PDCA 권고 포함
    pdcaSkippable: { type: "array", items: { type: "string" } },  // start 전용
    failureReason: { type: ["string", "null"] }
  }
}

const REVIEW_SCHEMA = {  // STAGE_SCHEMA + metrics
  ...STAGE_SCHEMA 필드,
  required: [..., "metrics"],
  metrics: {
    type: "object",
    required: ["matchRate", "criticalCount", "warningCount", "infoCount"],
    properties: {
      matchRate: { type: ["number", "null"] },   // null = Gap Analysis 스킵
      criticalCount: { type: "integer" },
      warningCount: { type: "integer" },
      infoCount: { type: "integer" }
    }
  }
}
```

**효과**: 기존 Step 3의 "Triage Parse Bail" 경로가 **구조적으로 소멸**한다. schema 검증은 도구 계층에서 이뤄지고 불일치 시 모델이 재시도하므로, "리포트에서 숫자 추출 실패" 케이스가 없다. `review-metrics` HTML 블록은 사람/대시보드용으로 계속 쓰되, 게이트 입력은 구조화 반환으로 일원화.

---

## 스크립트 스켈레톤

```js
export const meta = {
  name: 'jira-task-auto',
  description: 'Jira task 단계 파이프라인 자동 실행 (start→approach→impl+test→review + fix loop)',
  phases: [
    { title: 'Start' }, { title: 'Approach' },
    { title: 'Impl+Test' }, { title: 'Review' }, { title: 'Fix' },
  ],
}

const { taskId, worktreePath, completedSteps, userSkipSteps,
        matchRateThreshold, ctxFiles } = args

const done = new Set(completedSteps)
const skip = new Set(userSkipSteps)
let pdcaSkip = new Set()

// ---- 공통: stage agent 실행 + 게이트 ----
async function runStage(step, model, prompt, phase, schema = STAGE_SCHEMA) {
  const r = await agent(prompt, { label: `${step}:${taskId}`, phase, model,
                                  agentType: 'general-purpose', schema })
  if (!r) return { ok: false, reason: 'agent null (skip/terminal error)' }
  if (!r.cwdVerified)
    return { ok: false, reason: `cwd != worktree — repoRoot 오염 가드 (known bug)` }
  if (r.result !== 'success')
    return { ok: false, reason: r.failureReason || 'unknown' }
  if (!r.completedStepsAfter.includes(step) && step !== 'review')
    return { ok: false, reason: `completedSteps에 ${step} 미기록 — context-update 실패 의심` }
  return { ok: true, r }
}

// ---- 1. start ----
if (!done.has('start')) {
  const g = await runStage('start', 'haiku', startPrompt(taskId, worktreePath, ctxFiles), 'Start')
  if (!g.ok) return abort('start', g.reason)
  pdcaSkip = new Set((g.r.pdcaSkippable || []).filter(s => !skip.has(s)))
  done.add('start')
}

// ---- 2. approach ----
if (!done.has('approach') && !skip.has('approach') && !pdcaSkip.has('approach')) {
  const g = await runStage('approach', 'opus', stagePrompt('approach', ...), 'Approach')
  if (!g.ok) return abort('approach', g.reason)
  done.add('approach')
}

// ---- 3. impl+test (병합 유지) ----
const sub = ['impl', 'test'].filter(s => !done.has(s) && !skip.has(s) && !pdcaSkip.has(s))
if (sub.length) {
  const g = await runStage('impl+test', 'sonnet', implTestPrompt(sub, ...), 'Impl+Test')
  if (!g.ok) return abort('impl+test', g.reason)
  sub.forEach(s => { if (!g.r.completedStepsAfter.includes(s)) throw ... })
  sub.forEach(s => done.add(s))
}

// ---- 4. review + triage + fix loop ----
const reviewModel = resolveReviewModel(args)   // L1→sonnet, 그 외/불명→opus (기존 규칙 그대로)
let attempts = 0
while (!done.has('review') && !skip.has('review') && !pdcaSkip.has('review')) {
  const g = await runStage('review', reviewModel, reviewPrompt(...), 'Review', REVIEW_SCHEMA)
  if (!g.ok) return abort('review', g.reason)
  const m = g.r.metrics
  const passed = g.r.completedStepsAfter.includes('review')
  if (passed) { done.add('review'); break }

  // triage — 기존 Step 3 분기표를 JS로 직역
  if ((m.matchRate !== null && m.matchRate < 70) || m.criticalCount >= 3)
    return bail('scope_shortfall', m, [...done])
  if (attempts >= 2)
    return bail('fix_exhausted', m, [...done])

  attempts++
  log(`review 게이트 미통과 (시도 ${attempts}/2) — fix+test 위임`)
  const f = await runStage('review-fix', 'sonnet', fixPrompt(taskId, ...), 'Fix')
  if (!f.ok) return abort('review-fix', f.reason)
}

return { status: 'completed', completedSteps: [...done],
         skipped: { user: [...skip], pdca: [...pdcaSkip] }, fixAttempts: attempts }

function abort(stage, reason) {
  return { status: 'aborted', failedStage: stage, reason, completedSteps: [...done] }
}
function bail(kind, metrics, steps) {
  return { status: kind, metrics, completedSteps: steps }
}
```

주요 결정:

1. **순차성은 `await`가 구조적으로 보장** — 기존 ⛔ "한 메시지에 Agent 두 번 금지" 경고 삭제.
2. **impl+test 병합 유지** — 코드 컨텍스트 재사용 근거는 그대로 유효.
3. **review 모델 차등(L1 sonnet) 유지** — 판정을 JS `resolveReviewModel`로 이관. 단, `cachedIssue`가 start/approach 실행 후에야 생기는 문제: start/approach agent가 구조화 반환에 `issueType`을 실어 보내고 스크립트가 갱신하는 것으로 해결 (기존 "호출 직전 재-Read"의 대체).
4. **fix loop 상한 2회 유지**. fix prompt에는 개선안 2번의 훅으로 "lint/관련 테스트가 green이 될 때까지 내부에서 반복한 뒤 반환하라"를 명시 (재리뷰 횟수 절약).
5. **stage prompt는 기존 표준 prompt를 함수로 이식** — `[review-self-mode]` 마커, "산출물 본문 미반환" 지시, script-lookup 지시 등 그대로. 달라지는 건 마지막의 "텍스트 요약 반환" → "StructuredOutput 반환"뿐.

---

## 신뢰 경계 (self-report 문제)

기존 auto는 stage 후 `.jira-context.json`을 **오케스트레이터가 직접 재-Read**해 검증했다. 스크립트는 파일을 못 읽으므로 stage agent의 `completedStepsAfter` **자기 보고**에 의존한다.

완화책 (이번 설계에 포함):
- prompt에 "종료 직전 worktree `.jira-context.json`을 재-Read하여 `completedStepsAfter`에 **그대로 옮겨 적어라**" 명시 — 확인 동작을 강제.
- `cwdVerified` 필드: 알려진 버그(impl이 repoRoot에 작업 → review 0% 매칭)의 조기 차단. prompt 첫 지시가 "pwd가 `<worktreePath>`인지 확인, 불일치 시 즉시 result=failed" 이고 스크립트가 이 플래그를 게이트한다.
- 허위 success는 다음 단계(test 실패, review 게이트)에서 걸린다 — 파이프라인 자체가 2차 검증.

**보류한 대안**: 게이트마다 haiku "sensor agent"로 파일을 읽혀 교차 검증. agent 4회 추가 비용 대비, false-success가 실제 관측되기 전에는 과잉 방어로 판단. 관측되면 그때 추가 (하니스 가정은 상하면 쳐낸다 — 역방향도 동일).

---

## 재개(resume) 전략

- **1차 (cross-session, 정본)**: 기존과 동일 — `completedSteps` 기반. 중단 후 `/jira-task auto` 재실행 → 스킬이 최신 context를 읽어 args를 다시 조립 → 남은 단계만 실행.
- **2차 (same-session 보너스)**: Workflow `resumeFromRunId` — 같은 세션에서 스크립트 수정 후 재시도할 때 완료 stage의 캐시 재사용. 스킬에는 안 싣고 플러그인 개발용으로만 문서화.

---

## SKILL.md에서 삭제되는 것 / 남는 것

| 삭제 (스크립트로 이관 또는 소멸) | 남음 (thin launcher) |
|---|---|
| Step 2 순차 실행 규칙 + ⛔ 경고 전부 | 인자 파싱 (TASK-ID, --skip 자연어 포함) |
| 단계별 재-Read 지시 | context Read → args 조립 |
| Step 3 triage 분기표 + fallback 정규식 | script-lookup + Workflow 호출 |
| Triage Parse Bail (구조적 소멸) | 실행 계획 표시 (🚀 Auto 모드 블록) |
| fix loop 절차 서술 | 반환 status별 한국어 메시지 렌더링 (완료/abort/shortfall/exhausted — 기존 템플릿 재사용) |
| 모델 표의 "호출 직전 판정" 서술 | Language Rule, Overview |

frontmatter `allowed-tools`에 `Workflow` 추가, `Agent` 제거.

---

## 마이그레이션 / 테스트 계획

1. `scripts/workflows/auto.workflow.js` 작성 + SKILL.md 축소. `plugin.json` **v0.52.0**.
2. 단위 검증: 더미 태스크 1건으로 `auto` 단독 실행 — (a) 전 단계 신규, (b) `completedSteps` 부분 완료 재개, (c) `--skip test`, (d) review 게이트 미통과 → fix loop 1회, (e) scope shortfall bail.
3. 통합 검증: `loop` 무수정 상태로 2태스크 큐 소진 — loop→auto(Workflow) 경유 시 notification 대기·요약 렌더링 확인.
4. 회귀 체크리스트: `tasks/harness-improvement-review.md`의 "유지할 것" 목록 — 서브에이전트 격리, context 핸드오프, cache-first fetch가 stage 스킬 레벨에서 그대로 동작하는지.

## 오픈 이슈

- **Workflow 백그라운드 실행과 loop의 상호작용**: loop 턴이 auto의 notification을 기다리는 흐름이 세션 종류(headless 포함)에서 안정적인지 첫 통합 테스트에서 확인. 불안정하면 loop도 Phase 2를 앞당겨 함께 스크립트화 (loop.js가 `workflow({scriptPath: auto})`를 중첩 호출 — 1단계 중첩 허용 범위 내).
- **stage agent의 cwd**: Workflow agent가 세션 cwd를 상속하는지 확인 필요. 상속 안 되면 prompt의 "cd <worktreePath> 후 시작" 지시가 유일한 수단이 되므로 `cwdVerified` 가드의 비중이 커진다.
