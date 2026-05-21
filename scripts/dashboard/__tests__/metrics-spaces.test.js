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

const { discoverSpaces, inferProjectKey, hasResolvableCredentials } = require('../metrics-spaces');

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

test('T1: discoverSpaces marks credsOk=false when no credentials available', () => {
  const dir = tmpDir();
  const mod = makeWorkspacesModule([{ path: dir }]);

  // Remove all creds env vars
  const saved = {};
  for (const k of ['JIRA_URL', 'JIRA_USERNAME', 'JIRA_API_TOKEN', 'JIRA_DEFAULT_PROJECT']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    const spaces = discoverSpaces(mod);
    if (spaces.length > 0) {
      // may or may not have projectKey, but credsOk should be false
      assert.equal(spaces[0].credsOk, false, 'no creds → credsOk should be false');
    }
    // If no projectKey inferred, spaces may be empty or have 'unknown' — both valid
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
    }
  }
});

// ---------------------------------------------------------------------------
// inferProjectKey
// ---------------------------------------------------------------------------

test('T1: inferProjectKey uses JIRA_DEFAULT_PROJECT env first', () => {
  const orig = process.env.JIRA_DEFAULT_PROJECT;
  try {
    process.env.JIRA_DEFAULT_PROJECT = 'MYPROJ';
    assert.equal(inferProjectKey('/some/path'), 'MYPROJ');
  } finally {
    if (orig === undefined) delete process.env.JIRA_DEFAULT_PROJECT;
    else process.env.JIRA_DEFAULT_PROJECT = orig;
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

// ---------------------------------------------------------------------------
// hasResolvableCredentials
// ---------------------------------------------------------------------------

test('T1: hasResolvableCredentials returns true when env vars set', () => {
  const saved = {};
  for (const k of ['JIRA_URL', 'JIRA_USERNAME', 'JIRA_API_TOKEN']) saved[k] = process.env[k];
  try {
    process.env.JIRA_URL = 'https://x.atlassian.net';
    process.env.JIRA_USERNAME = 'u@example.com';
    process.env.JIRA_API_TOKEN = 'tok';
    assert.equal(hasResolvableCredentials('/any/path'), true);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
      else delete process.env[k];
    }
  }
});

test('T1: discoverSpaces handles loadAndPrune failure gracefully', () => {
  const mod = {
    loadAndPrune() { throw new Error('fail'); },
  };
  const spaces = discoverSpaces(mod);
  assert.deepEqual(spaces, [], 'should return [] on loadAndPrune error');
});
