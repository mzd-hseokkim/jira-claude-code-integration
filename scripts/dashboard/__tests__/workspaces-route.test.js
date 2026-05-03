'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const workspaces = require('../workspaces');
const { createWorkspacesRouter } = require('../routes/workspaces');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupRegistry() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae279-reg-'));
  workspaces._setRegistryDirForTest(dir);
  return dir;
}

function teardown(regDir) {
  workspaces._setRegistryDirForTest(null);
  try { fs.rmSync(regDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function makeStore(snapshot) {
  return { getSnapshot: () => snapshot };
}

function makeFailingStore() {
  return {
    getSnapshot() { throw new Error('store boom'); },
  };
}

async function startApp(router) {
  const express = require('express');
  const app = express();
  app.use('/workspaces', router);
  return await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/workspaces`,
        async close() { await new Promise((r) => server.close(r)); },
      });
    });
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
        catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('U1: empty registry → workspaces=[], serverPluginRoot present', async () => {
  const reg = setupRegistry();
  try {
    const router = createWorkspacesRouter(makeStore([]), null, { pluginRoot: '/fake/root' });
    const { url, close } = await startApp(router);
    try {
      const { status, json } = await getJson(url);
      assert.equal(status, 200);
      assert.deepEqual(json.workspaces, []);
      assert.equal(json.serverPluginRoot, '/fake/root');
      assert.ok(typeof json.serverNowMs === 'number');
    } finally { await close(); }
  } finally { teardown(reg); }
});

test('U2: 1 workspace + all worktrees credsStatus=ok → health=healthy', async () => {
  const reg = setupRegistry();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mae279-ws-'));
  try {
    const entry = workspaces.register(ws);
    const snapshot = [
      { path: '/wt/a', workspaceRoot: entry.path, credsStatus: 'ok' },
      { path: '/wt/b', workspaceRoot: entry.path, credsStatus: 'ok' },
    ];
    const router = createWorkspacesRouter(makeStore(snapshot), null);
    const { url, close } = await startApp(router);
    try {
      const { json } = await getJson(url);
      assert.equal(json.workspaces.length, 1);
      assert.equal(json.workspaces[0].health, 'healthy');
      assert.equal(json.workspaces[0].worktreeCount, 2);
      assert.equal(json.workspaces[0].path, entry.path);
    } finally { await close(); }
  } finally { teardown(reg); fs.rmSync(ws, { recursive: true, force: true }); }
});

test('U3: 1 workspace + 1 worktree credsStatus=missing → health=creds-missing', async () => {
  const reg = setupRegistry();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mae279-ws-'));
  try {
    const entry = workspaces.register(ws);
    const snapshot = [
      { path: '/wt/a', workspaceRoot: entry.path, credsStatus: 'ok' },
      { path: '/wt/b', workspaceRoot: entry.path, credsStatus: 'missing' },
    ];
    const router = createWorkspacesRouter(makeStore(snapshot), null);
    const { url, close } = await startApp(router);
    try {
      const { json } = await getJson(url);
      assert.equal(json.workspaces[0].health, 'creds-missing');
      assert.equal(json.workspaces[0].worktreeCount, 2);
    } finally { await close(); }
  } finally { teardown(reg); fs.rmSync(ws, { recursive: true, force: true }); }
});

test('U4: registered workspace with no matching worktrees → health=no-worktrees', async () => {
  const reg = setupRegistry();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mae279-ws-'));
  try {
    workspaces.register(ws);
    const snapshot = [
      { path: '/wt/foreign', workspaceRoot: '/some/other/root', credsStatus: 'ok' },
    ];
    const router = createWorkspacesRouter(makeStore(snapshot), null);
    const { url, close } = await startApp(router);
    try {
      const { json } = await getJson(url);
      assert.equal(json.workspaces[0].health, 'no-worktrees');
      assert.equal(json.workspaces[0].worktreeCount, 0);
    } finally { await close(); }
  } finally { teardown(reg); fs.rmSync(ws, { recursive: true, force: true }); }
});

test('U5: store.getSnapshot throws → health=unknown but response OK', async () => {
  const reg = setupRegistry();
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mae279-ws-'));
  try {
    const entry = workspaces.register(ws);
    const router = createWorkspacesRouter(makeFailingStore(), null);
    const { url, close } = await startApp(router);
    try {
      const { status, json } = await getJson(url);
      assert.equal(status, 200);
      assert.equal(json.workspaces[0].health, 'unknown');
      assert.equal(json.workspaces[0].path, entry.path);
    } finally { await close(); }
  } finally { teardown(reg); fs.rmSync(ws, { recursive: true, force: true }); }
});

test('U6: lastTickAt getter is invoked and returned', async () => {
  const reg = setupRegistry();
  try {
    let tick = null;
    const router = createWorkspacesRouter(makeStore([]), null, { getLastTickAt: () => tick });
    const { url, close } = await startApp(router);
    try {
      let { json } = await getJson(url);
      assert.equal(json.lastTickAt, null);
      tick = 1234567890;
      ({ json } = await getJson(url));
      assert.equal(json.lastTickAt, 1234567890);
    } finally { await close(); }
  } finally { teardown(reg); }
});
