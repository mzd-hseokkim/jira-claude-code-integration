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
 * Walk up from startDir looking for a file with the given relative path.
 * Returns the absolute file path on first hit, or null if reached filesystem
 * root without finding it. Stops at root.
 *
 * 사용 의도: cwd가 워크스페이스의 서브디렉토리(예: scripts/dashboard/web)일
 * 때도 `.mcp.json`/`.claude/settings.local.json` 같은 프로젝트 루트 설정
 * 파일을 찾을 수 있도록 한다.
 */
function findFileUp(startDir, relPath) {
  if (typeof startDir !== 'string' || !path.isAbsolute(startDir)) return null;
  let current = startDir;
  while (true) {
    const candidate = path.join(current, relPath);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // not found at this level, keep walking
    }
    const parent = path.dirname(current);
    if (parent === current) return null; // filesystem root
    current = parent;
  }
}

/**
 * Step 2: walk up from workspaceRoot looking for .mcp.json — project-level
 * mcp config. Walk-up은 cwd가 워크스페이스 서브디렉토리여도 동작하도록 함.
 */
function tryMcpJson(workspaceRoot) {
  const filePath = findFileUp(workspaceRoot, '.mcp.json');
  if (!filePath) return null;
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
  // path separator 정규화 — registry는 '\', ~/.claude.json projects 키는 '/'를 쓸 수 있다.
  const projects = data.projects || {};
  const projEntry =
    projects[workspaceRoot] ||
    projects[workspaceRoot.replace(/\\/g, '/')] ||
    projects[workspaceRoot.replace(/\//g, '\\')];
  if (projEntry) {
    const projCreds = extractFromMcpServers(projEntry.mcpServers);
    if (projCreds) return { ...projCreds, source: 'claudeJsonProj' };
  }

  return null;
}

/**
 * Step 5a: walk up from workspaceRoot looking for .claude/settings.local.json
 */
function trySettingsLocal(workspaceRoot) {
  const filePath = findFileUp(workspaceRoot, path.join('.claude', 'settings.local.json'));
  if (!filePath) return null;
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
/**
 * Run the 5-step priority chain without caching or throwing.
 * Returns null on miss. Use this for per-workspace resolution where the
 * shared loadCredentials cache must not be touched.
 *
 * @param {{ workspaceRoot?: string }} [opts]
 * @returns {{ jiraUrl: string, email: string, apiToken: string, source: string }|null}
 */
function resolveCredentials(opts = {}) {
  const workspaceRoot = opts.workspaceRoot || process.cwd();
  return (
    tryEnv() ||
    tryMcpJson(workspaceRoot) ||
    tryClaudeJson(workspaceRoot) ||
    trySettingsLocal(workspaceRoot) ||
    trySettingsGlobal() ||
    null
  );
}

function loadCredentials(opts = {}) {
  if (_cache && !opts.force) return _cache;

  const result = resolveCredentials(opts);
  if (!result) throw new CredentialsNotFoundError();

  _cache = result;
  return _cache;
}

module.exports = { loadCredentials, resolveCredentials, CredentialsNotFoundError };
