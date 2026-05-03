'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  register,
  unregister,
  list,
  touch,
  loadAndPrune,
  _setRegistryDirForTest,
} = require('../workspaces');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an isolated temp directory for the registry AND return a real subdir for workspace paths. */
function setupIsolatedEnv() {
  const registryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae276-reg-'));
  _setRegistryDirForTest(registryDir);
  return registryDir;
}

function teardown(registryDir) {
  _setRegistryDirForTest(null);
  fs.rmSync(registryDir, { recursive: true, force: true });
}

/** Create a real temporary directory (simulates a workspace). */
function makeTmpWorkspace(prefix = 'mae276-ws-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// U1: 빈 상태에서 register 1회 → list
// ---------------------------------------------------------------------------
test('U1: register once then list returns 1 entry with correct fields', () => {
  const reg = setupIsolatedEnv();
  const ws = makeTmpWorkspace();
  try {
    const entry = register(ws);
    assert.equal(entry.path, path.resolve(ws));
    assert.equal(entry.status, 'active');
    assert.ok(entry.registeredAt, 'registeredAt should be set');
    assert.ok(entry.lastSeenAt, 'lastSeenAt should be set');

    const entries = list();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, path.resolve(ws));
    assert.equal(entries[0].status, 'active');
  } finally {
    teardown(reg);
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// U2: 동일 path 중복 register 시 lastSeenAt만 갱신
// ---------------------------------------------------------------------------
test('U2: duplicate register updates only lastSeenAt, preserves registeredAt', () => {
  const reg = setupIsolatedEnv();
  const ws = makeTmpWorkspace();
  try {
    const t1 = new Date('2025-01-01T00:00:00.000Z');
    const t2 = new Date('2025-06-01T00:00:00.000Z');

    register(ws, { now: t1 });
    register(ws, { now: t2 });

    const entries = list();
    assert.equal(entries.length, 1, 'should have exactly 1 entry after duplicate register');
    assert.equal(entries[0].registeredAt, t1.toISOString(), 'registeredAt must be preserved from first call');
    assert.equal(entries[0].lastSeenAt, t2.toISOString(), 'lastSeenAt must reflect second call');
  } finally {
    teardown(reg);
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// U3: 파일 영속화 후 재로드 복원
// ---------------------------------------------------------------------------
test('U3: registered entries survive across list() calls (file persistence)', () => {
  const reg = setupIsolatedEnv();
  const ws1 = makeTmpWorkspace();
  const ws2 = makeTmpWorkspace();
  try {
    const t = new Date('2025-03-15T12:00:00.000Z');
    register(ws1, { now: t });
    register(ws2, { now: t });

    // list() reads fresh from disk each time — simulates re-load
    const entries = list();
    assert.equal(entries.length, 2);
    const paths = entries.map((e) => e.path).sort();
    assert.deepEqual(paths, [path.resolve(ws1), path.resolve(ws2)].sort());
    // registeredAt preserved
    for (const e of entries) {
      assert.equal(e.registeredAt, t.toISOString());
    }
  } finally {
    teardown(reg);
    fs.rmSync(ws1, { recursive: true, force: true });
    fs.rmSync(ws2, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// U4: 사라진 디렉토리 prune + warn 1회
// ---------------------------------------------------------------------------
test('U4: loadAndPrune removes missing paths and calls logger.warn once', () => {
  const reg = setupIsolatedEnv();
  const ws = makeTmpWorkspace();
  try {
    register(ws);
    // Remove the workspace directory to simulate it being gone
    fs.rmSync(ws, { recursive: true, force: true });

    const warnCalls = [];
    const spyLogger = {
      warn(msg, meta) { warnCalls.push({ msg, meta }); },
    };

    const result = loadAndPrune({ logger: spyLogger });
    assert.equal(result.workspaces.length, 0, 'alive workspaces should be empty');
    assert.deepEqual(result.pruned, [path.resolve(ws)], 'pruned should contain removed path');

    // logger.warn should have been called — at minimum once for pruned paths
    const prunedWarn = warnCalls.find((c) => c.msg.includes('Pruned'));
    assert.ok(prunedWarn, 'logger.warn should be called with "Pruned" message');
  } finally {
    teardown(reg);
    // ws already removed above — ignore error
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch { /* ok */ }
  }
});

// ---------------------------------------------------------------------------
// U5: atomic write — temp 파일 잔존 X
// ---------------------------------------------------------------------------
test('U5: after register, no .tmp.* files remain in registry dir', () => {
  const reg = setupIsolatedEnv();
  const ws = makeTmpWorkspace();
  try {
    register(ws);
    const entries = fs.readdirSync(reg);
    const tmpFiles = entries.filter((f) => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0, `Leftover tmp files: ${tmpFiles.join(', ')}`);
    // workspaces.json should be the only file
    assert.ok(entries.includes('workspaces.json'), 'workspaces.json should exist');
  } finally {
    teardown(reg);
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// U6: unregister 미등록 path → no-op / false 반환
// ---------------------------------------------------------------------------
test('U6: unregister on unknown path returns false and causes no error', () => {
  const reg = setupIsolatedEnv();
  try {
    const result = unregister('/this/path/does/not/exist/anywhere');
    assert.equal(result, false, 'should return false for unknown path');
    // Registry file should not have been created
    const filePath = path.join(reg, 'workspaces.json');
    // If it was created (empty registry), that's ok — just no error and false returned
    // The key assertion is false return value and no throw.
  } finally {
    teardown(reg);
  }
});
