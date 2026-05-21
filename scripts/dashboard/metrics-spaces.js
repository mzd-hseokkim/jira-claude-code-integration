'use strict';

/**
 * metrics-spaces.js
 *
 * 등록된 워크스페이스 레지스트리에서 (site, projectKey) 쌍을 도출·dedupe한다.
 *
 * 규칙:
 *  - projectKey 도출: JIRA_DEFAULT_PROJECT env → 없으면 워크스페이스 경로에서
 *    이슈 key 접두사 추론 (TODO 파일 스캔 기반, 우선 env 폴백)
 *  - credentials 해석 가능 여부를 credsOk 플래그로 표기
 *  - (site, projectKey) dedupe: 중복은 첫 번째 엔트리만 유지
 */

const path = require('node:path');
const fs = require('node:fs');

/**
 * 워크스페이스 경로에서 Jira project key를 추론한다.
 * 1. JIRA_DEFAULT_PROJECT 환경변수
 * 2. .jira-context.json 의 taskId prefix
 * 3. null (추론 실패)
 *
 * @param {string} workspacePath
 * @returns {string|null}
 */
function inferProjectKey(workspacePath) {
  // 1. 환경변수
  if (process.env.JIRA_DEFAULT_PROJECT) {
    return process.env.JIRA_DEFAULT_PROJECT.trim().toUpperCase();
  }

  // 2. .jira-context.json 에서 taskId prefix
  try {
    const ctxFile = path.join(workspacePath, '.jira-context.json');
    if (fs.existsSync(ctxFile)) {
      const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
      const taskId = ctx.taskId || ctx.parent;
      if (taskId && typeof taskId === 'string') {
        const match = taskId.match(/^([A-Z][A-Z0-9]*)-\d+$/);
        if (match) return match[1];
      }
    }
  } catch {
    // 추론 실패 — 다음 단계로
  }

  return null;
}

/**
 * credentials 해석 가능 여부를 확인한다.
 * loadCredentials를 직접 호출하지 않고, env/파일 존재 여부만 빠르게 판단.
 *
 * @param {string} workspacePath
 * @returns {boolean}
 */
function hasResolvableCredentials(workspacePath) {
  // 환경변수 체크 (가장 빠름)
  if (process.env.JIRA_URL && process.env.JIRA_USERNAME && process.env.JIRA_API_TOKEN) {
    return true;
  }

  // .mcp.json 존재 여부 (walk-up은 생략 — 근사값으로 충분)
  try {
    const mcpFile = path.join(workspacePath, '.mcp.json');
    if (fs.existsSync(mcpFile)) {
      const data = JSON.parse(fs.readFileSync(mcpFile, 'utf8'));
      const servers = data && data.mcpServers;
      if (servers && typeof servers === 'object') {
        for (const srv of Object.values(servers)) {
          const env = srv && srv.env;
          if (env && env.JIRA_URL && env.JIRA_USERNAME && env.JIRA_API_TOKEN) return true;
        }
      }
    }
  } catch { /* ignore */ }

  return false;
}

/**
 * 등록된 워크스페이스 목록에서 (site, projectKey) 쌍을 도출한다.
 *
 * @param {object} workspacesModule  workspaces.js 모듈 (DI 가능 — 테스트 지원)
 * @param {{ logger?: object }} [opts]
 * @returns {Array<{
 *   id: string,
 *   site: string,
 *   projectKey: string,
 *   credsOk: boolean,
 *   workspacePath: string,
 * }>}
 */
function discoverSpaces(workspacesModule, opts = {}) {
  const logger = opts.logger || null;

  let entries;
  try {
    const { workspaces } = workspacesModule.loadAndPrune({ logger });
    entries = workspaces;
  } catch (err) {
    logger && logger.warn('metrics-spaces.loadAndPrune-failed', { error: err.message });
    return [];
  }

  const seen = new Set(); // (site::projectKey) dedupe
  const spaces = [];

  for (const entry of entries) {
    const workspacePath = entry.path;

    const projectKey = inferProjectKey(workspacePath);
    if (!projectKey) {
      logger && logger.warn('metrics-spaces.no-project-key', { path: workspacePath });
      // 미해석 스페이스도 포함 — credsOk=false, projectKey='unknown'으로 표기
    }

    // site: JIRA_URL env → 없으면 'unknown'
    const site = (process.env.JIRA_URL || '').replace(/\/$/, '') || 'unknown';

    const pk = projectKey || 'unknown';
    const dedupeKey = `${site}::${pk}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const credsOk = hasResolvableCredentials(workspacePath);

    spaces.push({
      id: dedupeKey,
      site,
      projectKey: pk,
      credsOk,
      workspacePath,
    });
  }

  return spaces;
}

module.exports = { discoverSpaces, inferProjectKey, hasResolvableCredentials };
