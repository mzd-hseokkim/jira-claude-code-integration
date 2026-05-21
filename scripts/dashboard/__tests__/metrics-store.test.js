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

// ---------------------------------------------------------------------------
// MAE-387: getLeadTime / getCycleTime / getPerAssignee / getAgingWip
// T1: lead time 분포 계산 (sqlite + json 교차)
// T2: cycle time 근사 (snapshot 최초 indeterminate → resolutiondate)
// T3: perAssignee 주간 완료 + WIP (무할당 별도 버킷)
// T4: aging WIP 내림차순 + 빈 케이스
// ---------------------------------------------------------------------------

// --- T1: getLeadTime ---

test('T1-sqlite: getLeadTime returns distribution with median for resolved issues', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'sp-lt', site: 'https://x.atlassian.net', projectKey: 'LT', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'LT-1', spaceId: 'sp-lt', statusCategory: 'done', created: '2024-01-01T00:00:00Z', resolutiondate: '2024-01-11T00:00:00Z' }), // 10 days
    makeIssue({ issueKey: 'LT-2', spaceId: 'sp-lt', statusCategory: 'done', created: '2024-01-01T00:00:00Z', resolutiondate: '2024-01-21T00:00:00Z' }), // 20 days
    makeIssue({ issueKey: 'LT-3', spaceId: 'sp-lt', statusCategory: 'done', created: '2024-01-01T00:00:00Z', resolutiondate: '2024-01-31T00:00:00Z' }), // 30 days
  ]);

  const result = store.getLeadTime('sp-lt');
  assert.ok(result, 'getLeadTime should return a result');
  assert.ok(typeof result.median === 'number', 'median should be a number');
  assert.ok(Array.isArray(result.distribution), 'distribution should be array');
  assert.equal(result.distribution.length, 3);
  assert.ok(result.distribution.every((r) => typeof r.issueKey === 'string' && typeof r.days === 'number'), 'each entry has issueKey+days');
  assert.equal(result.median, 20, 'median of [10,20,30] should be 20');

  store.close();
});

test('T1-sqlite: getLeadTime returns null percentiles when no resolved issues', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'sp-lt-empty', site: 'https://x.atlassian.net', projectKey: 'LT', credsOk: true });
  store.upsertIssues([makeIssue({ issueKey: 'LT-1', spaceId: 'sp-lt-empty', statusCategory: 'indeterminate', resolutiondate: null })]);

  const result = store.getLeadTime('sp-lt-empty');
  assert.equal(result.median, null, 'median should be null when no resolved issues');
  assert.deepEqual(result.distribution, [], 'distribution should be empty array');

  store.close();
});

test('T1-json: getLeadTime sqlite=json same result for identical input', () => {
  const dir = tmpDir();
  const sqliteStore = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });
  const jsonStore = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics2.json') });

  const issues = [
    makeIssue({ issueKey: 'X-1', spaceId: 'sp-cross', statusCategory: 'done', created: '2024-01-01T00:00:00Z', resolutiondate: '2024-01-06T00:00:00Z' }), // 5 days
    makeIssue({ issueKey: 'X-2', spaceId: 'sp-cross', statusCategory: 'done', created: '2024-01-01T00:00:00Z', resolutiondate: '2024-01-16T00:00:00Z' }), // 15 days
  ];

  [sqliteStore, jsonStore].forEach((store) => {
    store.upsertSpace({ id: 'sp-cross', site: 'https://x.atlassian.net', projectKey: 'X', credsOk: true });
    store.upsertIssues(issues);
  });

  const sqliteResult = sqliteStore.getLeadTime('sp-cross');
  const jsonResult = jsonStore.getLeadTime('sp-cross');

  assert.equal(sqliteResult.median, jsonResult.median, 'sqlite and json median should match');
  assert.equal(sqliteResult.distribution.length, jsonResult.distribution.length, 'distribution length should match');

  sqliteStore.close();
  jsonStore.close();
});

// --- T2: getCycleTime ---

