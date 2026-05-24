'use strict';

/**
 * jira-metrics.js
 *
 * Analytics용 metrics collector.
 * 스페이스(project)별 JQL을 5분 tick으로 실행, 결과를 metrics store에 upsert.
 *
 * 기존 collectors/jira.js(worktree 단건 stale-refresh)와 완전히 분리된 모듈.
 * 생명주기: startMetricsCollector() → { stop() }
 */

const DEFAULT_TICK_MS = 5 * 60 * 1000; // 5분
const DEFAULT_BACKOFF_BASE_MS = 2_000;
const FETCH_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;
const JQL_WINDOW_DAYS = 90;

// 수집 필드 목록
const FIELDS = [
  'key', 'summary', 'status', 'priority', 'assignee', 'issuetype',
  'created', 'resolutiondate', 'updated', 'parent',
].join(',');

// ---------------------------------------------------------------------------
// Jira REST helpers
// ---------------------------------------------------------------------------

function makeAuthHeader(creds) {
  return `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64')}`;
}

/**
 * Jira JQL 검색 (단일 페이지).
 *
 * 신 enhanced search 엔드포인트(`/rest/api/3/search/jql`)를 사용한다.
 * 구 `/rest/api/3/search`는 Jira Cloud에서 폐기되어 410 Gone을 반환한다.
 * 페이지네이션은 startAt/total이 아닌 nextPageToken 기반.
 *
 * @param {object} creds
 * @param {string} jql
 * @param {string|null} nextPageToken
 * @returns {Promise<{ issues: object[], nextPageToken?: string, isLast?: boolean }>}
 */
