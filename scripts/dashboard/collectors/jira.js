'use strict';

const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_TICK_MS = 60 * 1000;       // check every 1 minute
const DEFAULT_BACKOFF_MS = 100;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch a single Jira issue via REST API.
 *
 * @param {{ jiraUrl: string, email: string, apiToken: string }} creds
 * @param {string} key  Issue key, e.g. "MAE-123"
 * @returns {Promise<object>}  Jira issue object
 * @throws  On non-2xx response (includes status in error)
 */
async function fetchIssue(creds, key) {
  const url = `${creds.jiraUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(key)}` +
    '?fields=summary,status,priority,assignee,issuetype,description';

  const auth = Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const err = new Error(`Jira REST ${response.status} for ${key}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

/**
 * Sleep helper.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the Jira stale-refresh collector.
 *
 * @param {object} store
 * @param {{ staleMs?: number, tickMs?: number, backoffMs?: number, logger?: object, getCredentials: Function }} opts
 * @returns {{ stop(): void }}
 */
function startJiraCollector(store, opts) {
  const {
    staleMs = DEFAULT_STALE_MS,
    tickMs = DEFAULT_TICK_MS,
    backoffMs = DEFAULT_BACKOFF_MS,
    logger = null,
    getCredentials,
    onTick = null,
  } = opts;

  let stopped = false;
  let tickTimer = null;

  async function runCycle() {
    if (stopped) return;
    if (typeof onTick === 'function') {
      try { onTick({ at: Date.now(), tickMs }); } catch {}
    }

    const stale = store.getStaleEntries(staleMs);
    if (stale.length === 0) return;

    let creds;
    try {
      creds = getCredentials();
    } catch (err) {
      logger && logger.error('jira-collector.credentials-error', { error: err.message });
      return;
    }

    for (const entry of stale) {
      if (stopped) break;
      if (!entry.taskId) continue;

      try {
        const issue = await fetchIssue(creds, entry.taskId);
        store.updateCachedIssue(entry.path, {
          key: issue.key,
          summary: issue.fields && issue.fields.summary,
          status: issue.fields && issue.fields.status && issue.fields.status.name,
          priority: issue.fields && issue.fields.priority && issue.fields.priority.name,
          assignee: issue.fields && issue.fields.assignee
            ? (issue.fields.assignee.displayName || issue.fields.assignee.emailAddress)
            : 'Unassigned',
          issuetype: issue.fields && issue.fields.issuetype && issue.fields.issuetype.name,
          fetchedAt: new Date().toISOString(),
        });
        logger && logger.info('jira-collector.refreshed', { path: entry.path, key: entry.taskId });
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          // Auth failure — abort this cycle entirely
          logger && logger.error('jira-collector.auth-error', { key: entry.taskId, status: err.status });
          return;
        }
        if (err.status === 429) {
          // Rate limit — abort this cycle, next tick will retry
          logger && logger.error('jira-collector.rate-limited', { key: entry.taskId });
          return;
        }
        // 5xx / timeout / network — skip this entry, continue
        logger && logger.warn('jira-collector.fetch-error', { key: entry.taskId, error: err.message });
      }

      // Sequential backoff between requests
      await sleep(backoffMs);
    }
  }

  function scheduleTick() {
    tickTimer = setTimeout(async () => {
      try {
        await runCycle();
      } catch (err) {
        logger && logger.error('jira-collector.cycle-error', { error: err.message });
      }
      if (!stopped) scheduleTick();
    }, tickMs);
    if (tickTimer.unref) tickTimer.unref();
  }

  // Run an initial cycle immediately to fill cold-start entries.
  // Subsequent cycles are scheduled by scheduleTick() at every `tickMs` interval.
  (async () => {
    try {
      await runCycle();
    } catch (err) {
      logger && logger.error('jira-collector.cycle-error', { error: err.message });
    }
    if (!stopped) scheduleTick();
  })();

  return {
    stop() {
      stopped = true;
      clearTimeout(tickTimer);
    },
  };
}

module.exports = { startJiraCollector, fetchIssue };