test('T2-json: getCycleTime approximates from first indeterminate snapshot to resolutiondate', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'sp-ct', site: 'https://x.atlassian.net', projectKey: 'CT', credsOk: true });
  // Issue resolved, with snapshot showing first indeterminate on Jan 3 (5 days before resolution Jan 8)
  store.upsertIssues([
    makeIssue({ issueKey: 'CT-1', spaceId: 'sp-ct', statusCategory: 'done', created: '2024-01-01T00:00:00Z', resolutiondate: '2024-01-08T00:00:00Z' }),
  ]);

  // Manually inject snapshots via the JSON file
  const jsonPath = path.join(dir, 'metrics.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  data.snapshots['CT-1::2024-01-03'] = { issueKey: 'CT-1', snapshotDate: '2024-01-03', spaceId: 'sp-ct', statusCategory: 'indeterminate', resolutiondate: null };
  data.snapshots['CT-1::2024-01-05'] = { issueKey: 'CT-1', snapshotDate: '2024-01-05', spaceId: 'sp-ct', statusCategory: 'indeterminate', resolutiondate: null };
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

  // Re-open to pick up manual snapshot changes
  store.close();
  const store2 = createMetricsStore({ _forceJson: true, jsonFile: jsonPath });

  const result = store2.getCycleTime('sp-ct');
  assert.ok(result, 'getCycleTime should return a result');
  assert.ok(Array.isArray(result.distribution), 'distribution should be array');
  assert.equal(result.distribution.length, 1, 'one resolved issue with snapshot should produce one entry');
  // first indeterminate 2024-01-03 → resolution 2024-01-08 = 5 days
  assert.equal(result.distribution[0].days, 5, 'cycle time should be 5 days');
  assert.ok(result.note, 'note field should exist (approximate label)');

  store2.close();
});

test('T2-json: getCycleTime returns empty distribution when no resolved issues with snapshots', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'sp-ct-empty', site: 'https://x.atlassian.net', projectKey: 'CT', credsOk: true });
  store.upsertIssues([makeIssue({ issueKey: 'CT-1', spaceId: 'sp-ct-empty', statusCategory: 'indeterminate', resolutiondate: null })]);

  const result = store.getCycleTime('sp-ct-empty');
  assert.equal(result.median, null, 'median should be null');
  assert.deepEqual(result.distribution, [], 'distribution should be empty');

  store.close();
});

// --- T3: getPerAssignee ---

test('T3-sqlite: getPerAssignee returns weekly completed + current WIP by assignee', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });
  const today = new Date().toISOString().slice(0, 10);

  store.upsertSpace({ id: 'sp-pa', site: 'https://x.atlassian.net', projectKey: 'PA', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'PA-1', spaceId: 'sp-pa', assignee: 'alice', statusCategory: 'done', resolutiondate: today }),
    makeIssue({ issueKey: 'PA-2', spaceId: 'sp-pa', assignee: 'alice', statusCategory: 'done', resolutiondate: today }),
    makeIssue({ issueKey: 'PA-3', spaceId: 'sp-pa', assignee: 'alice', statusCategory: 'indeterminate', resolutiondate: null }),
    makeIssue({ issueKey: 'PA-4', spaceId: 'sp-pa', assignee: null, statusCategory: 'done', resolutiondate: today }),
    makeIssue({ issueKey: 'PA-5', spaceId: 'sp-pa', assignee: null, statusCategory: 'indeterminate', resolutiondate: null }),
  ]);

  const result = store.getPerAssignee('sp-pa', 8);
  assert.ok(Array.isArray(result), 'should return array');

  const alice = result.find((r) => r.assignee === 'alice');
  assert.ok(alice, 'alice entry should exist');
  assert.equal(alice.completed, 2, 'alice completed 2');
  assert.equal(alice.wip, 1, 'alice wip = 1');

  const unassigned = result.find((r) => r.assignee === '__unassigned__' || r.assignee === null || r.assignee === '');
  assert.ok(unassigned, 'unassigned bucket should exist');
  assert.equal(unassigned.completed, 1, 'unassigned completed 1');
  assert.equal(unassigned.wip, 1, 'unassigned wip = 1');

  store.close();
});

