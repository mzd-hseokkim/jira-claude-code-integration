'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseGitWorktreeList, readJiraContext } = require('../collectors/worktree');

// U9: standard worktree output
test('U9: parseGitWorktreeList parses standard output', () => {
  const stdout = 'worktree /a\nbranch refs/heads/x\n\n';
  const result = parseGitWorktreeList(stdout);
  assert.deepEqual(result, [{ path: '/a', branch: 'x' }]);
});

// U10: detached HEAD
test('U10: parseGitWorktreeList handles detached HEAD', () => {
  const stdout = 'worktree /a\ndetached\n\n';
  const result = parseGitWorktreeList(stdout);
  assert.deepEqual(result, [{ path: '/a', branch: null }]);
});

// Multiple worktrees
test('parseGitWorktreeList handles multiple worktrees', () => {
  const stdout = [
    'worktree /repo',
    'branch refs/heads/main',
    '',
    'worktree /repo-worktree/TASK-1',
    'branch refs/heads/feature/TASK-1',
    '',
    'worktree /repo-worktree/TASK-2',
    'detached',
    '',
  ].join('\n');

  const result = parseGitWorktreeList(stdout);
  assert.equal(result.length, 3);
  assert.equal(result[0].branch, 'main');
  assert.equal(result[1].branch, 'feature/TASK-1');
  assert.equal(result[2].branch, null);
});

// U11: readJiraContext returns taskId and cachedIssue from valid file
test('U11: readJiraContext returns taskId/cachedIssue from valid JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae209-wt-'));
  const ctx = { taskId: 'T-42', cachedIssue: { key: 'T-42', summary: 'Test', fetchedAt: '2026-01-01T00:00:00Z' } };
  fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify(ctx));

  const result = readJiraContext(dir);
  assert.equal(result.taskId, 'T-42');
  assert.deepEqual(result.cachedIssue, ctx.cachedIssue);

  fs.rmSync(dir, { recursive: true, force: true });
});

// U12: readJiraContext returns null when file absent
test('U12: readJiraContext returns null when file is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae209-wt-'));
  const result = readJiraContext(dir);
  assert.equal(result, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

// U13: readJiraContext returns null and calls logger.warn on corrupt JSON
test('U13: readJiraContext returns null and warns on corrupt JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae209-wt-'));
  fs.writeFileSync(path.join(dir, '.jira-context.json'), '{ invalid json %%% }');

  let warnCalled = false;
  const mockLogger = { warn: () => { warnCalled = true; } };

  const result = readJiraContext(dir, mockLogger);
  assert.equal(result, null);
  assert.equal(warnCalled, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

// U14: top-level 필드가 cachedIssue보다 우선
test('U14: top-level summary takes priority over cachedIssue.summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae235-wt-'));
  const ctx = {
    taskId: 'T-1',
    summary: 'A',
    cachedIssue: { key: 'T-1', summary: 'B' },
  };
  fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify(ctx));

  const result = readJiraContext(dir);
  assert.equal(result.summary, 'A');

  fs.rmSync(dir, { recursive: true, force: true });
});

// U15: top-level 필드 누락 시 cachedIssue로 폴백
test('U15: falls back to cachedIssue.summary when top-level summary is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae235-wt-'));
  const ctx = {
    taskId: 'T-1',
    cachedIssue: { key: 'T-1', summary: 'B' },
  };
  fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify(ctx));

  const result = readJiraContext(dir);
  assert.equal(result.summary, 'B');

  fs.rmSync(dir, { recursive: true, force: true });
});

// U16: completedSteps 누락 시 기본값 []
test('U16: completedSteps defaults to [] when absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae235-wt-'));
  fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify({ taskId: 'T-1' }));

  const result = readJiraContext(dir);
  assert.deepEqual(result.completedSteps, []);

  fs.rmSync(dir, { recursive: true, force: true });
});

// U17: completedSteps가 배열이 아니면 [] 대체
test('U17: completedSteps defaults to [] when not an array', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae235-wt-'));
  fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify({ taskId: 'T-1', completedSteps: 'init' }));

  const result = readJiraContext(dir);
  assert.deepEqual(result.completedSteps, []);

  fs.rmSync(dir, { recursive: true, force: true });
});

// U19: aggregate 포맷(activeTask)에서 summary/steps/cachedIssue 폴백
test('U19: reads activeTask when top-level fields absent (aggregate format)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae235-wt-'));
  const ctx = {
    initialized: '2026-05-22T00:00:00Z',
    activeTask: {
      taskId: 'ATL-493',
      summary: 'Helm chart 마무리',
      status: '완료',
      completedSteps: ['start', 'approach', 'impl', 'test', 'review', 'merge', 'done'],
      cachedIssue: { summary: 'Helm chart 마무리', priority: '주요', fetchedAt: '2026-05-22T11:39:00.000Z' },
    },
    tasks: [],
  };
  fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify(ctx));

  const result = readJiraContext(dir);
  assert.equal(result.taskId, 'ATL-493');
  assert.equal(result.summary, 'Helm chart 마무리');
  assert.equal(result.status, '완료');
  assert.equal(result.priority, '주요');
  assert.deepEqual(result.completedSteps, ['start', 'approach', 'impl', 'test', 'review', 'merge', 'done']);
  assert.equal(result.lastFetchedAt, '2026-05-22T11:39:00.000Z');

  fs.rmSync(dir, { recursive: true, force: true });
});

// U18: 모든 신규 필드 부재 시 기본값
test('U18: all new fields default to null/[] when absent from top-level and cachedIssue', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mae235-wt-'));
  fs.writeFileSync(path.join(dir, '.jira-context.json'), JSON.stringify({ taskId: 'T-1', cachedIssue: {} }));

  const result = readJiraContext(dir);
  assert.equal(result.summary, null);
  assert.equal(result.priority, null);
  assert.equal(result.status, null);
  assert.equal(result.epic, null);
  assert.deepEqual(result.completedSteps, []);

  fs.rmSync(dir, { recursive: true, force: true });
});
