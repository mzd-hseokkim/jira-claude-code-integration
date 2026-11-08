export const meta = {
  name: 'jira-task-auto',
  description: 'Jira task를 다음 사람 게이트까지 자동 진행 (start→approach | test-write→impl→verify + fix loop)',
  phases: [
    { title: 'Start' },
    { title: 'Approach' },
    { title: 'Test-write' },
    { title: 'Impl' },
    { title: 'Verify' },
    { title: 'Fix' },
  ],
}

// 설계: tasks/sdlc-alignment-design.md §8 (구 설계: tasks/auto-workflow-design.md)
// launcher(skills/jira-task-auto/SKILL.md)가 등급을 확정하고 args를 조립해 호출한다. 반환 객체로 한국어 요약을 렌더링한다.
// 이 스크립트는 제어 흐름(순서·게이트·triage·fix loop)만 담당 — 판단 작업은 전부 agent()에 위임.
// 멈추는 곳: L2·L3 승인 대기(approach 뒤, 또는 승인 확인 실패) / 리뷰 요청 준비됨(verify 통과). draft 해제와 머지는 사람.
// 단계마다 새 sub-agent라 test-write / impl / verify는 서로 다른 컨텍스트다 (TA-COM-AGT-001, SD-COM-VER-003).

const {
  taskId,
  worktreePath,
  completedSteps = [],
  level: initialLevel = null,   // launcher가 확정한 등급 (context level)
  ctxFiles = [],
  scriptsDir = null,            // 플러그인 scripts/ 절대 경로 — launcher가 lookup을 1회 끝내고 넘긴다
  harness = 'claude-code',      // 'codex'면 scripts/auto-codex.js가 agent()를 codex exec로 대신한다
} = args

const codex = harness === 'codex'
const worktreeCtx = ctxFiles[0] || `${worktreePath}/.jira-context.json`
const done = new Set(completedSteps)
let level = initialLevel

// ---------- 스키마 ----------

const STAGE_SCHEMA = {
  type: 'object',
  required: ['step', 'result', 'cwdVerified', 'completedStepsAfter'],
  properties: {
    step: { type: 'string' },
    result: { type: 'string', enum: ['success', 'failed'] },
    cwdVerified: { type: 'boolean' },
    completedStepsAfter: { type: 'array', items: { type: 'string' } },
    level: { type: ['string', 'null'], enum: ['L1', 'L2', 'L3', null] },
    prUrl: { type: ['string', 'null'] },
    failureReason: { type: ['string', 'null'] },
  },
}

const APPROACH_SCHEMA = {
  type: 'object',
  required: [...STAGE_SCHEMA.required, 'awaitingArtifact', 'awaitingKind'],
  properties: {
    ...STAGE_SCHEMA.properties,
    awaitingArtifact: { type: ['string', 'null'], enum: ['intent', 'spec', 'plan', 'spec·plan', null] },
    // approval: 승인 요청함 / answers: 미결 질문에 답을 기다림 (승인 요청 전)
    awaitingKind: { type: 'string', enum: ['approval', 'answers'] },
  },
}