test('T3-json: getPerAssignee sqlite=json same assignee buckets', () => {
  const dir = tmpDir();
  const today = new Date().toISOString().slice(0, 10);

  const issues = [
    makeIssue({ issueKey: 'B-1', spaceId: 'sp-pa2', assignee: 'bob', statusCategory: 'done', resolutiondate: today }),
    makeIssue({ issueKey: 'B-2', spaceId: 'sp-pa2', assignee: 'bob', statusCategory: 'indeterminate', resolutiondate: null }),
  ];

  const sqliteStore = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });
  const jsonStore = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics2.json') });

  [sqliteStore, jsonStore].forEach((store) => {
    store.upsertSpace({ id: 'sp-pa2', site: 'https://x.atlassian.net', projectKey: 'B', credsOk: true });
    store.upsertIssues(issues);
  });

  const sqliteResult = sqliteStore.getPerAssignee('sp-pa2', 8);
  const jsonResult = jsonStore.getPerAssignee('sp-pa2', 8);

  const sqliteBob = sqliteResult.find((r) => r.assignee === 'bob');
  const jsonBob = jsonResult.find((r) => r.assignee === 'bob');

  assert.ok(sqliteBob && jsonBob, 'bob should exist in both');
  assert.equal(sqliteBob.completed, jsonBob.completed, 'completed should match');
  assert.equal(sqliteBob.wip, jsonBob.wip, 'wip should match');

  sqliteStore.close();
  jsonStore.close();
});

// --- T4: getAgingWip ---

test('T4-sqlite: getAgingWip returns indeterminate issues sorted by ageDays descending', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 30);

  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 5);

  store.upsertSpace({ id: 'sp-aw', site: 'https://x.atlassian.net', projectKey: 'AW', credsOk: true });
  store.upsertIssues([
    makeIssue({ issueKey: 'AW-1', spaceId: 'sp-aw', statusCategory: 'indeterminate', created: oldDate.toISOString() }),
    makeIssue({ issueKey: 'AW-2', spaceId: 'sp-aw', statusCategory: 'indeterminate', created: recentDate.toISOString() }),
    makeIssue({ issueKey: 'AW-3', spaceId: 'sp-aw', statusCategory: 'done', created: oldDate.toISOString(), resolutiondate: new Date().toISOString().slice(0, 10) }),
  ]);

  const result = store.getAgingWip('sp-aw');
  assert.ok(Array.isArray(result), 'should return array');
  assert.equal(result.length, 2, 'only indeterminate issues');

  // sorted descending by ageDays
  assert.ok(result[0].ageDays >= result[1].ageDays, 'sorted by ageDays desc');
  assert.equal(result[0].issueKey, 'AW-1', 'older issue should be first');

  // check fields
  const entry = result[0];
  assert.ok(typeof entry.issueKey === 'string', 'issueKey field');
  assert.ok(typeof entry.ageDays === 'number', 'ageDays field');
  assert.ok('assignee' in entry, 'assignee field');
  assert.ok('created' in entry, 'created field');

  store.close();
});

test('T4-sqlite: getAgingWip returns empty array when no indeterminate issues', () => {
  const dir = tmpDir();
  const store = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });

  store.upsertSpace({ id: 'sp-aw-empty', site: 'https://x.atlassian.net', projectKey: 'AW', credsOk: true });
  store.upsertIssues([makeIssue({ issueKey: 'AW-1', spaceId: 'sp-aw-empty', statusCategory: 'done', resolutiondate: new Date().toISOString().slice(0, 10) })]);

  const result = store.getAgingWip('sp-aw-empty');
  assert.deepEqual(result, [], 'should return empty array');

  store.close();
});

test('T4-json: getAgingWip sqlite=json same result', () => {
  const dir = tmpDir();
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 10);

  const issues = [
    makeIssue({ issueKey: 'Z-1', spaceId: 'sp-aw3', statusCategory: 'indeterminate', created: oldDate.toISOString() }),
  ];

  const sqliteStore = createMetricsStore({ dbFile: path.join(dir, 'test.db'), jsonFile: path.join(dir, 'metrics.json') });
  const jsonStore = createMetricsStore({ _forceJson: true, jsonFile: path.join(dir, 'metrics2.json') });

  [sqliteStore, jsonStore].forEach((store) => {
    store.upsertSpace({ id: 'sp-aw3', site: 'https://x.atlassian.net', projectKey: 'Z', credsOk: true });
    store.upsertIssues(issues);
  });

  const sqliteResult = sqliteStore.getAgingWip('sp-aw3');
  const jsonResult = jsonStore.getAgingWip('sp-aw3');

  assert.equal(sqliteResult.length, jsonResult.length, 'same number of aging WIP entries');
  assert.ok(Math.abs(sqliteResult[0].ageDays - jsonResult[0].ageDays) <= 1, 'ageDays within 1 day tolerance');

  sqliteStore.close();
  jsonStore.close();
});
