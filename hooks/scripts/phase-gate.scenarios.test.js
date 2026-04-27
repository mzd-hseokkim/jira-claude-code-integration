#!/usr/bin/env node

/**
 * Test scenarios for hooks/scripts/phase-gate.js (MAE-125).
 *
 * Runs phase-gate.js as a child process against isolated tmpdir fixtures
 * and asserts exit code / stdout / stderr.
 *
 * Uses only Node standard library. Run with `npm test` or directly:
 *   node hooks/scripts/phase-gate.test.js
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT_DIR = __dirname;
const PHASE_GATE = path.join(SCRIPT_DIR, 'phase-gate.js');

function runGate(payload, { cwd, env } = {}) {
  const r = spawnSync('node', [PHASE_GATE], {
    cwd,
    env: { ...process.env, ...(env || {}) },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function makeFixture({ taskId, completedSteps, artifacts = [], extraContext = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gate-test-'));
  if (taskId !== undefined || completedSteps !== undefined || Object.keys(extraContext).length > 0) {
    const ctx = { ...extraContext };
    if (taskId !== undefined) ctx.taskId = taskId;
    if (completedSteps !== undefined) ctx.completedSteps = completedSteps;
    fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify(ctx));
  }
  for (const rel of artifacts) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '');
  }
  return { dir };
}

function cleanupFixture(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function isolatedTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-gate-isolated-'));
  let cur = dir;
  for (let i = 0; i <= 32; i++) {
    if (fs.existsSync(path.join(cur, '.jira-context.json'))) {
      cleanupFixture(dir);
      const err = new Error(`unexpected .jira-context.json in parent chain at ${cur}`);
      err.isolation = true;
      throw err;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return dir;
}

function isBypassImplemented() {
  try {
    const src = fs.readFileSync(PHASE_GATE, 'utf8');
    return /JIRA_PHASE_GATE_BYPASS|bypassGate/.test(src);
  } catch {
    return false;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function preview(s) {
  if (!s) return '<empty>';
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

const results = [];

function runScenario(name, fn, { skipIf } = {}) {
  if (skipIf) {
    const reason = skipIf();
    if (reason) {
      results.push({ name, outcome: 'skip', reason });
      console.log(`⊘ ${name}  (skip: ${reason})`);
      return;
    }
  }
  try {
    fn();
    results.push({ name, outcome: 'pass' });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, outcome: 'fail', reason: e && e.message });
    console.log(`✗ ${name}\n    ${e && e.message}`);
  }
}

const IMPL_PAYLOAD = (taskId) => ({
  tool_name: 'Skill',
  tool_input: { skill: 'jira-integration:jira-task-impl', args: taskId },
});

const INIT_PAYLOAD = () => ({
  tool_name: 'Skill',
  tool_input: { skill: 'jira-integration:jira-task-init', args: '' },
});

// Scenario 1 — design 없이 impl 호출 → 차단
runScenario('1. block: impl without design', () => {
  const fx = makeFixture({
    taskId: 'TEST-1',
    completedSteps: ['init', 'start', 'plan'],
    artifacts: ['docs/plan/TEST-1.plan.md'],
  });
  try {
    const r = runGate(IMPL_PAYLOAD('TEST-1'), { cwd: fx.dir });
    assert(r.status === 2, `expected exit 2, got ${r.status}; stderr=${preview(r.stderr)}`);
    assert(r.stderr.includes('design'), `stderr should mention 'design'; got=${preview(r.stderr)}`);
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch {
      throw new Error(`stdout not JSON: ${preview(r.stdout)}`);
    }
    const decision = parsed && parsed.hookSpecificOutput && parsed.hookSpecificOutput.permissionDecision;
    assert(decision === 'deny', `expected permissionDecision=deny, got ${decision}`);
  } finally {
    cleanupFixture(fx.dir);
  }
});

// Scenario 2 — 정상 순서 호출 → 통과
runScenario('2. pass: impl with design satisfied', () => {
  const fx = makeFixture({
    taskId: 'TEST-2',
    completedSteps: ['init', 'start', 'plan', 'design'],
    artifacts: ['docs/plan/TEST-2.plan.md', 'docs/design/TEST-2.design.md'],
  });
  try {
    const r = runGate(IMPL_PAYLOAD('TEST-2'), { cwd: fx.dir });
    assert(r.status === 0, `expected exit 0, got ${r.status}; stderr=${preview(r.stderr)}`);
    assert(r.stderr === '', `expected empty stderr, got=${preview(r.stderr)}`);
    assert(r.stdout === '', `expected empty stdout, got=${preview(r.stdout)}`);
  } finally {
    cleanupFixture(fx.dir);
  }
});

const bypassSkip = () => (isBypassImplemented() ? null : 'bypass not implemented (MAE-124)');

// Scenario 3a — env bypass
runScenario(
  '3a. bypass via JIRA_PHASE_GATE_BYPASS=1',
  () => {
    const fx = makeFixture({
      taskId: 'TEST-3',
      completedSteps: ['init', 'start', 'plan'],
      artifacts: ['docs/plan/TEST-3.plan.md'],
    });
    try {
      const r = runGate(IMPL_PAYLOAD('TEST-3'), { cwd: fx.dir, env: { JIRA_PHASE_GATE_BYPASS: '1' } });
      assert(r.status === 0, `expected exit 0 (bypass), got ${r.status}; stderr=${preview(r.stderr)}`);
    } finally {
      cleanupFixture(fx.dir);
    }
  },
  { skipIf: bypassSkip }
);

// Scenario 3b — context flag bypass
runScenario(
  '3b. bypass via context flag bypassGate',
  () => {
    const fx = makeFixture({
      taskId: 'TEST-3b',
      completedSteps: ['init', 'start', 'plan'],
      artifacts: ['docs/plan/TEST-3b.plan.md'],
      extraContext: { bypassGate: true },
    });
    try {
      const r = runGate(IMPL_PAYLOAD('TEST-3b'), { cwd: fx.dir });
      assert(r.status === 0, `expected exit 0 (bypass), got ${r.status}; stderr=${preview(r.stderr)}`);
    } finally {
      cleanupFixture(fx.dir);
    }
  },
  { skipIf: bypassSkip }
);

// Scenario 4 — 컨텍스트 없음 → 통과 (graceful skip)
runScenario(
  '4. no context: graceful pass',
  () => {
    let dir;
    try {
      dir = isolatedTmpDir();
    } catch (e) {
      if (e && e.isolation) {
        const err = new Error(e.message);
        err.skip = true;
        throw err;
      }
      throw e;
    }
    try {
      const r = runGate(INIT_PAYLOAD(), { cwd: dir });
      assert(r.status === 0, `expected exit 0, got ${r.status}; stderr=${preview(r.stderr)}`);
      assert(r.stderr === '', `expected empty stderr, got=${preview(r.stderr)}`);
      assert(r.stdout === '', `expected empty stdout, got=${preview(r.stdout)}`);
    } finally {
      cleanupFixture(dir);
    }
  }
);

const pass = results.filter((r) => r.outcome === 'pass').length;
const fail = results.filter((r) => r.outcome === 'fail').length;
const skip = results.filter((r) => r.outcome === 'skip').length;

console.log(`\n총 ${results.length}개 중 ${pass} 통과, ${fail} 실패, ${skip} 스킵`);

process.exit(fail > 0 ? 1 : 0);
