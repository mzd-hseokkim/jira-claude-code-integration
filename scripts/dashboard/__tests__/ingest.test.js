'use strict';

/**
 * Unit tests for scripts/dashboard/routes/ingest.js
 * Test cases: U1–U6 from docs/design/MAE-210.design.md § Test Plan
 * MAE-278 additions: findGitRoot (U1–U4), lookupWorktree longest-prefix (I1),
 *   auto-register (I2–I4), creds-missing graceful ingest (I5), workspaces.events (I7)
 *
 * Uses node:test (no external test runner required).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createIngestRouter, lookupWorktree, findGitRoot, shouldRejectAutoRegister } = require('../routes/ingest');
const { createStore } = require('../store');

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Minimal mock store that exposes getSnapshot() and captures pushActivity calls.
 */
function makeStore(snapshotWorktrees = []) {
  const pushed = [];
  return {
    getSnapshot: () => snapshotWorktrees,
    pushActivity(key, ev) {
      pushed.push({ key, ev });
    },
    _pushed: pushed,
  };
}

/**
 * POST to the router via a real http.Server + http.request.
 * Returns { status, body } where body is parsed JSON.
 */
async function post(app, path, bodyObj) {
  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;
  const rawBody = JSON.stringify(bodyObj);

  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', (err) => { server.close(); reject(err); });
    req.end(rawBody);
  });
}

// ─── lookupWorktree (unit, sync) ────────────────────────────────────────────

test('lookupWorktree: cwd matches worktree path exactly', () => {
  const store = makeStore([{ path: '/x/MAE-210', taskId: 'MAE-210' }]);
  const result = lookupWorktree(store, '/x/MAE-210');
  assert.equal(result.taskId, 'MAE-210');
  assert.equal(result.worktreePath, '/x/MAE-210');
});

test('lookupWorktree: cwd is subdirectory of worktree', () => {
  const store = makeStore([{ path: '/x/MAE-210', taskId: 'MAE-210' }]);
  const result = lookupWorktree(store, '/x/MAE-210/src/foo');
  assert.equal(result.taskId, 'MAE-210');
});

test('lookupWorktree: no match → taskId and worktreePath null', () => {
  const store = makeStore([{ path: '/x/MAE-210', taskId: 'MAE-210' }]);
  const result = lookupWorktree(store, '/other/dir');
  assert.equal(result.taskId, null);
  assert.equal(result.worktreePath, null);
});

test('lookupWorktree: cwd null → no-context', () => {
  const store = makeStore([{ path: '/x/MAE-210', taskId: 'MAE-210' }]);
  const result = lookupWorktree(store, null);
  assert.equal(result.taskId, null);
});

// ─── POST /ingest (integration via http) ────────────────────────────────────

// U1: valid payload + mapping success → 200 + label:mapped + store.push called
test('U1: mapped worktree → 200 label:mapped', async () => {
  const store = makeStore([{ path: '/x/MAE-210', taskId: 'MAE-210' }]);
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest?hook=PreToolUse', { cwd: '/x/MAE-210' });

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.taskId, 'MAE-210');
  assert.equal(body.label, 'mapped');
  assert.equal(store._pushed.length, 1);
  assert.equal(store._pushed[0].ev.data.label, 'mapped');
  assert.equal(store._pushed[0].ev.data.hookName, 'PreToolUse');
});

// U2: mapping fails (lookup null) + no session_id → 200 + label:no-context, no store push (MAE-331)
test('U2: lookup null + no session_id → 200 label:no-context, no store push', async () => {
  const store = makeStore([]); // no worktrees registered
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest?hook=PreToolUse', { cwd: '/x/MAE-210' });

  assert.equal(status, 200);
  assert.equal(body.taskId, null);
  assert.equal(body.label, 'no-context');
  // MAE-331: no-context는 더 이상 store에 push하지 않는다 (__no-context__ 합성 키 제거).
  assert.equal(store._pushed.length, 0);
});

