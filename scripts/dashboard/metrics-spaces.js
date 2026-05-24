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
const { resolveCredentials } = require('./credentials');

/**
 * 워크스페이스 경로에서 Jira project key를 추론한다.
 * 1. .jira-context.json 컨텍스트 prefix (단일 taskId/parent + aggregate tasks[]/epic)
 * 2. JIRA_DEFAULT_PROJECT 환경변수 (폴백)
 * 3. null (추론 실패)
 *
 * env를 폴백으로 둬야 멀티 워크스페이스(MAE/ATL)가 각자 키로 해석된다.
 * env 1순위면 모든 워크스페이스가 한 키로 뭉개진다.
 *
 * @param {string} workspacePath
 * @returns {string|null}
 */
function inferProjectKey(workspacePath) {
  // 1. .jira-context.json 컨텍스트에서 project key prefix
  try {
    const ctxFile = path.join(workspacePath, '.jira-context.json');
    if (fs.existsSync(ctxFile)) {
      const ctx = JSON.parse(fs.readFileSync(ctxFile, 'utf8'));
      const candidates = [ctx.taskId, ctx.parent, ctx.epic];
      if (Array.isArray(ctx.tasks)) {
        for (const t of ctx.tasks) candidates.push(t.taskId, t.parent);
      }
      for (const c of candidates) {
        if (typeof c === 'string') {
          const match = c.match(/^([A-Z][A-Z0-9]*)-\d+$/);
          if (match) return match[1];
        }
      }
    }
  } catch {
    // 추론 실패 — env 폴백으로
  }

  // 2. 환경변수 폴백
  if (process.env.JIRA_DEFAULT_PROJECT) {
    return process.env.JIRA_DEFAULT_PROJECT.trim().toUpperCase();
  }

  return null;
}

/**
 * 등록된 워크스페이스 목록에서 (site, projectKey) 쌍을 도출한다.
 *
 * credential·site는 워크스페이스별로 전체 체인(env → 로컬 .mcp.json →
 * ~/.claude.json → settings)으로 해석한다. 로컬 .mcp.json을 쓰는 프로젝트와
 * home 전역 설정을 쓰는 프로젝트가 섞여 있어도 각자 해석된다.
 *
 * @param {object} workspacesModule  workspaces.js 모듈 (DI 가능 — 테스트 지원)
 * @param {{ logger?: object, site?: string, resolveCreds?: (path:string)=>object|null }} [opts]
 *   resolveCreds: credential resolver 주입 (테스트 결정성). 기본은 resolveCredentials.
 *   site: 워크스페이스별 해석 실패 시 폴백 site.
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
  const resolveCreds = opts.resolveCreds || ((wsPath) => {
    try { return resolveCredentials({ workspaceRoot: wsPath }); } catch { return null; }
  });
  const fallbackSite = (opts.site || process.env.JIRA_URL || '').replace(/\/$/, '');

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
      // 미해석 스페이스는 등록하지 않음 — SPACE 선택기 오염 방지
      logger && logger.warn('metrics-spaces.no-project-key', { path: workspacePath });
      continue;
    }

    const creds = resolveCreds(workspacePath);
    const credsOk = !!creds;
    const site = ((creds && creds.jiraUrl) || fallbackSite || '').replace(/\/$/, '') || 'unknown';

    const dedupeKey = `${site}::${projectKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    spaces.push({
      id: dedupeKey,
      site,
      projectKey,
      credsOk,
      workspacePath,
    });
  }

  return spaces;
}

module.exports = { discoverSpaces, inferProjectKey };
