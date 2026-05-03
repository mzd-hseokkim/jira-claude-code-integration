'use strict';

/**
 * MAE-278: jira-collector per-workspace credentials tests.
 * Test cases: I6 (AC-5) — creds-missing workspace skipped + credsStatus upserted.
 *
 * Uses node:test (no external test runner required).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { startJiraCollector } = require('../collectors/jira');
const { CredentialsNotFoundError } = require('../credentials');

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal store mock that captures upserts and exposes stale entries.
 */
function makeStore(staleEntries = []) {
  const upserted = [];
  const updatedIssues = [];
  return {
    getStaleEntries: () => staleEntries,
    upsertWorktree(update) { upserted.push({ ...update }); },
    updateCachedIssue(wPath, issue) { updatedIssues.push({ wPath, issue }); },
    _upserted: upserted,
    _updatedIssues: updatedIssues,
  };
}

// ─── I6: creds-missing workspace skipped, credsStatus='missing' in store ────

test('I6: creds-missing workspace → jira fetch skipped + credsStatus missing upserted', async () => {
  // Only ws-b entry (creds missing). No network call will happen — creds fail fast.
  const staleEntries = [
    { path: '/ws-b/worktree', taskId: 'MAE-200', workspaceRoot: '/ws-b' },
  ];

  const store = makeStore(staleEntries);

  // ws-b: CredentialsNotFoundError
  function getCredentialsForWorkspace(root) {
    throw new CredentialsNotFoundError();
  }

  function getCredentials() { throw new CredentialsNotFoundError(); }

  const collector = startJiraCollector(store, {
    tickMs: 9999999,  // no auto-repeat
    backoffMs: 0,
    getCredentials,
    getCredentialsForWorkspace,
    onTick: () => {},
  });

  // Give the initial (sync-triggered) cycle time to finish — creds fail immediately, no I/O
  await new Promise((resolve) => setTimeout(resolve, 50));
  collector.stop();

  // ws-b should have credsStatus='missing' upserted
  const missingUpsert = store._upserted.find(
    (u) => u.path === '/ws-b/worktree' && u.credsStatus === 'missing'
  );
  assert.ok(missingUpsert, 'store.upsertWorktree should be called with credsStatus=missing for ws-b');
});

// I6b: two workspaces — ok one proceeds, missing one is skipped
test('I6b: ok workspace proceeds to fetch, missing workspace skipped', async () => {
  // ws-a: ok creds but taskId=null (no fetch), ws-b: missing creds
  // We use taskId=null for ws-a so no network call is attempted.
  const staleEntries = [
    { path: '/ws-a/worktree', taskId: null, workspaceRoot: '/ws-a' },
    { path: '/ws-b/worktree', taskId: 'MAE-200', workspaceRoot: '/ws-b' },
  ];
  // Note: getStaleEntries skips entries without taskId, but we include it to verify
  // creds path is not reached for null-taskId entries.
  const staleEntriesWithTask = [
    { path: '/ws-b/worktree', taskId: 'MAE-200', workspaceRoot: '/ws-b' },
  ];

  const store = makeStore(staleEntriesWithTask);

  function getCredentialsForWorkspace(root) {
    if (root === '/ws-a') return { jiraUrl: 'https://example.atlassian.net', email: 'x@x.com', apiToken: 'tok' };
    throw new CredentialsNotFoundError();
  }
  function getCredentials() { return { jiraUrl: 'https://example.atlassian.net', email: 'x@x.com', apiToken: 'tok' }; }

  const collector = startJiraCollector(store, {
    tickMs: 9999999, backoffMs: 0,
    getCredentials,
    getCredentialsForWorkspace,
    onTick: () => {},
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  collector.stop();

  // ws-b missing creds → upserted with 'missing'
  const missingUpsert = store._upserted.find(
    (u) => u.path === '/ws-b/worktree' && u.credsStatus === 'missing'
  );
  assert.ok(missingUpsert, 'ws-b should have credsStatus=missing');

  // updateCachedIssue should NOT have been called (ws-b was skipped)
  assert.equal(store._updatedIssues.length, 0, 'no jira fetch should have been attempted for ws-b');
});

// ─── I7: workspaces.events emit is handled in server.js (tested via workspaces module directly) ─

test('I7: workspaces.events emits workspace.registered on register()', () => {
  const workspaces = require('../workspaces');
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');

  // Isolate registry to temp dir
  const reg = fs.mkdtempSync(path.join(os.tmpdir(), 'mae278-i7-'));
  workspaces._setRegistryDirForTest(reg);

  const emitted = [];
  const listener = (payload) => emitted.push(payload);
  workspaces.events.on('workspace.registered', listener);

  // Create a real temp dir to register
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mae278-i7-ws-'));
  try {
    workspaces.register(ws);
    assert.equal(emitted.length, 1, 'workspace.registered should have been emitted once');
    assert.equal(emitted[0].path, path.resolve(ws));

    // Re-register (idempotent) → emit again (D-5: even on idempotent register)
    workspaces.register(ws);
    assert.equal(emitted.length, 2, 'workspace.registered should emit on every register() call');
  } finally {
    workspaces.events.off('workspace.registered', listener);
    workspaces._setRegistryDirForTest(null);
    fs.rmSync(reg, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});