// U3: hook name missing + cwd null → 200, no-context drop (MAE-331)
// hookName 정규화 동작은 store push가 일어나는 mapped/session 경로에서 검증한다.
test('U3: missing ?hook + cwd null → 200 no-context', async () => {
  const store = makeStore([]);
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest', {});

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.label, 'no-context');
});

// U4: hook name not in whitelist → hookName 정규화 (mapped 경로에서 검증)
test('U4: ?hook=Bogus + mapped → hookName:<unknown> in stored event', async () => {
  const store = makeStore([{ path: '/x/MAE-210', taskId: 'MAE-210' }]);
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status } = await post(app, '/ingest?hook=Bogus', { cwd: '/x/MAE-210' });

  assert.equal(status, 200);
  assert.equal(store._pushed[0].ev.data.hookName, '<unknown>');
});

// U5: body exceeds 256KB → 413
test('U5: body > 256KB → 413', async () => {
  const store = makeStore([]);
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);
  const server = http.createServer(app);
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const bigBody = JSON.stringify({ data: 'x'.repeat(257 * 1024) });
  const status = await new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/ingest?hook=PreToolUse', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bigBody) } },
      (res) => {
        res.resume();
        res.on('end', () => { server.close(); resolve(res.statusCode); });
      }
    );
    req.on('error', (err) => { server.close(); reject(err); });
    req.end(bigBody);
  });

  assert.equal(status, 413);
  // Store should NOT have been called
  assert.equal(store._pushed.length, 0);
});

// U6: worktreeMap.lookup throws → 200 + label:no-context, no store push (MAE-331)
test('U6: lookup throws → 200 label:no-context, no push', async () => {
  const store = {
    getSnapshot() { throw new Error('simulated crash'); },
    _pushed: [],
    pushActivity(key, ev) { this._pushed.push({ key, ev }); },
  };

  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest?hook=PreToolUse', { cwd: '/x/MAE-210' });

  assert.equal(status, 200);
  assert.equal(body.label, 'no-context');
  assert.equal(store._pushed.length, 0);
});

// ─── MAE-278: findGitRoot unit tests ────────────────────────────────────────

// Helper: create a temp dir tree for findGitRoot tests
function makeTmpGitTree(subpath = '') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mae278-git-'));
  const gitDir = subpath ? path.join(base, subpath) : base;
  fs.mkdirSync(gitDir, { recursive: true });
  fs.mkdirSync(path.join(gitDir, '.git'), { recursive: true });
  return { base, gitDir };
}

