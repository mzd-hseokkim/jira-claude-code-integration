'use strict';

/**
 * metrics-spaces.test.js — MAE-386 Test Plan T1
 *
 * T1: metrics-spaces가 등록 워크스페이스에서 (site, projectKey) dedupe + creds 해석 표기
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { discoverSpaces, inferProjectKey } = require('../metrics-spaces');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-spaces-test-'));
}

function makeWorkspacesModule(entries) {
  return {
    loadAndPrune() {
      return { workspaces: entries };
    },
  };
}

// ---------------------------------------------------------------------------
// T1: discoverSpaces dedupe + creds 표기
// ---------------------------------------------------------------------------

test('T1: discoverSpaces returns empty array when no workspaces', () => {
  const mod = makeWorkspacesModule([]);
  const spaces = discoverSpaces(mod);
  assert.deepEqual(spaces, []);
});

test('T1: discoverSpaces deduplicate (site, projectKey) pairs', () => {
  // Two workspaces with same JIRA_URL + same JIRA_DEFAULT_PROJECT → should dedupe
  const dir1 = tmpDir();
  const dir2 = tmpDir();
  const mod = makeWorkspacesModule([{ path: dir1 }, { path: dir2 }]);

  const origJiraUrl = process.env.JIRA_URL;
  const origProject = process.env.JIRA_DEFAULT_PROJECT;
  try {
    process.env.JIRA_URL = 'https://test.atlassian.net';
    process.env.JIRA_DEFAULT_PROJECT = 'MAE';
    // hasResolvableCredentials needs JIRA_USERNAME + JIRA_API_TOKEN too
    process.env.JIRA_USERNAME = 'test@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';

    const spaces = discoverSpaces(mod);
    // (site, projectKey) dedupe → only 1
    assert.equal(spaces.length, 1, 'duplicates should be deduplicated to 1');
    assert.equal(spaces[0].site, 'https://test.atlassian.net');
    assert.equal(spaces[0].projectKey, 'MAE');
    assert.equal(spaces[0].credsOk, true, 'creds should be resolvable');
  } finally {
    if (origJiraUrl === undefined) delete process.env.JIRA_URL;
    else process.env.JIRA_URL = origJiraUrl;
    if (origProject === undefined) delete process.env.JIRA_DEFAULT_PROJECT;
    else process.env.JIRA_DEFAULT_PROJECT = origProject;
    delete process.env.JIRA_USERNAME;
    delete process.env.JIRA_API_TOKEN;
  }
});

test('T1: discoverSpaces marks credsOk=false when resolver returns null', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, '.jira-context.json'),
    JSON.stringify({ taskId: 'ATL-491' }),
    'utf8'
  );
  const mod = makeWorkspacesModule([{ path: dir }]);

  // 결정성: credential resolver를 주입해 home 전역 설정 의존 제거
  const spaces = discoverSpaces(mod, {
    site: 'https://test.atlassian.net',
    resolveCreds: () => null,
  });
  assert.equal(spaces.length, 1, 'projectKey resolves → space included even without creds');
  assert.equal(spaces[0].projectKey, 'ATL');
  assert.equal(spaces[0].credsOk, false, 'no creds → credsOk should be false');
  assert.equal(spaces[0].site, 'https://test.atlassian.net', 'falls back to opts.site');
});

test('T1: discoverSpaces skips workspaces with no inferrable projectKey', () => {
  const dir = tmpDir(); // no .jira-context.json
  const mod = makeWorkspacesModule([{ path: dir }]);
  const orig = process.env.JIRA_DEFAULT_PROJECT;
  delete process.env.JIRA_DEFAULT_PROJECT;
  try {
    const spaces = discoverSpaces(mod, { resolveCreds: () => null });
    assert.deepEqual(spaces, [], 'unresolved projectKey → not registered');
  } finally {
    if (orig !== undefined) process.env.JIRA_DEFAULT_PROJECT = orig;
  }
});

test('T1: discoverSpaces resolves distinct projects per workspace (MAE + ATL)', () => {
  const maeDir = tmpDir();
  const atlDir = tmpDir();
  fs.writeFileSync(path.join(maeDir, '.jira-context.json'),
    JSON.stringify({ tasks: [{ taskId: 'MAE-1' }] }), 'utf8');
  fs.writeFileSync(path.join(atlDir, '.jira-context.json'),
    JSON.stringify({ tasks: [{ taskId: 'ATL-491' }] }), 'utf8');
  const mod = makeWorkspacesModule([{ path: maeDir }, { path: atlDir }]);

  const spaces = discoverSpaces(mod, {
    site: 'https://test.atlassian.net',
    resolveCreds: () => ({ jiraUrl: 'https://test.atlassian.net' }),
  });
  const keys = spaces.map((s) => s.projectKey).sort();
  assert.deepEqual(keys, ['ATL', 'MAE'], 'each workspace resolves to its own project');
});

// ---------------------------------------------------------------------------
// inferProjectKey
// ---------------------------------------------------------------------------

test('T1: inferProjectKey falls back to JIRA_DEFAULT_PROJECT env when no context', () => {
  const orig = process.env.JIRA_DEFAULT_PROJECT;
  try {
    process.env.JIRA_DEFAULT_PROJECT = 'MYPROJ';
    assert.equal(inferProjectKey('/some/path'), 'MYPROJ');
  } finally {
    if (orig === undefined) delete process.env.JIRA_DEFAULT_PROJECT;
    else process.env.JIRA_DEFAULT_PROJECT = orig;
  }
});

test('T1: inferProjectKey context wins over JIRA_DEFAULT_PROJECT env', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, '.jira-context.json'),
    JSON.stringify({ taskId: 'ATL-491' }), 'utf8');
  const orig = process.env.JIRA_DEFAULT_PROJECT;
  try {
    process.env.JIRA_DEFAULT_PROJECT = 'MAE';
    assert.equal(inferProjectKey(dir), 'ATL', 'per-workspace context overrides global env');
  } finally {
    if (orig === undefined) delete process.env.JIRA_DEFAULT_PROJECT;
    else process.env.JIRA_DEFAULT_PROJECT = orig;
  }
});

test('T1: inferProjectKey reads aggregate tasks[] format', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, '.jira-context.json'),
    JSON.stringify({ tasks: [{ taskId: 'ATL-491' }, { taskId: 'ATL-492' }] }), 'utf8');
  const orig = process.env.JIRA_DEFAULT_PROJECT;
  delete process.env.JIRA_DEFAULT_PROJECT;
  try {
    assert.equal(inferProjectKey(dir), 'ATL');
  } finally {
    if (orig !== undefined) process.env.JIRA_DEFAULT_PROJECT = orig;
  }
});

test('T1: inferProjectKey reads .jira-context.json taskId prefix when env not set', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, '.jira-context.json'),
    JSON.stringify({ taskId: 'MYPRJ-123' }),
    'utf8'
  );

  const orig = process.env.JIRA_DEFAULT_PROJECT;
  delete process.env.JIRA_DEFAULT_PROJECT;
  try {
    const pk = inferProjectKey(dir);
    assert.equal(pk, 'MYPRJ');
  } finally {
    if (orig !== undefined) process.env.JIRA_DEFAULT_PROJECT = orig;
  }
});

test('T1: inferProjectKey returns null when no env or context file', () => {
  const dir = tmpDir();
  const orig = process.env.JIRA_DEFAULT_PROJECT;
  delete process.env.JIRA_DEFAULT_PROJECT;
  try {
    assert.equal(inferProjectKey(dir), null);
  } finally {
    if (orig !== undefined) process.env.JIRA_DEFAULT_PROJECT = orig;
  }
});

test('T1: discoverSpaces handles loadAndPrune failure gracefully', () => {
  const mod = {
    loadAndPrune() { throw new Error('fail'); },
  };
  const spaces = discoverSpaces(mod);
  assert.deepEqual(spaces, [], 'should return [] on loadAndPrune error');
});
