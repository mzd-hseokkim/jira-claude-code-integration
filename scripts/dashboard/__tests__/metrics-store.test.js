'use strict';

/**
 * metrics-store.test.js — MAE-386 Test Plan T2/T4/T5
 *
 * T2: upsertIssues → issue_current/issue_snapshot에 upsert
 * T4: _forceJson → JSON fallback 경로로 동일 API 동작
 * T5: store 재오픈(restart 모사) 후 누적 snapshot 유지
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createMetricsStore } = require('../metrics-store');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-store-test-'));
}

function makeIssue(overrides = {}) {
  return {
    issueKey: 'MAE-1',
    spaceId: 'space-a',
    summary: 'Test issue',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    priority: 'Major',
    assignee: null,
    issuetype: 'Story',
    created: '2024-01-01T00:00:00Z',
    resolutiondate: null,
    updated: '2024-01-02T00:00:00Z',
    parent: null,
    epic: null,
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

// NOTE: better-sqlite3 is an optional dependency — may not be installed.
// When unavailable, createMetricsStore() falls back to JSON.
// Tests use _forceJson=true OR let the factory decide (it will use JSON if sqlite unavailable).
// All tests pass { dbFile, jsonFile } to both backends to avoid polluting the default file.

// ---------------------------------------------------------------------------
// T2: upsertIssues stores and retrieves status distribution (both backends)
// ---------------------------------------------------------------------------

test('T2-sqlite: upsertIssues → getStatusDistribution reflects upserted issues', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'space-a', site: 'https://example.atlassian.net', projectKey: 'MAE', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'MAE-1', status: 'In Progress', statusCategory: 'indeterminate' }),
    makeIssue({ issueKey: 'MAE-2', status: 'In Progress', statusCategory: 'indeterminate' }),
    makeIssue({ issueKey: 'MAE-3', status: 'Done', statusCategory: 'done', resolutiondate: '2024-01-03' }),
  ]);

  const dist = store.getStatusDistribution('space-a');
  assert.ok(Array.isArray(dist));

  const inProgress = dist.find((d) => d.status === 'In Progress');
  assert.ok(inProgress, 'In Progress entry should exist');
  assert.equal(inProgress.count, 2);

  const done = dist.find((d) => d.status === 'Done');
  assert.ok(done, 'Done entry should exist');
  assert.equal(done.count, 1);

  store.close();
});

test('T2-sqlite: upsertIssues idempotent — re-upsert same issueKey updates row', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'space-a', site: 'https://example.atlassian.net', projectKey: 'MAE', credsOk: true });
  store.upsertIssues([makeIssue({ issueKey: 'MAE-1', status: 'In Progress', statusCategory: 'indeterminate' })]);
  store.upsertIssues([makeIssue({ issueKey: 'MAE-1', status: 'Done', statusCategory: 'done', resolutiondate: '2024-01-10' })]);

  const dist = store.getStatusDistribution('space-a');
  // After upsert to 'Done', In Progress should be gone; Done should exist
  const inProgress = dist.find((d) => d.status === 'In Progress');
  const done = dist.find((d) => d.status === 'Done');
  assert.ok(!inProgress, `In Progress should be replaced by Done upsert, got: ${JSON.stringify(inProgress)}`);
  assert.ok(done, 'Done should exist after upsert');

  store.close();
});

test('T2-sqlite: getWip returns count of indeterminate issues', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'space-a', site: 'https://x.atlassian.net', projectKey: 'MAE', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'MAE-1', statusCategory: 'indeterminate' }),
    makeIssue({ issueKey: 'MAE-2', statusCategory: 'indeterminate' }),
    makeIssue({ issueKey: 'MAE-3', statusCategory: 'done' }),
  ]);

  assert.equal(store.getWip('space-a'), 2);

  store.close();
});

// ---------------------------------------------------------------------------
// T4: JSON fallback — _forceJson=true → same API behaviour
// ---------------------------------------------------------------------------

test('T4-json: _forceJson → type is json, upsertIssues/getStatusDistribution works', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics.json') });

  assert.equal(store.type, 'json', 'should use JSON fallback');

  store.upsertSpace({ id: 'space-b', site: 'https://fallback.atlassian.net', projectKey: 'FB', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'FB-1', spaceId: 'space-b', status: 'To Do', statusCategory: 'new' }),
    makeIssue({ issueKey: 'FB-2', spaceId: 'space-b', status: 'To Do', statusCategory: 'new' }),
  ]);

  const dist = store.getStatusDistribution('space-b');
  assert.ok(Array.isArray(dist));
  const todo = dist.find((d) => d.status === 'To Do');
  assert.ok(todo, 'To Do entry should exist');
  assert.equal(todo.count, 2);

  store.close();
});

test('T4-json: getWip works via JSON fallback', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'space-c', site: 'https://x.atlassian.net', projectKey: 'C', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'C-1', spaceId: 'space-c', statusCategory: 'indeterminate' }),
    makeIssue({ issueKey: 'C-2', spaceId: 'space-c', statusCategory: 'new' }),
  ]);

  assert.equal(store.getWip('space-c'), 1);

  store.close();
});

test('T4-json: getThroughput works via JSON fallback', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics.json') });
  const today = new Date().toISOString().slice(0, 10);

  store.upsertSpace({ id: 'sp', site: 'https://x.atlassian.net', projectKey: 'X', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'X-1', spaceId: 'sp', statusCategory: 'done', resolutiondate: today }),
  ]);

  const tp = store.getThroughput('sp', 8);
  assert.ok(Array.isArray(tp));
  const totalCompleted = tp.reduce((s, w) => s + w.completed, 0);
  assert.equal(totalCompleted, 1, 'one completed issue should appear in throughput');

  store.close();
});

// ---------------------------------------------------------------------------
// W1 fix: past resolution without snapshot — must still appear in throughput
// ---------------------------------------------------------------------------

test('W1-sqlite: issue resolved before first snapshot — appears in throughput', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  // Issue resolved 30 days ago, but no collector was running then (no snapshot row)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 30);
  const pastStr = pastDate.toISOString().slice(0, 10);

  store.upsertSpace({ id: 'sp-w1', site: 'https://x.atlassian.net', projectKey: 'W', credsOk: true });
  // upsertIssues creates today's snapshot, not a past one — simulates "dashboard offline when resolved"
  store.upsertIssues([
    makeIssue({ issueKey: 'W-1', spaceId: 'sp-w1', statusCategory: 'done', resolutiondate: pastStr }),
  ]);

  const tp = store.getThroughput('sp-w1', 8);
  assert.ok(Array.isArray(tp));
  const totalCompleted = tp.reduce((s, w) => s + w.completed, 0);
  assert.equal(totalCompleted, 1, 'past-resolved issue (no snapshot on that day) must appear in throughput');

  store.close();
});

test('W1-json: issue resolved before first snapshot — appears in throughput (JSON fallback)', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics.json') });

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 30);
  const pastStr = pastDate.toISOString().slice(0, 10);

  store.upsertSpace({ id: 'sp-w1j', site: 'https://x.atlassian.net', projectKey: 'W', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'W-1', spaceId: 'sp-w1j', statusCategory: 'done', resolutiondate: pastStr }),
  ]);

  const tp = store.getThroughput('sp-w1j', 8);
  assert.ok(Array.isArray(tp));
  const totalCompleted = tp.reduce((s, w) => s + w.completed, 0);
  assert.equal(totalCompleted, 1, 'past-resolved issue must appear in throughput via JSON fallback');

  store.close();
});

// ---------------------------------------------------------------------------
// T5: restart 모사 — store 재오픈 후 누적 snapshot 유지
// ---------------------------------------------------------------------------

test('T5-sqlite: reopen store after close — cumulative snapshots persist', () => {
  const dir = tmpDir();
  const dbFile = path.join(dir, 'persist.db');

  // First open: upsert issues
  const jsonFile = path.join(dir, 'persist.json');
  const store1 = createMetricsStore({ dbFile, jsonFile });
  store1.upsertSpace({ id: 'sp', site: 'https://x.atlassian.net', projectKey: 'MAE', credsOk: true });
  store1.upsertIssues([
    makeIssue({ issueKey: 'MAE-10', spaceId: 'sp', status: 'Done', statusCategory: 'done', resolutiondate: new Date().toISOString().slice(0, 10) }),
  ]);
  const dist1 = store1.getStatusDistribution('sp');
  assert.ok(dist1.some((d) => d.status === 'Done'), 'Done should exist before close');
  store1.close();

  // Second open (restart simulation): data should still be there
  const store2 = createMetricsStore({ dbFile, jsonFile });
  const dist2 = store2.getStatusDistribution('sp');
  assert.ok(dist2.some((d) => d.status === 'Done'), 'Done should persist after reopen');

  const spaces = store2.listSpaces();
  assert.equal(spaces.length, 1, 'space should persist after reopen');
  assert.equal(spaces[0].id, 'sp');

  store2.close();
});

test('T5-json: reopen JSON fallback — cumulative data persists', () => {
  const dir = tmpDir();
  const jsonFile = path.join(dir, 'metrics.json');

  const store1 = createMetricsStore({ _forceJson: true, jsonFile });
  store1.upsertSpace({ id: 'sp2', site: 'https://x.atlassian.net', projectKey: 'Y', credsOk: true });
  store1.upsertIssues([makeIssue({ issueKey: 'Y-1', spaceId: 'sp2', statusCategory: 'done' })]);
  store1.close();

  const store2 = createMetricsStore({ _forceJson: true, jsonFile });
  const dist = store2.getStatusDistribution('sp2');
  assert.ok(Array.isArray(dist) && dist.length > 0, 'JSON data should persist after reopen');
  store2.close();
});
