'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

class CredentialsNotFoundError extends Error {
  constructor() {
    super(
      'Jira credentials not found. Checked: env vars, .mcp.json, ~/.claude.json, ' +
      '.claude/settings.local.json, ~/.claude/settings.json. ' +
      'Set JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN env vars or configure mcp-atlassian.'
    );
    this.name = 'CredentialsNotFoundError';
  }
}

// Cached result (server-lifecycle singleton). force=true를 사용하면 무효화.
let _cache = null;

/**
 * Read JSON from filePath safely. Returns null on any error.
 */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Extract jiraUrl/email/apiToken from an mcp-atlassian env block.
 * Works for both .mcp.json mcpServers[name].env and settings.json mcpServers[name].env.
 */
function extractFromMcpEnv(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // obj could be { JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN } directly
  const url = obj.JIRA_URL;
  const username = obj.JIRA_USERNAME;
  const apiToken = obj.JIRA_API_TOKEN;
  if (url && username && apiToken) return { jiraUrl: url, email: username, apiToken };
  return null;
}

/**
 * Search through mcpServers entries for atlassian env block.
 */
function extractFromMcpServers(mcpServers) {
  if (!mcpServers || typeof mcpServers !== 'object') return null;
  for (const srv of Object.values(mcpServers)) {
    const creds = extractFromMcpEnv(srv && srv.env);
    if (creds) return creds;
  }
  return null;
}

/**
 * Step 1: env vars
 */
function tryEnv() {
  const url = process.env.JIRA_URL;
  const username = process.env.JIRA_USERNAME;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (url && username && apiToken) {
    return { jiraUrl: url, email: username, apiToken, source: 'env' };
  }
  return null;
}

/**
 * Step 2: <workspaceRoot>/.mcp.json — project-level mcp config
 */
function tryMcpJson(workspaceRoot) {
  const filePath = path.join(workspaceRoot, '.mcp.json');
  const data = readJsonSafe(filePath);
  if (!data) return null;
  const creds = extractFromMcpServers(data.mcpServers);
  if (creds) return { ...creds, source: 'mcpJson' };
  return null;
}

/**
 * Step 3 & 4: ~/.claude.json — top-level keys and projects[path] keys
 */
function tryClaudeJson(workspaceRoot) {
  const filePath = path.join(os.homedir(), '.claude.json');
  const data = readJsonSafe(filePath);
  if (!data) return null;

  // Step 3: top-level mcpServers
  const topCreds = extractFromMcpServers(data.mcpServers);
  if (topCreds) return { ...topCreds, source: 'claudeJsonTop' };

  // Step 4: projects[workspaceRoot].mcpServers
  const projEntry = data.projects && data.projects[workspaceRoot];
  if (projEntry) {
    const projCreds = extractFromMcpServers(projEntry.mcpServers);
    if (projCreds) return { ...projCreds, source: 'claudeJsonProj' };
  }

  return null;
}

/**
 * Step 5a: <workspaceRoot>/.claude/settings.local.json
 */
function trySettingsLocal(workspaceRoot) {
  const filePath = path.join(workspaceRoot, '.claude', 'settings.local.json');
  const data = readJsonSafe(filePath);
  if (!data) return null;
  const creds = extractFromMcpServers(data.mcpServers);
  if (creds) return { ...creds, source: 'settingsLocal' };
  return null;
}

/**
 * Step 5b: ~/.claude/settings.json — global settings
 */
function trySettingsGlobal() {
  const filePath = path.join(os.homedir(), '.claude', 'settings.json');
  const data = readJsonSafe(filePath);
  if (!data) return null;
  const creds = extractFromMcpServers(data.mcpServers);
  if (creds) return { ...creds, source: 'settingsGlobal' };
  return null;
}

/**
 * Load Jira credentials via 5-step priority chain.
 * Result is cached for the server lifecycle. Pass force=true to bypass cache (test use).
 *
 * @param {{ workspaceRoot?: string, force?: boolean }} [opts]
 * @returns {{ jiraUrl: string, email: string, apiToken: string, source: string }}
 * @throws {CredentialsNotFoundError}
 */
function loadCredentials(opts = {}) {
  if (_cache && !opts.force) return _cache;

  const workspaceRoot = opts.workspaceRoot || process.cwd();

  const result =
    tryEnv() ||
    tryMcpJson(workspaceRoot) ||
    tryClaudeJson(workspaceRoot) ||
    trySettingsLocal(workspaceRoot) ||
    trySettingsGlobal();

  if (!result) throw new CredentialsNotFoundError();

  _cache = result;
  return _cache;
}

module.exports = { loadCredentials, CredentialsNotFoundError };
