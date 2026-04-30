'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { loadCredentials, CredentialsNotFoundError } = require('../credentials');

// Helper: create a temp workspace dir
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mae209-creds-'));
}

// Helper: clean env vars and force cache refresh
function withCleanEnv(fn) {
  const saved = {
    JIRA_URL: process.env.JIRA_URL,
    JIRA_USERNAME: process.env.JIRA_USERNAME,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
  };
  delete process.env.JIRA_URL;
  delete process.env.JIRA_USERNAME;
  delete process.env.JIRA_API_TOKEN;
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// U5: env vars take priority over .mcp.json
test('U5: env vars take priority over .mcp.json', () => {
  const dir = tmpDir();
  // Write .mcp.json with different token
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      atlassian: { env: { JIRA_URL: 'https://mcp.example.com', JIRA_USERNAME: 'mcp@ex.com', JIRA_API_TOKEN: 'mcp-token' } },
    },
  }));

  process.env.JIRA_URL = 'https://env.example.com';
  process.env.JIRA_USERNAME = 'env@ex.com';
  process.env.JIRA_API_TOKEN = 'env-token';
  try {
    const creds = loadCredentials({ workspaceRoot: dir, force: true });
    assert.equal(creds.source, 'env');
    assert.equal(creds.jiraUrl, 'https://env.example.com');
  } finally {
    delete process.env.JIRA_URL;
    delete process.env.JIRA_USERNAME;
    delete process.env.JIRA_API_TOKEN;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// U6: falls back to .mcp.json when env is absent
test('U6: falls back to .mcp.json when env is absent', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      atlassian: { env: { JIRA_URL: 'https://mcp.example.com', JIRA_USERNAME: 'mcp@ex.com', JIRA_API_TOKEN: 'mcp-token' } },
    },
  }));

  withCleanEnv(() => {
    const creds = loadCredentials({ workspaceRoot: dir, force: true });
    assert.equal(creds.source, 'mcpJson');
    assert.equal(creds.jiraUrl, 'https://mcp.example.com');
  });

  fs.rmSync(dir, { recursive: true, force: true });
});

// U7: throws CredentialsNotFoundError when all sources miss
test('U7: throws CredentialsNotFoundError when all sources miss', () => {
  const dir = tmpDir();
  // No .mcp.json, no other files in a temp workspace

  withCleanEnv(() => {
    // Provide a fake workspaceRoot so it won't accidentally find real files
    assert.throws(
      () => loadCredentials({ workspaceRoot: dir, force: true }),
      (err) => err instanceof CredentialsNotFoundError
    );
  });

  fs.rmSync(dir, { recursive: true, force: true });
});

// U8: second call returns cached result without re-reading fs (mock spy)
test('U8: second call uses cache (no extra fs.readFileSync calls)', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      atlassian: { env: { JIRA_URL: 'https://cached.example.com', JIRA_USERNAME: 'u@e.com', JIRA_API_TOKEN: 'tok' } },
    },
  }));

  withCleanEnv(() => {
    // First call (force=true to ensure fresh)
    const first = loadCredentials({ workspaceRoot: dir, force: true });
    assert.equal(first.source, 'mcpJson');

    // Spy on fs.readFileSync
    let readCount = 0;
    const orig = fs.readFileSync;
    fs.readFileSync = (...args) => { readCount++; return orig.apply(fs, args); };
    try {
      const second = loadCredentials({ workspaceRoot: dir });
      assert.equal(readCount, 0, 'should not call fs.readFileSync on second call');
      assert.equal(second.jiraUrl, first.jiraUrl);
    } finally {
      fs.readFileSync = orig;
    }
  });

  fs.rmSync(dir, { recursive: true, force: true });
});