const TEST_WRITE_SCHEMA = {
  type: 'object',
  required: [...STAGE_SCHEMA.required, 'gateStatus'],
  properties: {
    ...STAGE_SCHEMA.properties,
    // sdlc-gate.py check 결과: L1은 'not_required', 재실행(planApproval 있음)은 'approved'
    gateStatus: { type: 'string', enum: ['approved', 'not_approved', 'error', 'not_required'] },
    gateDetail: { type: ['string', 'null'] },   // not_approved/error면 스크립트 출력의 사유·승인자·howto 요약
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: [...STAGE_SCHEMA.required, 'metrics', 'unmet'],
  properties: {
    ...STAGE_SCHEMA.properties,
    metrics: {
      type: 'object',
      required: ['acTotal', 'acMet', 'acUnmet', 'acUnverified', 'checksPassed', 'criticalCount', 'warningCount', 'infoCount'],
      properties: {
        acTotal: { type: 'integer' },
        acMet: { type: 'integer' },
        acUnmet: { type: 'integer' },
        acUnverified: { type: 'integer' },
        checksPassed: { type: ['boolean', 'null'] },
        criticalCount: { type: 'integer' },
        warningCount: { type: 'integer' },
        infoCount: { type: 'integer' },
      },
    },
    // fix agent 입력 — 미충족 AC·Critical·실패 검사를 한 줄씩 (본문 전체 금지)
    unmet: { type: 'array', items: { type: 'string' } },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  required: [...STAGE_SCHEMA.required, 'converged', 'innerLoopIterations'],
  properties: {
    ...STAGE_SCHEMA.properties,
    filesEdited: { type: 'array', items: { type: 'string' } },
    converged: { type: 'boolean' },                 // inner sensor loop이 green으로 끝났는가
    innerLoopIterations: { type: 'integer' },
    sensorSummary: { type: ['string', 'null'] },    // 미수렴 시 마지막 센서 출력 요약
    testDispute: { type: ['string', 'null'] },      // 테스트 자체가 틀렸다는 판단이면 사유 (테스트는 고치지 않는다)
  },
}

// ---------- 공통 프롬프트 조각 ----------

const scriptPath = (name) => (scriptsDir ? `${scriptsDir}/${name}` : name)

const guardHeader = [
  `먼저 pwd로 현재 디렉터리를 확인하라. "${worktreePath}"가 아니면 어떤 작업도 수행하지 말고`,
  `cwdVerified=false, result=failed, failureReason="cwd mismatch"로 즉시 반환하라. 일치하면 cwdVerified=true.`,
  ``,
  `호출 비용 규칙 (도구 호출 1회 ≈ 10초 — 의식 호출을 줄여라):`,
  codex
    ? `- 즉석 스크립트 작성 금지. 스킬의 명령을 그대로 실행한다.`
    : `- 셸 명령은 Bash 도구만 쓴다. PowerShell 도구·즉석 스크립트 작성 금지.`,
  scriptsDir
    ? `- 플러그인 스크립트는 전부 "${scriptsDir}/" 아래에 있다 (jira-cli.py, jira-context-update.py, sdlc-gate.py, verify-checks.py, append-review-log-wrapper.sh, detect-lint.sh). Skill 본문의 script-lookup.md Read·lookup 블록·ls 확인을 전부 생략하고 이 절대 경로를 바로 쓴다.`
    : `- 플러그인 스크립트는 Skill 본문의 script-lookup 규약으로 1회만 해석한다.`,
  `- 이 worktree의 .jira-context.json은 "${worktreeCtx}"다 — 경로를 찾기 위한 ls/find 금지.`,
  `- Jira 호출은 전부 \`python3 "${scriptPath('jira-cli.py')}" ...\`로 한다 (규약: skills/_shared/jira-cli.md). mcp__atlassian__* 도구와 그것을 위한 ToolSearch는 사용하지 마라.`,
  `- 사용자에게 질문할 수 없다. Skill이 사용자 확인을 요구하는 지점에 오면 추정으로 진행하지 말고 result=failed, failureReason에 무엇을 확인받아야 하는지 적어 반환하라.`,
].join('\n')

const returnFooter = [
  codex
    ? `완료 후 최종 응답으로 출력 스키마에 맞는 JSON 객체 하나만 쓴다:`
    : `완료 후 StructuredOutput으로만 결과를 반환하라:`,
  `- completedStepsAfter에는 jira-context-update.py 실행 출력의 \`completedSteps=[...]\` 값을 그대로 옮겨 적는다 (파일 재-Read 금지, 기억에 의존 금지). 이번에 context를 갱신하지 않았으면 Skill 시작 시 읽은 값.`,
  `- 산출물 본문(spec·plan 내용, 코드 diff, 테스트 로그)을 반환하지 마라 — 부모 컨텍스트 오염 방지.`,
].join('\n')

const skillCall = (step) =>
  codex
    ? `\`$jira-task-${step}\` 스킬(jira-integration:jira-task-${step})의 SKILL.md를 읽고 인자 "${taskId}"로 수행한다`
    : `\`jira-integration:jira-task-${step}\` Skill을 호출한다 (인자: "${taskId}")`

function skillStagePrompt(step, extra = '') {
  return [
    guardHeader,
    ``,
    `Jira task ${taskId}의 ${step} 단계를 수행하라.`,
    ``,
    `1. ${skillCall(step)}.`,
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
  if (r.level) level = r.level
  if (r.result !== 'success') return { ok: false, reason: r.failureReason || '사유 미보고', r }
  return { ok: true, r }
}

let prUrl = null
const base = () => ({ completedSteps: [...done], level, prUrl })

function abort(stage, reason) {
  return { status: 'aborted', failedStage: stage, reason, ...base() }
}

function requireStep(g, step) {
  return g.r.completedStepsAfter.includes(step) ? null : `completedSteps에 ${step} 미기록 — context-update 실패 의심`
}

// ---------- 1. start ----------

if (!done.has('start')) {
  const g = await runStage(
    'start',
    'haiku',
    skillStagePrompt('start', [
      `   ⛔ context 갱신은 반드시 jira-context-update.py 호출로 한다 — .jira-context.json을 Edit으로 직접 패치하지 마라.`,
      `   ⛔ 등급은 launcher가 이미 확정했다(이슈 라벨 sdlc-L*). 라벨이 없으면 판정·질문하지 말고 result=failed, failureReason="등급 미확정"으로 반환하라.`,
      `3. 확정 등급을 level 필드에 "L1"|"L2"|"L3"로 반환하라.`,
    ].join('\n')),
    'Start'
  )
  if (!g.ok) return abort('start', g.reason)
  const miss = requireStep(g, 'start')
  if (miss) return abort('start', miss)
  done.add('start')
  log(`start 완료 — ${level}`)
}

if (!level) return { status: 'level_unconfirmed', ...base() }

// ---------- 2. approach (L2·L3) — 산출물 커밋 후 항상 승인 대기로 멈춘다 ----------

if (level !== 'L1' && !done.has('approach')) {
  const g = await runStage(
    'approach',
    'opus',
    skillStagePrompt('approach', [
      `3. 이번 실행이 승인을 요청한 산출물을 awaitingArtifact로 반환하라 (L2 "spec·plan", L3 "intent"|"spec"|"plan"). L3에서 직전 산출물이 아직 승인되지 않아 아무것도 쓰지 않았으면 그 산출물 이름.`,
      `   승인을 요청했으면 awaitingKind="approval", Skill Step 5-a로 질문만 하고 멈췄거나 답변 대기면 "answers".`,
      `4. draft PR URL을 prUrl로 반환하라.`,
    ].join('\n')),
    'Approach',
    APPROACH_SCHEMA
  )
  if (!g.ok) return abort('approach', g.reason)
  prUrl = g.r.prUrl || prUrl
  if (g.r.completedStepsAfter.includes('approach')) done.add('approach')
  log(`approach — ${g.r.awaitingArtifact} ${g.r.awaitingKind === 'answers' ? '답변' : '승인'} 대기`)
  return { status: 'awaiting_approval', artifact: g.r.awaitingArtifact, awaitingKind: g.r.awaitingKind, ...base() }
}

// ---------- 3. test-write — L2·L3는 여기서 sdlc-gate로 plan 승인을 확인한다 ----------

if (!done.has('test-write')) {
  const g = await runStage(
    'test-write',
    'sonnet',
    skillStagePrompt('test-write', [
      `3. Skill Step 0의 sdlc-gate.py 결과를 gateStatus로 반환하라: exit 0 → "approved", exit 1 → "not_approved", exit 2 → "error", L1 → "not_required", context에 planApproval이 이미 있어 확인을 건너뛰었으면 "approved".`,
      `   not_approved·error면 운영 코드도 테스트도 쓰지 말고 result=failed로 반환하고, 스크립트 출력의 사유·승인자·howto를 gateDetail에 2줄 이내로 적어라.`,
    ].join('\n')),
    'Test-write',
    TEST_WRITE_SCHEMA
  )
  if (g.r && g.r.gateStatus === 'not_approved') {
    return { status: 'awaiting_approval', artifact: level === 'L2' ? 'spec·plan' : 'plan', awaitingKind: 'approval', gateDetail: g.r.gateDetail || null, ...base() }
  }
  if (!g.ok) return abort('test-write', g.r && g.r.gateStatus === 'error' ? `승인 확인 오류: ${g.r.gateDetail || g.reason}` : g.reason)
  const miss = requireStep(g, 'test-write')
  if (miss) return abort('test-write', miss)
  done.add('test-write')
  log('test-write 완료')
}

// ---------- 4. impl — test-write와 다른 컨텍스트 ----------

if (!done.has('impl')) {
  const g = await runStage(
    'impl',
    'sonnet',
    skillStagePrompt('impl', `3. draft PR URL을 prUrl로 반환하라.`),
    'Impl'
  )
  if (!g.ok) return abort('impl', g.reason)
  const miss = requireStep(g, 'impl')
  if (miss) return abort('impl', miss)
  prUrl = g.r.prUrl || prUrl
  done.add('impl')
  log('impl 완료')
}

// ---------- 5. verify + triage + fix loop ----------

function verifyPrompt(delta) {
  return [
    guardHeader,
    ``,
    `[verify-self-mode]${delta ? ' [verify-delta-mode]' : ''}`,
    ``,
    delta
      ? `이번 검증은 fix loop 재검증이다. Skill Step 1.5(검사)를 다시 실행하고, 통과하면 [verify-delta-mode] 규칙(verifier-mode.md)에 따라 직전 미충족·미확인 AC, Critical, fixSelfCheck.files의 diff를 재검증한다.`
      : ``,
    `Jira task ${taskId}의 verify 단계를 수행하라. ${skillCall('verify')}.`,
    `본 wrapper는 구현과 분리된 새 컨텍스트이고 추가 Agent 권한이 없다 — [verify-self-mode]에 따라 Skill Step 2를 직접 수행한다. 코드를 고치지 않는다.`,
    `Skill Step 1.5의 검사가 코드 문제로 실패하면 Step 2를 건너뛰고 그 결과로 Step 3부터 진행한다. 실행 환경 문제면 result=failed로 반환한다.`,
    ``,
    `verify-metrics 블록 값을 metrics로 반환하라.`,
    `unmet에는 미충족 AC, Critical finding, 실패한 검사를 한 줄씩 넣어라 (예: "AC-02 PAID 주문 취소가 관리자 외에도 허용됨 — src/order/cancel.ts:42"). 통과면 빈 배열.`,
    `prUrl에 PR URL을 넣어라.`,
    `Skill Step 4(review-log 기록)를 빠뜨리지 마라 — 실패해도 계속하지만 생략하지는 않는다.`,
    `Skill Step 5의 PR 본문 "검증" 절 갱신도 빠뜨리지 마라 — 재검증이면 직전 결과를 이번 결과로 바꾼다.`,
    ``,
    returnFooter,
  ].join('\n')
}

// 설계: tasks/sensor-loop-design.md — 루프 안쪽엔 초 단위 computational sensor, 바깥엔 분 단위 판정(verify).
function fixPrompt(unmet) {
  return [
    guardHeader,
    ``,
    `Jira task ${taskId}의 검증 미통과 항목을 고쳐라. 이 세션의 역할은 implementer다 — 테스트 파일은 고칠 수 없다(hook이 막는다).`,
    ``,
    `## A. 시작`,
    `  python3 "${scriptPath('jira-context-update.py')}" ${taskId} - - "${worktreeCtx}" --patch '{"activeRole":"implementer"}'`,
    `수정 대상 (검증 세션이 보고한 것 — 이것만 고친다):`,
    ...unmet.map((u) => `- ${u}`),
    `테스트 자체가 틀렸다고 판단되면 고치지 말고 testDispute에 어느 테스트가 왜 틀렸는지 적고 result=failed로 반환하라.`,
    `억제 주석·분석 제외 설정 추가 금지. 특정 테스트 값만 통과시키는 분기 금지.`,
    ``,
    `## B. Inner sensor loop (최대 5회)`,
    `회차마다: 수정(Edit) → 아래 센서 실행 → 실패 출력을 다음 수정의 입력으로 → 전부 green이면 종료.`,
    `- lint: \`bash ${scriptPath('detect-lint.sh')}\` 출력의 도구만 (NONE이면 skipped), 변경 파일 전체를 배치 1회.`,
    `- typecheck: 프로젝트가 선언한 것만. 없으면 skipped.`,
    `- 이 작업의 테스트(context testWrite.tests)와 관련 테스트만 — 전체 스위트는 재검증이 돈다.`,
    `- 위 센서가 green이고 수정 대상에 "검사 실패:" 줄이 있었으면 마지막에 \`python3 "${scriptPath('verify-checks.py')}" "${worktreePath}"\`를 1회 실행한다(Bash timeout 600000). exit 1이면 출력의 outputTail로 회차를 이어간다 — verify가 같은 명령으로 판정한다.`,
    `5회 안에 green이 안 되면 멈추고 converged=false, 마지막 센서 출력을 sensorSummary(3줄 이내)로 반환하라.`,
    ``,
    `## C. 커밋과 기록 (수렴했을 때)`,
    `바꾼 파일만 add → \`git commit -m "fix(${taskId}): 검증 지적 수정"\` → \`git push\`. 계획과 달라졌으면 plan.md 결정 기록도 같은 커밋에.`,
    `  python3 "${scriptPath('jira-context-update.py')}" ${taskId} "-" "-" "${worktreeCtx}" --patch '{"activeRole":null,"fixSelfCheck":{"iterations":<N>,"files":[<수정 파일>],"lint":{"tool":..,"files":..,"errors":..,"warnings":..},"typecheck":"pass|fail|skipped","relatedTests":"pass|fail|skipped"}}'`,
    `미수렴·testDispute로 끝나도 activeRole은 null로 지운다.`,
    ``,
    returnFooter,
    `- filesEdited에는 수정한 파일 상대경로 목록, innerLoopIterations에는 B의 회차 수를 넣어라.`,
  ].join('\n')
}

let fixAttempts = 0
let innerLoopIterations = 0
let lastMetrics = null

while (!done.has('verify')) {
  const verifyModel = level === 'L1' ? 'sonnet' : 'opus'
  const g = await runStage('verify', verifyModel, verifyPrompt(fixAttempts > 0), 'Verify', VERIFY_SCHEMA)
  if (!g.ok) return abort('verify', g.reason)
  prUrl = g.r.prUrl || prUrl

  const m = g.r.metrics
  lastMetrics = m
  if (g.r.completedStepsAfter.includes('verify')) {
    done.add('verify')
    log('verify 통과 — 리뷰 요청 준비됨')
    break
  }

  // Scope Shortfall Triage — 근거: skills/jira-task-auto/refs/review-wrapper.md
  // 미충족 AC 2건 이상이면서 30% 초과, 또는 Critical ≥ 3 → 단일 fix agent로 못 메우는 scope 누락 → 사용자 위임.
  // (비율만 보면 AC가 1~2개인 작업은 하나만 빠져도 50~100%라 fix loop에 들어가지 못한다 — 드라이런 DEMO-4)
  const unmetRatio = m.acTotal > 0 ? m.acUnmet / m.acTotal : 0
  if ((m.acUnmet >= 2 && unmetRatio > 0.3) || m.criticalCount >= 3) {
    return { status: 'scope_shortfall', metrics: m, unmet: g.r.unmet, fixAttempts, innerLoopIterations, ...base() }
  }

  if (fixAttempts >= 2) {
    return { status: 'fix_exhausted', metrics: m, unmet: g.r.unmet, fixAttempts, innerLoopIterations, ...base() }
  }

  fixAttempts++
  log(`verify 미통과 (시도 ${fixAttempts}/2) — fix sub-agent 위임`)

  const f = await runStage('verify-fix', 'sonnet', fixPrompt(g.r.unmet || []), 'Fix', FIX_SCHEMA)
  if (f.r && f.r.testDispute) {
    return { status: 'test_dispute', testDispute: f.r.testDispute, metrics: m, fixAttempts, innerLoopIterations, ...base() }
  }
  if (!f.ok) return abort('verify-fix', f.reason)
  innerLoopIterations += f.r.innerLoopIterations || 0
  if (!f.r.converged) {
    return {
      status: 'fix_unconverged', metrics: m, fixAttempts, innerLoopIterations,
      sensorSummary: f.r.sensorSummary || null, ...base(),
    }
  }
}

// ---------- 6. 리뷰 요청 준비됨 ----------

return {
  status: 'completed',
  fixAttempts,
  innerLoopIterations,
  metrics: lastMetrics,
  ...base(),
}