async function fetchJqlPage(creds, jql, nextPageToken = null) {
  const base = creds.jiraUrl.replace(/\/$/, '');
  const url = `${base}/rest/api/3/search/jql`;

  const payload = {
    jql,
    maxResults: PAGE_SIZE,
    fields: FIELDS.split(','),
  };
  if (nextPageToken) payload.nextPageToken = nextPageToken;
  const body = JSON.stringify(payload);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(creds),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const err = new Error(`Jira JQL HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

/**
 * JQL 전체 페이지네이션 fetch. 429/401/403 발생 시 즉시 throw.
 *
 * @param {object} creds
 * @param {string} jql
 * @param {{ backoffBaseMs?: number, logger?: object }} opts
 * @returns {Promise<object[]>}  Jira issue 객체 배열
 */
async function fetchAllIssues(creds, jql, opts = {}) {
  const backoffBaseMs = opts.backoffBaseMs || DEFAULT_BACKOFF_BASE_MS;
  const logger = opts.logger || null;

  let nextPageToken = null;
  const allIssues = [];

  while (true) {
    let page;
    try {
      page = await fetchJqlPage(creds, jql, nextPageToken);
    } catch (err) {
      if (err.status === 429 || err.status === 401 || err.status === 403) {
        throw err; // 호출측에서 tick abort
      }
      logger && logger.warn('jira-metrics.page-error', { jql, error: err.message });
      // 일시 오류 — 이 페이지 건너뜀 (partial result)
      break;
    }

    if (Array.isArray(page.issues)) allIssues.push(...page.issues);

    // nextPageToken 부재 또는 isLast면 마지막 페이지
    if (page.isLast || !page.nextPageToken) break;
    nextPageToken = page.nextPageToken;

    // rate-limit 방지용 작은 지연
    await sleep(backoffBaseMs);
  }

  return allIssues;
}

// ---------------------------------------------------------------------------
// Issue → metrics row 변환
// ---------------------------------------------------------------------------

function issueToRow(issue, spaceId) {
  const f = issue.fields || {};
  return {
    issueKey: issue.key,
    spaceId,
    summary: f.summary || null,
    status: f.status && f.status.name ? f.status.name : null,
    statusCategory: f.status && f.status.statusCategory ? f.status.statusCategory.key : null,
    priority: f.priority && f.priority.name ? f.priority.name : null,
    assignee: f.assignee
      ? (f.assignee.displayName || f.assignee.emailAddress || null)
      : null,
    issuetype: f.issuetype && f.issuetype.name ? f.issuetype.name : null,
    created: f.created || null,
    resolutiondate: f.resolutiondate || null,
    updated: f.updated || null,
    parent: f.parent && f.parent.key ? f.parent.key : null,
    // Epic: parent가 Epic(hierarchyLevel 1)이면 그 key, 아니면 null.
    // 이 Jira 인스턴스는 Epic 계층이 없어 실질적으로 항상 null (graceful degrade).
    epic: (f.parent && f.parent.fields && f.parent.fields.issuetype &&
       f.parent.fields.issuetype.hierarchyLevel === 1 ? f.parent.key : null),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the Jira metrics collector.
 *
 * @param {object} metricsStore  createMetricsStore() 반환값
 * @param {{
 *   getSpaces: () => Array<{id:string, site:string, projectKey:string, credsOk:boolean}>,
 *   getCredentials: () => {jiraUrl:string,email:string,apiToken:string},
 *   tickMs?: number,
 *   backoffBaseMs?: number,
 *   logger?: object,
 *   onTick?: (info: {at:number, tickMs:number}) => void,
 * }} opts
 * @returns {{ stop(): void }}
 */
function startMetricsCollector(metricsStore, opts) {
  const {
    getSpaces,
    getCredentials,
    tickMs = DEFAULT_TICK_MS,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
    logger = null,
    onTick = null,
  } = opts;

  let stopped = false;
  let tickTimer = null;

  async function runCycle() {
    if (stopped) return;

    const tickStart = Date.now();
    if (typeof onTick === 'function') {
      try { onTick({ at: tickStart, tickMs }); } catch { /* ignore */ }
    }

    let spaces;
    try {
      spaces = getSpaces();
    } catch (err) {
      logger && logger.warn('jira-metrics.get-spaces-error', { error: err.message });
      return;
    }

    let creds;
    try {
      creds = getCredentials();
    } catch (err) {
      logger && logger.warn('jira-metrics.no-credentials', { error: err.message });
      return;
    }

    for (const space of spaces) {
      if (stopped) break;
      if (!space.credsOk || !space.projectKey || space.projectKey === 'unknown') continue;

      const jql = `project = "${space.projectKey}" AND updated >= -${JQL_WINDOW_DAYS}d ORDER BY updated DESC`;

      logger && logger.info('jira-metrics.collect-start', { spaceId: space.id, projectKey: space.projectKey });

      let issues;
      try {
        issues = await fetchAllIssues(creds, jql, { backoffBaseMs, logger });
      } catch (err) {
        if (err.status === 429) {
          logger && logger.warn('jira-metrics.rate-limited', { spaceId: space.id });
          return; // tick abort
        }
        if (err.status === 401 || err.status === 403) {
          logger && logger.error('jira-metrics.auth-error', { spaceId: space.id, status: err.status });
          return; // tick abort
        }
        logger && logger.warn('jira-metrics.collect-error', { spaceId: space.id, error: err.message });
        continue;
      }

      const rows = issues.map((issue) => issueToRow(issue, space.id));

      try {
        metricsStore.upsertIssues(rows);
        logger && logger.info('jira-metrics.collect-done', {
          spaceId: space.id,
          count: rows.length,
        });
      } catch (err) {
        logger && logger.error('jira-metrics.upsert-error', { spaceId: space.id, error: err.message });
      }
    }
  }

  function schedule() {
    if (stopped) return;
    tickTimer = setTimeout(async () => {
      try { await runCycle(); } catch (err) {
        logger && logger.error('jira-metrics.cycle-error', { error: err.message });
      }
      schedule();
    }, tickMs);
  }

  // 첫 tick은 즉시 실행 (서버 기동 직후 데이터 확보)
  runCycle().catch((err) => {
    logger && logger.error('jira-metrics.initial-cycle-error', { error: err.message });
  }).finally(() => {
    schedule();
  });

  return {
    stop() {
      stopped = true;
      if (tickTimer !== null) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
    },
  };
}

module.exports = { startMetricsCollector };
