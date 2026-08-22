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
  required: ['step', 'result', 'cwdVerified', 'completedStepsAfter', 'testResult'],
  properties: {
    ...STAGE_SCHEMA.properties,
    filesEdited: { type: 'integer' },
    testResult: { type: 'string', enum: ['success', 'failed'] },
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
  if (breakdownLevel) return breakdownLevel === 'L1' ? 'sonnet' : 'opus'
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
      `3. Skill의 PDCA 권고 블록에서 "스킵 가능"으로 판정된 단계를 pdcaSkippable 배열로 반환하라 (없으면 빈 배열).`,
      `4. cachedIssue의 issuetype 이름을 issueType 필드로 반환하라.`,
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
    skillStagePrompt('approach', `3. 판정된 breakdownLevel과 이슈의 issuetype 이름을 issueType 필드로 반환하라.`),
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

function reviewPrompt() {
  return [
    guardHeader,
    ``,
    `[review-self-mode]`,
    ``,
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

function fixPrompt() {
  return [
    guardHeader,
    ``,
    `Jira task ${taskId}의 리뷰 지적사항을 수정하고 테스트를 재실행하라.`,
    ``,
    `1. \`docs/review/${taskId}.review.md\`를 Read로 읽는다.`,
    `2. Critical 항목과 Gap Analysis 미충족 항목을 식별한다 (게이트를 막는 것은 이 둘뿐). Warning은 같은 파일을 이미 수정 중이라 저비용으로 처리되는 경우에만 함께 고치고, 이를 위해 추가 파일을 열지 마라.`,
    `3. 지적된 이슈를 Edit으로 코드에 직접 반영한다. 수정 범위는 리뷰 지적 사항에 한정 — 무관한 리팩토링 금지.`,
    `3-b. 코드를 수정했으면 lint를 배치 1회 재실행한다 (impl Step 2.5와 동일 규칙: 선언된 도구만, \`npx --no-install\`, 변경 파일 전체를 한 번에). 결과로 worktree \`.jira-context.json\`의 \`implSelfCheck.lint\`와 \`ranAt\`을 Edit으로 갱신한다 (\`implSelfCheck\` 키가 없으면 생성) — 재리뷰가 이 기록을 인용한다.`,
    `4. \`.jira-context.json\`을 Read로 읽고, completedSteps에서 "test"와 "review"를 제거한 뒤 Edit으로 다시 쓴다 (재실행 가능하게).`,
    `5. \`jira-integration:jira-task-test\` Skill을 인자 "${taskId}"로 호출하여 테스트를 재실행한다 (수정된 코드 컨텍스트를 그대로 재사용). 결과를 testResult로 반환하라.`,
    ``,
    returnFooter,
  ].join('\n')
}

let fixAttempts = 0
let lastMetrics = null

while (shouldRun('review')) {
  const reviewModel = resolveReviewModel()
  const g = await runStage('review', reviewModel, reviewPrompt(), 'Review', REVIEW_SCHEMA)
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
    return { status: 'scope_shortfall', metrics: m, completedSteps: [...done], skipped: skippedInfo(), fixAttempts }
  }

  if (fixAttempts >= 2) {
    return { status: 'fix_exhausted', metrics: m, completedSteps: [...done], skipped: skippedInfo(), fixAttempts }
  }

  fixAttempts++
  log(`review 게이트 미통과 (시도 ${fixAttempts}/2) — fix+test sub-agent 위임`)

  const f = await runStage('review-fix', 'sonnet', fixPrompt(), 'Fix', FIX_SCHEMA)
  if (!f.ok) return abort('review-fix', f.reason)
  if (f.r.testResult !== 'success') return abort('review-fix', `수정 후 테스트 실패: ${f.r.failureReason || '사유 미보고'}`)
  done.delete('test')
  if (f.r.completedStepsAfter.includes('test')) done.add('test')
}

// ---------- 5. 완료 ----------

return {
  status: 'completed',
  completedSteps: [...done],
  skipped: skippedInfo(),
  fixAttempts,
  metrics: lastMetrics,
}
