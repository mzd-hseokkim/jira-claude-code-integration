'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../store');

// U1: ring buffer evict
test('U1: ring buffer evicts oldest entry when full', () => {
  const store = createStore({ ringBufferSize: 3 });
  store.upsertWorktree({ path: '/a', taskId: 't1' });

  store.pushActivity('/a', { ts: '1', type: 'x', data: {} });
  store.pushActivity('/a', { ts: '2', type: 'x', data: {} });
  store.pushActivity('/a', { ts: '3', type: 'x', data: {} });
  store.pushActivity('/a', { ts: '4', type: 'x', data: {} }); // evicts ts='1'

  // getSnapshot truncates at 50, but ring buffer has 3 slots
  const snap = store.getSnapshot();
  const entry = snap.find((w) => w.path === '/a');
  assert.ok(entry, 'entry should exist');
  assert.equal(entry.activity.length, 3);
  assert.equal(entry.activity[0].ts, '2', 'oldest should have been evicted');
  assert.equal(entry.activity[2].ts, '4');
});

// U2: upsertWorktree emits 'worktree.added' for new, 'worktree.changed' for existing
test('U2: upsertWorktree emits worktree.added for new path', (t, done) => {
  const store = createStore();
  store.on('worktree.added', ({ path }) => {
    assert.equal(path, '/new-path');
    done();
  });
  store.upsertWorktree({ path: '/new-path' });
});

test('U2b: upsertWorktree emits worktree.changed for existing path', (t, done) => {
  const store = createStore();
  store.upsertWorktree({ path: '/existing' });
  store.on('worktree.changed', ({ path }) => {
    assert.equal(path, '/existing');
    done();
  });
  store.upsertWorktree({ path: '/existing', branch: 'feat/x' });
});

// U3: getStaleEntries filters correctly
test('U3: getStaleEntries returns only stale entries with taskId', () => {
  const store = createStore();
  const now = Date.now();

  // Stale (6 min old)
  store.upsertWorktree({
    path: '/stale',
    taskId: 'T-1',
    lastFetchedAt: new Date(now - 6 * 60 * 1000).toISOString(),
    noContext: false,
  });
  // Fresh (1 min old)
  store.upsertWorktree({
    path: '/fresh',
    taskId: 'T-2',
    lastFetchedAt: new Date(now - 1 * 60 * 1000).toISOString(),
    noContext: false,
  });
  // No taskId (no context)
  store.upsertWorktree({
    path: '/nocontext',
    taskId: null,
    lastFetchedAt: new Date(now - 6 * 60 * 1000).toISOString(),
    noContext: true,
  });

  const stale = store.getStaleEntries(5 * 60 * 1000);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].path, '/stale');
});

// U4: removeWorktree emits worktree.removed; no-op for unknown path
test('U4: removeWorktree emits worktree.removed for existing path', (t, done) => {
  const store = createStore();
  store.upsertWorktree({ path: '/rm' });
  store.on('worktree.removed', ({ path }) => {
    assert.equal(path, '/rm');
    done();
  });
  store.removeWorktree('/rm');
});

test('U4b: removeWorktree is a no-op for unknown path', () => {
  const store = createStore();
  let emitted = false;
  store.on('worktree.removed', () => { emitted = true; });
  store.removeWorktree('/does-not-exist');
  assert.equal(emitted, false);
});

// U7: upsertWorktree가 jira-collector(updateCachedIssue)가 채운 cachedIssue를
// 덮어쓰지 않는다 (worktree collector vs jira-collector 충돌 회귀 가드).
test('U7: upsertWorktree preserves existing cachedIssue against partial overwrite', () => {
  const store = createStore();
  // Cold-start: worktree collector가 파일 형태(links 없음)로 cachedIssue 박음.
  store.upsertWorktree({
    path: '/wt',
    taskId: 'T-1',
    cachedIssue: { key: 'T-1', summary: 'from-file', status: 'In Progress' },
  });
  // jira-collector가 live API 데이터(links 포함)로 갱신.
  store.updateCachedIssue('/wt', {
    key: 'T-1', summary: 'live', status: 'In Progress',
    links: { blocks: [{ key: 'T-2' }], blockedBy: [] },
  });
  // 이제 worktree collector가 chokidar trigger로 다시 file 형태(links 없음)를 보냄.
  store.upsertWorktree({
    path: '/wt',
    taskId: 'T-1',
    cachedIssue: { key: 'T-1', summary: 'from-file', status: 'In Progress' },
  });
  const snap = store.getSnapshot();
  const entry = snap.find((w) => w.path === '/wt');
  // links가 살아있어야 한다 (회귀 시 undefined가 됨).
  assert.deepEqual(entry.cachedIssue.links, { blocks: [{ key: 'T-2' }], blockedBy: [] });
  assert.equal(entry.cachedIssue.summary, 'live');
});

// U7b: cold-start (cachedIssue=null)일 때는 worktree collector가 채워준다.
test('U7b: upsertWorktree fills cachedIssue when null (cold-start)', () => {
  const store = createStore();
  store.upsertWorktree({
    path: '/wt2',
    taskId: 'T-3',
    cachedIssue: { key: 'T-3', summary: 'from-file' },
  });
  const snap = store.getSnapshot();
  const entry = snap.find((w) => w.path === '/wt2');
  assert.equal(entry.cachedIssue.summary, 'from-file');
});

// U7c: unlink 핸들러가 cachedIssue=null로 명시적으로 비우는 경로는 가드를 통과한다.
test('U7c: upsertWorktree allows explicit cachedIssue=null clear', () => {
  const store = createStore();
  store.upsertWorktree({ path: '/wt3', cachedIssue: { key: 'T-4' } });
  store.upsertWorktree({ path: '/wt3', cachedIssue: null, noContext: true });
  const snap = store.getSnapshot();
  const entry = snap.find((w) => w.path === '/wt3');
  assert.equal(entry.cachedIssue, null);
  assert.equal(entry.noContext, true);
});
