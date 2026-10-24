const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(script, input, env = {}) {
  const e = { ...process.env, ...env };
  if (!('AGENT_ROLE' in env)) delete e.AGENT_ROLE;
  const p = spawnSync(process.execPath, [path.join(__dirname, script)], { input: JSON.stringify(input), env: e, encoding: 'utf8' });
  return p.stdout ? JSON.parse(p.stdout).hookSpecificOutput.permissionDecision : 'allow';
}

function workdir(role) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  if (role) fs.writeFileSync(path.join(d, '.jira-context.json'), JSON.stringify({ activeRole: role }));
  return d;
}

const bash = (command, cwd) => ({ tool_name: 'Bash', tool_input: { command }, cwd });
const edit = (file_path, cwd) => ({ tool_name: 'Edit', tool_input: { file_path }, cwd });

// ─── guard-approval ──────────────────────────────────────────────────────

test('A1: gh pr comment에 승인 토큰 → deny', () => {
  assert.equal(run('guard-approval.js', bash('gh pr comment 7 --body "APPROVE plan 3f1b7d5"')), 'deny');
});

test('A2: SHA 자리를 비운 안내 → allow', () => {
  assert.equal(run('guard-approval.js', bash('gh pr comment 7 --body "APPROVE plan <SHA> (SHA = 3f1b7d5)"')), 'allow');
});

test('A3: gh pr review --approve → deny', () => {
  assert.equal(run('guard-approval.js', bash('gh pr review 7 --approve')), 'deny');
});

test('A4: body-file 안의 토큰 → deny', () => {
  const d = workdir();
  fs.writeFileSync(path.join(d, 'c.md'), '검토함\nAPPROVE spec abcdef0\n');
  assert.equal(run('guard-approval.js', bash('gh pr comment 7 --body-file c.md', d)), 'deny');
});

test('A5: gh·curl이 아닌 명령은 판정하지 않음', () => {
  assert.equal(run('guard-approval.js', bash('grep "APPROVE plan 3f1b7d5" tests/x.py')), 'allow');
});

// ─── guard-test-files ────────────────────────────────────────────────────

test('T1: implementer가 테스트 파일 Edit → deny', () => {
  const d = workdir('implementer');
  assert.equal(run('guard-test-files.js', edit(path.join(d, 'src/order.test.ts'), d)), 'deny');
  assert.equal(run('guard-test-files.js', edit(path.join(d, 'tests/test_order.py'), d)), 'deny');
});

test('T2: implementer가 운영 코드·spec.md Edit → allow', () => {
  const d = workdir('implementer');
  assert.equal(run('guard-test-files.js', edit(path.join(d, 'src/order.ts'), d)), 'allow');
  assert.equal(run('guard-test-files.js', edit(path.join(d, 'work/K-1/spec.md'), d)), 'allow');
});

test('T3: implementer가 Bash 리다이렉트로 테스트 파일 쓰기 → deny', () => {
  const d = workdir('implementer');
  assert.equal(run('guard-test-files.js', bash('echo x >> src/__tests__/a.js', d)), 'deny');
  assert.equal(run('guard-test-files.js', bash("sed -i 's/a/b/' tests/test_x.py", d)), 'deny');
  assert.equal(run('guard-test-files.js', bash('npm test > /tmp/out.log 2>&1', d)), 'allow');
});

test('T4: verifier는 evidence만 쓸 수 있음', () => {
  const d = workdir('verifier');
  assert.equal(run('guard-test-files.js', edit(path.join(d, 'src/order.ts'), d)), 'deny');
  assert.equal(run('guard-test-files.js', edit(path.join(d, 'work/K-1/evidence/verification.md'), d)), 'allow');
  assert.equal(run('guard-test-files.js', bash('npm test 2>&1 | tee work/K-1/evidence/test.log', d)), 'allow');
});

