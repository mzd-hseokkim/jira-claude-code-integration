'use strict';

/**
 * Unit tests for scripts/dashboard/routes/ingest.js
 * Test cases: U1–U6 from docs/design/MAE-210.design.md § Test Plan
 *
 * Uses node:test (no external test runner required).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createIngestRouter, lookupWorktree } = require('../routes/ingest');
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

// U2: mapping fails (lookup returns null) → 200 + label:no-context
test('U2: lookup null → 200 label:no-context', async () => {
  const store = makeStore([]); // no worktrees registered
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest?hook=PreToolUse', { cwd: '/x/MAE-210' });

  assert.equal(status, 200);
  assert.equal(body.taskId, null);
  assert.equal(body.label, 'no-context');
  assert.equal(store._pushed.length, 1);
  assert.equal(store._pushed[0].ev.data.label, 'no-context');
});

// U3: hook name missing → hookName:<unknown>
test('U3: missing ?hook → hookName:<unknown>', async () => {
  const store = makeStore([]);
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status, body } = await post(app, '/ingest', {});

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(store._pushed[0].ev.data.hookName, '<unknown>');
});

// U4: hook name not in whitelist → hookName:<unknown>
test('U4: ?hook=Bogus → hookName:<unknown>', async () => {
  const store = makeStore([]);
  const router = createIngestRouter(store);
  const express = require('express');
  const app = express();
  app.use('/ingest', router);

  const { status } = await post(app, '/ingest?hook=Bogus', {});

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

// U6: worktreeMap.lookup throws → 200 + label:no-context
test('U6: lookup throws → 200 label:no-context', async () => {
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
  assert.equal(store._pushed.length, 1);
  assert.equal(store._pushed[0].ev.data.label, 'no-context');
});