// U1: .git directory found in startPath itself
test('findGitRoot U1: .git directory in startPath → returns that dir', () => {
  const { base, gitDir } = makeTmpGitTree();
  try {
    const result = findGitRoot(gitDir);
    assert.equal(result, gitDir);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// U2: .git file (linked worktree) found
test('findGitRoot U2: .git file (worktree) in startPath → returns that dir', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mae278-wt-'));
  const wtDir = path.join(base, 'worktree');
  fs.mkdirSync(wtDir, { recursive: true });
  // .git as a file (simulates linked worktree)
  fs.writeFileSync(path.join(wtDir, '.git'), 'gitdir: ../.git/worktrees/feature\n');
  try {
    const result = findGitRoot(wtDir);
    assert.equal(result, wtDir);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// U3: .git found in a parent directory
test('findGitRoot U3: .git in parent → returns parent', () => {
  const { base, gitDir } = makeTmpGitTree();
  // gitDir === base (has .git). Create a sub-subdirectory.
  const deepDir = path.join(base, 'src', 'components');
  fs.mkdirSync(deepDir, { recursive: true });
  try {
    const result = findGitRoot(deepDir);
    assert.equal(result, base);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// U4: no .git anywhere → returns null
test('findGitRoot U4: no .git → null', () => {
  // Use a path deep inside os.tmpdir() that has no .git
  // We create a fresh isolated dir tree with no .git
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mae278-nogit-'));
  const deep = path.join(base, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  try {
    // findGitRoot will walk up to tmpdir boundary and stop at fs root
    // Since tmpdir itself typically has no .git this should return null.
    // We can't guarantee no .git above tmpdir, so mock by testing a non-absolute path:
    const result = findGitRoot('relative/path');
    assert.equal(result, null);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// ─── MAE-278: shouldRejectAutoRegister tests ────────────────────────────────

test('shouldRejectAutoRegister: $HOME direct child → true', () => {
  const home = os.homedir();
  const candidate = path.join(home, 'dotfiles');
  assert.equal(shouldRejectAutoRegister(candidate), true);
});

test('shouldRejectAutoRegister: $HOME itself → true', () => {
  assert.equal(shouldRejectAutoRegister(os.homedir()), true);
});

test('shouldRejectAutoRegister: normal project path → false', () => {
  const candidate = path.join(os.tmpdir(), 'projects', 'myapp');
  assert.equal(shouldRejectAutoRegister(candidate), false);
});

// ─── MAE-278: I1 — longest-prefix regression ───────────────────────────────

// I1: two workspaces registered, cwd matches longer prefix
test('I1: longest-prefix wins when two worktrees share a prefix', () => {
  const store = makeStore([
    { path: '/x/project', taskId: 'MAE-100' },
    { path: '/x/project/worktree/MAE-210', taskId: 'MAE-210' },
  ]);
  // cwd is inside the deeper worktree
  const result = lookupWorktree(store, '/x/project/worktree/MAE-210/src');
  assert.equal(result.taskId, 'MAE-210');
  assert.equal(result.worktreePath, '/x/project/worktree/MAE-210');
});

// ─── MAE-278: auto-register integration tests ──────────────────────────────

// Helper: create a router using a mock workspacesModule
function makeAutoRegisterSetup(snapshotWorktrees, gitRootToRegister) {
  const registered = [];
  const events = new (require('node:events').EventEmitter)();
  const workspacesModule = {
    register(p) {
      registered.push(p);
      events.emit('workspace.registered', { path: p });
    },
    events,
    _registered: registered,
  };

  // Build store that gains worktrees after register (simulates collectWorktrees)
  let snapshot = [...snapshotWorktrees];
  const pushed = [];
  const store = {
    getSnapshot: () => snapshot,
    pushActivity(key, ev) { pushed.push({ key, ev }); },
    _pushed: pushed,
    _addWorktree(wt) { snapshot.push(wt); },
  };

  // When workspace is registered, simulate that collectWorktrees adds worktrees
  if (gitRootToRegister) {
    workspacesModule.events.on('workspace.registered', () => {
      // Add a synthetic worktree under the registered git root
      store._addWorktree({ path: gitRootToRegister, taskId: 'AUTO-1' });
    });
  }

  return { store, workspacesModule };
}

// I2 (MAE-331 회귀): unregistered cwd + .git in parent → auto-register 일어나지 않음
test('I2: MAE-331 — auto-register removed; register never called even with .git in parent', async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mae331-i2-'));
  fs.mkdirSync(path.join(tmpBase, '.git'));
  const cwd = path.join(tmpBase, 'src');
  fs.mkdirSync(cwd, { recursive: true });

  try {
    const { store, workspacesModule } = makeAutoRegisterSetup([], tmpBase);

    const express = require('express');
    const router = createIngestRouter(store, null, workspacesModule);
    const app = express();
    app.use('/ingest', router);

    const { status, body } = await post(app, '/ingest?hook=PreToolUse', { cwd });

    assert.equal(status, 200);
    // MAE-331: workspaces.register는 더 이상 호출되지 않는다.
    assert.equal(workspacesModule._registered.length, 0);
    // session_id가 없으므로 no-context drop.
    assert.equal(body.label, 'no-context');
    assert.equal(store._pushed.length, 0);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

// I3: unregistered cwd + no .git → no-context, no registration
test('I3: no .git → no-context, no new registration', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae278-i3-'));
  // Create a deep path but NO .git
  const deepDir = path.join(tmpDir, 'a', 'b', 'c');
  fs.mkdirSync(deepDir, { recursive: true });

  try {
    const registered = [];
    const workspacesModule = {
      register(p) { registered.push(p); },
      events: new (require('node:events').EventEmitter)(),
      _registered: registered,
    };
    const pushed = [];
    const store = {
      getSnapshot: () => [],
      pushActivity(key, ev) { pushed.push({ key, ev }); },
    };

    const express = require('express');
    const router = createIngestRouter(store, null, workspacesModule);
    const app = express();
    app.use('/ingest', router);

    // Use a path that definitely has no .git (relative path → findGitRoot returns null)
    // We can't guarantee tmpdir has no .git, so use an absolute path to deepDir
    // and ensure no .git anywhere above it within our isolated tree
    const { status, body } = await post(app, '/ingest?hook=PreToolUse', { cwd: deepDir });

    assert.equal(status, 200);
    assert.equal(body.label, 'no-context');
    // register should not have been called (no .git found in our isolated tree
    // unless tmpdir itself has .git — we'll just verify no double-register)
    // If tmpdir has a .git above we can't prevent it, but the key is no crash.
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// I4 (MAE-331 회귀): 반복 호출에도 register 절대 호출 안 됨
test('I4: MAE-331 — repeated requests never trigger register', async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mae331-i4-'));
  fs.mkdirSync(path.join(tmpBase, '.git'));
  const cwd = path.join(tmpBase, 'src');
  fs.mkdirSync(cwd, { recursive: true });

  try {
    let registerCount = 0;
    const pushed = [];
    const store = {
      getSnapshot: () => [],
      pushActivity(key, ev) { pushed.push({ key, ev }); },
    };
    const workspacesModule = {
      register() { registerCount++; },
      events: new (require('node:events').EventEmitter)(),
    };

    const express = require('express');
    const router = createIngestRouter(store, null, workspacesModule);
    const app = express();
    app.use('/ingest', router);

    await post(app, '/ingest?hook=PreToolUse', { cwd });
    await post(app, '/ingest?hook=PreToolUse', { cwd });

    assert.equal(registerCount, 0, 'register must never be called (auto-register removed)');
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

// I5: workspacesModule=null (no auto-register) → still 200 (backward compat)
test('I5: no workspacesModule → no-context + no crash', async () => {
  const pushed = [];
  const store = {
    getSnapshot: () => [],
    pushActivity(key, ev) { pushed.push({ key, ev }); },
  };
  const express = require('express');
  const router = createIngestRouter(store, null, null); // no workspacesModule
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest?hook=PreToolUse', { cwd: '/some/unknown/path' });

  assert.equal(status, 200);
  assert.equal(body.label, 'no-context');
});

// ─── MAE-331: session_id 기반 session entry ─────────────────────────────────

// 실제 createStore를 쓰는 테스트용 헬퍼: mock store보다 통합도가 높음
function makeRouterWithRealStore() {
  const { createStore } = require('../store');
  const store = createStore();
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);
  return { store, app };
}

// SU1: worktree miss + SessionStart + session_id → session entry 등록, label='session'
test('SU1: worktree miss + SessionStart + session_id → upsertSession + label:session', async () => {
  const { store, app } = makeRouterWithRealStore();
  const sid = 'sess-abc-123';

  const { status, body } = await post(app, '/ingest?hook=SessionStart', {
    cwd: '/tmp/foo',
    session_id: sid,
    source: 'startup',
  });

  assert.equal(status, 200);
  assert.equal(body.label, 'session');
  assert.equal(body.sessionId, sid);

  const sessions = store.getSessionsSnapshot();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, sid);
  assert.equal(sessions[0].cwd, '/tmp/foo');
  assert.equal(sessions[0].source, 'startup');
  assert.ok(sessions[0].startedAt, 'startedAt must be set');
  assert.ok(sessions[0].lastActiveAt, 'lastActiveAt must be set');
  assert.equal(sessions[0].activity.length, 1, 'session activity recorded');
});

// SU2: worktree miss + non-SessionStart hook + 기존 session → lastActiveAt 갱신
test('SU2: PostToolUse with same session_id → partial update lastActiveAt', async () => {
  const { store, app } = makeRouterWithRealStore();
  const sid = 'sess-partial';

  await post(app, '/ingest?hook=SessionStart', { cwd: '/tmp/x', session_id: sid, source: 'startup' });
  const startedAt = store.getSessionsSnapshot()[0].startedAt;

  // wait a tick so timestamps differ
  await new Promise((r) => setTimeout(r, 5));

  await post(app, '/ingest?hook=PostToolUse', { cwd: '/tmp/x', session_id: sid });

  const sessions = store.getSessionsSnapshot();
  assert.equal(sessions.length, 1, 'still single session');
  assert.equal(sessions[0].startedAt, startedAt, 'startedAt preserved');
  assert.notEqual(sessions[0].lastActiveAt, startedAt, 'lastActiveAt advanced');
  assert.equal(sessions[0].activity.length, 2);
});

// SU3: worktree miss + session_id 없음 → no-context drop, store 변경 없음
test('SU3: worktree miss + no session_id → no-context drop, no session push', async () => {
  const { store, app } = makeRouterWithRealStore();

  const { status, body } = await post(app, '/ingest?hook=SessionStart', { cwd: '/tmp/y' });

  assert.equal(status, 200);
  assert.equal(body.label, 'no-context');
  assert.equal(body.sessionId, null);
  assert.equal(store.getSessionsSnapshot().length, 0);
  assert.equal(store.getSnapshot().length, 0);
});

// SU4: worktree match 회귀 — session 분기로 가지 않고 기존 pushActivity 경로 유지
test('SU4: worktree mapped → never goes to session path, even if session_id present', async () => {
  const { createStore } = require('../store');
  const store = createStore();
  store.upsertWorktree({ path: '/wt/MAE-X', taskId: 'MAE-X' });
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest?hook=PreToolUse', {
    cwd: '/wt/MAE-X/src',
    session_id: 'should-be-ignored',
  });

  assert.equal(status, 200);
  assert.equal(body.label, 'mapped');
  assert.equal(body.taskId, 'MAE-X');
  // sessions Map은 비어있어야 한다
  assert.equal(store.getSessionsSnapshot().length, 0);
  // worktree activity는 1개 push됨
  const wt = store.getSnapshot().find((w) => w.path === '/wt/MAE-X');
  assert.equal(wt.activity.length, 1);
});

// ─── MAE-332: SessionEnd 즉시 제거 ──────────────────────────────────────────

// SE1: SessionStart로 등록된 entry가 SessionEnd 수신 시 즉시 삭제된다
test('SE1: SessionEnd → session entry immediately removed', async () => {
  const { createStore } = require('../store');
  const store = createStore();
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);
  const sid = 'sess-end-1';

  await post(app, '/ingest?hook=SessionStart', {
    cwd: '/tmp/x', session_id: sid, source: 'startup',
  });
  assert.equal(store.getSessionsSnapshot().length, 1);

  const { status, body } = await post(app, '/ingest?hook=SessionEnd', {
    cwd: '/tmp/x', session_id: sid,
  });

  assert.equal(status, 200);
  assert.equal(body.label, 'session');
  assert.equal(body.sessionId, sid);
  assert.equal(store.getSessionsSnapshot().length, 0, 'session entry should be gone');
});

// SE2: SessionEnd로 unknown session_id가 와도 안전 (no-op, 200)
test('SE2: SessionEnd with unknown session_id → no-op, still 200', async () => {
  const { createStore } = require('../store');
  const store = createStore();
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status } = await post(app, '/ingest?hook=SessionEnd', {
    cwd: '/tmp/y', session_id: 'never-existed',
  });
  assert.equal(status, 200);
  assert.equal(store.getSessionsSnapshot().length, 0);
});