test('T5: test-writer와 역할 없음 → allow', () => {
  assert.equal(run('guard-test-files.js', edit('tests/test_x.py', workdir('test-writer'))), 'allow');
  assert.equal(run('guard-test-files.js', edit('tests/test_x.py', workdir())), 'allow');
});

test('T6: AGENT_ROLE 환경변수가 파일보다 우선', () => {
  const d = workdir('implementer');
  assert.equal(run('guard-test-files.js', edit(path.join(d, 'tests/test_x.py'), d), { AGENT_ROLE: 'test-writer' }), 'allow');
});

test('T7: Codex apply_patch는 패치 헤더의 경로로 판정', () => {
  const patch = (body, cwd) => ({ tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n${body}\n*** End Patch` }, cwd });
  const d = workdir('implementer');
  assert.equal(run('guard-test-files.js', patch('*** Update File: tests/test_x.py\n@@\n-a\n+b', d)), 'deny');
  assert.equal(run('guard-test-files.js', patch(`*** Add File: ${path.join(d, 'src', 'a.test.ts')}\n+x`, d)), 'deny');
  assert.equal(run('guard-test-files.js', patch('*** Update File: src/a.ts\n*** Move to: tests/test_a.py', d)), 'deny');
  assert.equal(run('guard-test-files.js', patch('*** Update File: src/order.py\n@@\n-a\n+b', d)), 'allow');
  const v = workdir('verifier');
  assert.equal(run('guard-test-files.js', patch('*** Add File: work/K-1/evidence/verification.md\n+x', v)), 'allow');
  assert.equal(run('guard-test-files.js', patch('*** Update File: src/order.py\n@@\n-a\n+b', v)), 'deny');
});

test('T8: 저장소 밖 임시 파일(PR 본문)은 어떤 도구로든 판정하지 않음', () => {
  const v = workdir('verifier');
  const tmp = path.join(os.tmpdir(), 'pr-body-K-1.md');
  assert.equal(run('guard-test-files.js', edit(tmp, v)), 'allow');
  assert.equal(run('guard-test-files.js', { tool_name: 'apply_patch', tool_input: { command: `*** Begin Patch\n*** Add File: ${tmp}\n+x\n*** End Patch` }, cwd: v }), 'allow');
  const i = workdir('implementer');
  assert.equal(run('guard-test-files.js', edit(path.join(os.tmpdir(), 'tests', 'test_x.py'), i)), 'allow');
});

// ─── guard-worktree-remove ───────────────────────────────────────────────

// process.platform을 바꿔 hook을 실행한다 (-r preload).
function runOn(platform, script, input) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-platform-'));
  const preload = path.join(d, 'platform.js');
  fs.writeFileSync(preload, `Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });\n`);
  const p = spawnSync(process.execPath, ['-r', preload, path.join(__dirname, script)], { input: JSON.stringify(input), encoding: 'utf8' });
  return p.stdout ? JSON.parse(p.stdout).hookSpecificOutput.permissionDecision : 'allow';
}

test('W1: Windows에서 git worktree remove → deny', () => {
  assert.equal(runOn('win32', 'guard-worktree-remove.js', bash('git worktree remove ../wt')), 'deny');
  assert.equal(runOn('win32', 'guard-worktree-remove.js', { tool_name: 'PowerShell', tool_input: { command: 'git -C C:\\repo worktree remove --force ..\\wt' } }), 'deny');
});

test('W2: macOS·Linux에서는 링크를 따라가지 않으므로 allow', () => {
  assert.equal(runOn('darwin', 'guard-worktree-remove.js', bash('git worktree remove ../wt')), 'allow');
  assert.equal(runOn('linux', 'guard-worktree-remove.js', bash('git worktree remove --force ../wt')), 'allow');
});

test('W3: worktree remove가 아닌 git 명령은 Windows에서도 allow', () => {
  assert.equal(runOn('win32', 'guard-worktree-remove.js', bash('git worktree list')), 'allow');
});
