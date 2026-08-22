export const meta = {
  name: 'jira-task-auto',
  description: 'Jira task 단계 파이프라인 자동 실행 (start→approach→impl+test→review + fix loop)',
  phases: [
    { title: 'Start' },
    { title: 'Approach' },
    { title: 'Impl+Test' },
    { title: 'Review' },
    { title: 'Fix' },
  ],
}

// 설계: tasks/auto-workflow-design.md
// launcher(skills/jira-task-auto/SKILL.md)가 args를 조립해 호출하고, 반환 객체로 한국어 요약을 렌더링한다.
// 이 스크립트는 제어 흐름(순서·게이트·triage·fix loop)만 담당 — 판단 작업은 전부 agent()에 위임.

const {
  taskId,
  worktreePath,
  completedSteps = [],
  userSkipSteps = [],
  breakdownLevel = null,
  issueType: initialIssueType = null,
  ctxFiles = [],
} = args

const worktreeCtx = ctxFiles[0] || `${worktreePath}/.jira-context.json`
const done = new Set(completedSteps)
const skip = new Set(userSkipSteps)
let pdcaSkip = new Set()
let issueType = initialIssueType
let level = breakdownLevel

// ---------- 스키마 ----------

const STAGE_SCHEMA = {
  type: 'object',
  required: ['step', 'result', 'cwdVerified', 'completedStepsAfter'],
  properties: {
    step: { type: 'string' },
    result: { type: 'string', enum: ['success', 'failed'] },
    cwdVerified: { type: 'boolean' },
    completedStepsAfter: { type: 'array', items: { type: 'string' } },
    artifactPaths: { type: 'array', items: { type: 'string' } },
    jiraCommentPosted: { type: 'boolean' },
    issueType: { type: ['string', 'null'] },
    breakdownLevel: { type: ['string', 'null'], enum: ['L1', 'L2', 'L3', null] },
    pdcaSkippable: { type: 'array', items: { type: 'string' } },
    nextStepHint: { type: ['string', 'null'] },
    failureReason: { type: ['string', 'null'] },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['step', 'result', 'cwdVerified', 'completedStepsAfter', 'metrics'],
  properties: {
    ...STAGE_SCHEMA.properties,
    metrics: {
      type: 'object',
      required: ['matchRate', 'criticalCount', 'warningCount', 'infoCount'],
      properties: {
        matchRate: { type: ['number', 'null'] },
        criticalCount: { type: 'integer' },
        warningCount: { type: 'integer' },
        infoCount: { type: 'integer' },
      },
    },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  required: ['step', 'result', 'cwdVerified', 'completedStepsAfter', 'converged', 'innerLoopIterations', 'testResult'],
  properties: {
    ...STAGE_SCHEMA.properties,
    filesEdited: { type: 'array', items: { type: 'string' } },
    converged: { type: 'boolean' },                 // inner sensor loop이 green으로 끝났는가
    innerLoopIterations: { type: 'integer' },
    sensorSummary: { type: ['string', 'null'] },    // 미수렴 시 마지막 sensor 출력 요약 (bail 메시지용)
    testResult: { type: 'string', enum: ['success', 'failed', 'skipped'] },  // 전체 스위트 (수렴 후 1회)
  },
}

// ---------- 공통 프롬프트 조각 ----------

const guardHeader = [
  `먼저 pwd로 현재 디렉터리를 확인하라. "${worktreePath}"가 아니면 어떤 작업도 수행하지 말고`,
  `cwdVerified=false, result=failed, failureReason="cwd mismatch"로 즉시 반환하라.`,
  `일치하면 cwdVerified=true.`,
].join(' ')

const returnFooter = [
  `완료 후 StructuredOutput으로만 결과를 반환하라:`,
  `- 종료 직전 "${worktreeCtx}"를 Read로 다시 읽어, completedSteps 배열의 현재 값을 completedStepsAfter에 그대로 옮겨 적어라 (기억에 의존하지 말 것).`,
  `- 산출물 본문(approach 문서 내용, 코드 diff, 테스트 로그)을 반환하지 마라 — 부모 컨텍스트 오염 방지.`,
].join('\n')

function skillStagePrompt(step, extra = '') {
  return [
    guardHeader,
    ``,
    `Jira task ${taskId}의 ${step} 단계를 수행하라.`,
    ``,
    `1. \`jira-integration:jira-task-${step}\` Skill을 호출한다 (인자: "${taskId}").`,
    `2. Skill이 정의한 모든 단계를 그대로 수행한다.`,
    extra,
    ``,
    returnFooter,
  ].join('\n')
}

// ---------- 공통 실행기 ----------

async function runStage(step, model, prompt, phase, schema = STAGE_SCHEMA) {
  const r = await agent(prompt, {
    label: `${step}:${taskId}`,
    phase,
    model,
    agentType: 'general-purpose',
    schema,
  })
  if (!r) return { ok: false, reason: 'sub-agent가 결과 없이 종료됨 (skip 또는 터미널 에러)' }
  if (!r.cwdVerified) return { ok: false, reason: `sub-agent cwd가 worktree(${worktreePath})가 아님 — repoRoot 오염 가드` }
  if (r.result !== 'success') return { ok: false, reason: r.failureReason || '사유 미보고' }
  if (r.issueType) issueType = r.issueType
  if (r.breakdownLevel) level = r.breakdownLevel
  return { ok: true, r }
}

function abort(stage, reason) {
  return { status: 'aborted', failedStage: stage, reason, completedSteps: [...done], skipped: skippedInfo() }
}

function skippedInfo() {
  return { user: [...skip], pdca: [...pdcaSkip] }
}

function shouldRun(step) {
  return !done.has(step) && !skip.has(step) && !pdcaSkip.has(step)
}

// L1 판정: breakdownLevel 우선, 없으면 issuetype 폴백, 둘 다 없으면 opus (보수 기본값)
function resolveReviewModel() {
  if (level) return level === 'L1' ? 'sonnet' : 'opus'
  const l1Types = ['Subtask', 'Sub-task', 'Task', 'Bug', '하위 작업', '작업', '버그']
  if (issueType && l1Types.includes(issueType)) return 'sonnet'
  return 'opus'
}

// ---------- 1. start ----------

if (shouldRun('start')) {
  const g = await runStage(
    'start',
    'haiku',
    skillStagePrompt('start', [
      `   ⛔ Skill Step 6의 context 갱신은 반드시 jira-context-update.py 호출로 수행한다 — .jira-context.json을 Edit으로 직접 패치하지 마라 (startAt 등 타임스탬프가 스크립트의 UTC 규약을 따라야 run-log 소요시간이 맞는다).`,
      `3. Skill의 PDCA 권고 블록에서 "스킵 가능"으로 판정된 단계를 pdcaSkippable 배열로 반환하라 (없으면 빈 배열).`,
      `4. cachedIssue의 issuetype 이름만(예: "작업") issueType 필드로 반환하라 — 부가 설명 금지.`,
    ].join('\n')),
    'Start'
  )
  if (!g.ok) return abort('start', g.reason)
  if (!g.r.completedStepsAfter.includes('start')) return abort('start', 'completedSteps에 start 미기록 — context-update 실패 의심')
  // PDCA 스킵은 approach/test만 후보. 사용자 명시 스킵과 무관한 단계에만 적용.
  pdcaSkip = new Set((g.r.pdcaSkippable || []).filter((s) => ['approach', 'test'].includes(s) && !skip.has(s)))
  done.add('start')
  log(`start 완료${pdcaSkip.size ? ` — PDCA 스킵: ${[...pdcaSkip].join(', ')}` : ''}`)
}

// ---------- 2. approach ----------

if (shouldRun('approach')) {
  const g = await runStage(
    'approach',
    'opus',
    skillStagePrompt('approach', [
      `3. Step 0에서 판정한 레벨을 breakdownLevel 필드에 "L1"|"L2"|"L3"로 반환하라.`,
      `4. 이슈의 issuetype 이름만(예: "작업") issueType 필드로 반환하라 — 부가 설명 금지.`,
    ].join('\n')),
    'Approach'
  )
  if (!g.ok) return abort('approach', g.reason)
  if (!g.r.completedStepsAfter.includes('approach')) return abort('approach', 'completedSteps에 approach 미기록 — context-update 실패 의심')
  done.add('approach')
  log('approach 완료')
}

// ---------- 3. impl+test (병합 — 동일 모델·코드 컨텍스트 재사용) ----------

const substeps = ['impl', 'test'].filter((s) => shouldRun(s))
if (substeps.length) {
  const g = await runStage(
    'impl+test',
    'sonnet',
    [
      guardHeader,
      ``,
      `Jira task ${taskId}의 다음 하위 단계를 하나의 컨텍스트에서 순서대로 수행하라: ${substeps.join(', ')}.`,
      `⛔ 위 목록에 있는 단계만 수행한다. 목록에 없는 단계(예: test, review)의 Skill은 Skill 본문이나 이슈 완료 조건이 권해도 호출하지 마라 — 오케스트레이터가 스킵으로 결정한 단계다.`,
      ``,
      `1. 각 하위 단계를 순서대로, \`jira-integration:jira-task-<하위단계명>\` Skill을 인자 "${taskId}"로 호출하여 Skill이 정의한 모든 단계를 그대로 수행한다.`,
      `2. 앞 하위 단계(impl)가 실패하면 뒤(test)를 시도하지 말고 즉시 result=failed로 반환한다.`,
      `3. test는 impl이 방금 만든 코드 컨텍스트를 그대로 재사용한다 (코드 재탐색 최소화).`,
      ``,
      returnFooter,
    ].join('\n'),
    'Impl+Test'
  )
  if (!g.ok) return abort('impl+test', g.reason)
  const missing = substeps.filter((s) => !g.r.completedStepsAfter.includes(s))
  if (missing.length) return abort('impl+test', `completedSteps에 ${missing.join(', ')} 미기록 — 부분 실패`)
  substeps.forEach((s) => done.add(s))
  log(`${substeps.join('+')} 완료`)
}

// ---------- 4. review + triage + fix loop ----------

function reviewPrompt(delta) {
  return [
    guardHeader,
    ``,
    `[review-self-mode]${delta ? ' [review-delta-mode]' : ''}`,
    ``,
    delta
      ? `이번 리뷰는 fix loop 재리뷰다. [review-delta-mode] 규칙(reviewer-mode.md)에 따라 직전 리뷰의 Critical/미충족 Gap 항목과 fixSelfCheck.files에 든 파일만 재검증하고, 나머지 항목은 직전 판정을 승계한다.`
      : ``,
    `Jira task ${taskId}의 review 단계를 수행하라. \`jira-integration:jira-task-review\` Skill을 인자 "${taskId}"로 호출한다.`,
    ``,
    `주의: 본 wrapper는 이미 격리된 sub-agent 컨텍스트이므로 추가 Agent 도구 사용 권한이 없다.`,
    `[review-self-mode] 마커에 따라 Skill의 Step 2를 self-mode(직접 수행)로 진행한다 — gap analysis / lint / code quality 검토를 직접 수행.`,
    `이미 approach/impl과 분리된 fresh context이므로 self-praise bias 우려 없음.`,
    ``,
    `리뷰 리포트 최상단 review-metrics 블록의 값(matchRate/criticalCount/warningCount/infoCount)을 metrics 객체로 반환하라.`,
    `Gap Analysis를 스킵했으면 matchRate는 null.`,
    ``,
    returnFooter,
  ].join('\n')
}

// 설계: tasks/sensor-loop-design.md — 루프 안쪽엔 초 단위 computational sensor, 바깥엔 분 단위 판정.
function fixPrompt() {
  return [
    guardHeader,
    ``,
    `Jira task ${taskId}의 리뷰 지적사항을 수정하고, 싼 센서(lint/typecheck/관련 테스트)로 수렴시킨 뒤 전체 테스트를 1회 재실행하라.`,
    ``,
    `## A. 수정 대상 식별`,
    `1. \`docs/review/${taskId}.review.md\`를 Read로 읽는다.`,
    `2. Critical 항목과 Gap Analysis 미충족 항목을 식별한다 (게이트를 막는 것은 이 둘뿐). Warning은 같은 파일을 이미 수정 중이라 저비용으로 처리되는 경우에만 함께 고치고, 이를 위해 추가 파일을 열지 마라.`,
    ``,
    `## B. Inner sensor loop (최대 5회 — jira-task-test Skill을 부르지 마라)`,
    `회차마다: 수정(Edit) → 아래 센서 실행 → 실패 출력을 다음 수정의 입력으로 → 전부 green이면 종료.`,
    `- lint: impl Step 2.5와 동일 규칙 (선언된 도구만, \`npx --no-install\`, 변경 파일 전체를 배치 1회). 회차당 1회, 파일 저장마다 돌리지 마라.`,
    `- typecheck: 프로젝트가 선언한 것만 (tsc 등). 없으면 skipped.`,
    `- 관련 테스트만 (전체 스위트 금지): vitest → \`vitest related <변경파일> --run\` / jest → \`jest --findRelatedTests <변경파일>\` / pytest → \`pytest --lf\` / playwright → 직전 실패 spec만 \`--grep\` 또는 파일 지정 / 선별 불가(custom) → 직전 실패 테스트 목록만, 그것도 불가면 이 항목 skipped.`,
    `5회 안에 green이 안 되면 멈추고 converged=false, 마지막 센서 출력을 sensorSummary(3줄 이내)로 반환하라 — 전체 테스트·재리뷰로 넘어가지 마라.`,
    ``,
    `## C. 기록`,
    `worktree \`.jira-context.json\`에 Edit으로 기록 (aggregate 금지):`,
    `  "fixSelfCheck": { "iterations": <N>, "files": [<수정 파일 상대경로>], "lint": {tool, files, errors, warnings}, "typecheck": "pass|fail|skipped", "relatedTests": "pass|fail|skipped", "ranAt": "<UTC ISO8601 Z>" }`,
    `\`implSelfCheck.lint\`와 \`ranAt\`도 마지막 lint 결과로 갱신한다 (재리뷰가 인용하는 대상).`,
    ``,
    `## D. 전체 스위트 1회 (수렴 후에만)`,
    `1. \`.jira-context.json\`의 completedSteps에서 "test"와 "review"를 제거한다 (Edit).`,
    `2. \`jira-integration:jira-task-test\` Skill을 인자 "${taskId}"로 호출한다 (리포트·Jira 코멘트는 이 1회만 갱신). 결과를 testResult로 반환.`,
    ``,
    returnFooter,
    `- filesEdited에는 수정한 파일 상대경로 목록, innerLoopIterations에는 B의 회차 수를 넣어라.`,
  ].join('\n')
}

let fixAttempts = 0
let innerLoopIterations = 0
let lastMetrics = null

while (shouldRun('review')) {
  const reviewModel = resolveReviewModel()
  // 1회차는 항상 full 리뷰, fix 이후 재리뷰는 delta 모드 (직전 Critical/미충족 Gap + 수정 파일만 재검증)
  const g = await runStage('review', reviewModel, reviewPrompt(fixAttempts > 0), 'Review', REVIEW_SCHEMA)
  if (!g.ok) return abort('review', g.reason)

  const m = g.r.metrics
  lastMetrics = m
  const passed = g.r.completedStepsAfter.includes('review')

  if (passed) {
    done.add('review')
    log('review 통과')
    break
  }

  // Scope Shortfall Triage — 근거: skills/jira-task-auto/refs/review-wrapper.md
  // matchRate < 70% 또는 Critical ≥ 3 → 단일 fix agent로 못 메우는 scope 누락 → 사용자 위임.
  // (구버전의 Triage Parse Bail은 schema 강제 반환으로 구조적으로 소멸 — 파싱 실패 경로 없음)
  if ((m.matchRate !== null && m.matchRate < 70) || m.criticalCount >= 3) {
    return { status: 'scope_shortfall', metrics: m, completedSteps: [...done], skipped: skippedInfo(), fixAttempts, innerLoopIterations }
  }

  if (fixAttempts >= 2) {
    return { status: 'fix_exhausted', metrics: m, completedSteps: [...done], skipped: skippedInfo(), fixAttempts, innerLoopIterations }
  }

  fixAttempts++
  log(`review 게이트 미통과 (시도 ${fixAttempts}/2) — fix sub-agent 위임 (inner sensor loop → 전체 테스트 1회)`)

  const f = await runStage('review-fix', 'sonnet', fixPrompt(), 'Fix', FIX_SCHEMA)
  if (!f.ok) return abort('review-fix', f.reason)
  innerLoopIterations += f.r.innerLoopIterations || 0
  if (!f.r.converged) {
    // inner loop 미수렴 = computational sensor로 안 잡히는 종류의 문제 → 재리뷰 없이 사용자 위임
    return {
      status: 'fix_unconverged', metrics: m, completedSteps: [...done], skipped: skippedInfo(),
      fixAttempts, innerLoopIterations, sensorSummary: f.r.sensorSummary || null,
    }
  }
  if (f.r.testResult !== 'success') return abort('review-fix', `수정 후 전체 테스트 실패: ${f.r.failureReason || '사유 미보고'}`)
  done.delete('test')
  if (f.r.completedStepsAfter.includes('test')) done.add('test')
}

// ---------- 5. 완료 ----------

return {
  status: 'completed',
  completedSteps: [...done],
  skipped: skippedInfo(),
  fixAttempts,
  innerLoopIterations,
  metrics: lastMetrics,
}
