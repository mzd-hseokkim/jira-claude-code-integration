'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DEFAULT_POLL_INTERVAL_MS = 30_000;

/**
 * Parse `git worktree list --porcelain` stdout.
 * Returns array of { path, branch } objects.
 * branch is null for detached HEAD.
 *
 * @param {string} stdout
 * @returns {{ path: string, branch: string|null }[]}
 */
function parseGitWorktreeList(stdout) {
  const results = [];
  let current = null;

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.startsWith('worktree ')) {
      if (current) results.push(current);
      current = { path: line.slice('worktree '.length), branch: null };
    } else if (line.startsWith('branch ') && current) {
      // e.g. "branch refs/heads/main" → "main"
      const ref = line.slice('branch '.length);
      const match = ref.match(/^refs\/heads\/(.+)$/);
      current.branch = match ? match[1] : ref;
    } else if (line === 'detached' && current) {
      current.branch = null;
    } else if (line === '' && current) {
      results.push(current);
      current = null;
    }
  }
  if (current) results.push(current);

  return results;
}

/**
 * Read and parse .jira-context.json from a worktree path.
 * Returns enriched context object or null (file absent or parse error).
 * Fallback priority for each field: top-level → cachedIssue → default.
 * On parse error, calls logger.warn if logger is provided.
 *
 * @param {string} worktreePath
 * @param {{ warn: Function }|null} [logger]
 * @returns {{ taskId: string|null, cachedIssue: object|null, lastFetchedAt: string|null, completedSteps: string[], summary: string|null, priority: string|null, status: string|null, epic: string|null }|null}
 */
// 스킬이 mcp__atlassian__jira_get_issue 응답을 그대로 cachedIssue에 박는 경우
// assignee/issuetype/status/priority가 raw 객체({name}, {display_name})로 남아
// dashboard 렌더에서 React #31을 유발한다. 읽는 경계에서 string으로 정규화.
function _pickName(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    return v.displayName || v.display_name || v.name || null;
  }
  return null;
}

function _normalizeCachedIssue(ci) {
  if (!ci || typeof ci !== 'object') return ci;
  const out = { ...ci };
  if ('assignee' in out) out.assignee = _pickName(out.assignee);
  if ('issuetype' in out) out.issuetype = _pickName(out.issuetype);
  if ('status' in out) out.status = _pickName(out.status);
  if ('priority' in out) out.priority = _pickName(out.priority);
  if ('epic' in out && typeof out.epic === 'object') out.epic = out.epic?.key ?? null;
  return out;
}

function readJiraContext(worktreePath, logger = null) {
  const ctxPath = path.join(worktreePath, '.jira-context.json');
  let raw;
  try {
    raw = fs.readFileSync(ctxPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    logger && logger.warn('jira-context.read-error', { path: ctxPath, error: err.message });
    return null;
  }

  try {
    const obj = JSON.parse(raw);
    // aggregate 포맷: 활성 작업 정보가 top-level이 아닌 activeTask에 들어있다.
    const at = (obj.activeTask && typeof obj.activeTask === 'object') ? obj.activeTask : null;
    const rawCi = obj.cachedIssue || (at && at.cachedIssue) || null;
    const ci = (rawCi && typeof rawCi === 'object') ? _normalizeCachedIssue(rawCi) : null;
    const steps = Array.isArray(obj.completedSteps) ? obj.completedSteps
      : (at && Array.isArray(at.completedSteps)) ? at.completedSteps
      : [];
    return {
      taskId: obj.taskId || at?.taskId || null,
      cachedIssue: ci,
      lastFetchedAt: ci && ci.fetchedAt ? ci.fetchedAt : null,
      completedSteps: steps,
      summary: obj.summary || at?.summary || ci?.summary || null,
      priority: obj.priority || at?.priority || ci?.priority || null,
      status: obj.status || at?.status || ci?.status || null,
      epic: obj.epic || at?.epic || ci?.epic || null,
    };
  } catch (err) {
    logger && logger.warn('jira-context.parse-error', { path: ctxPath, error: err.message });
    return null;
  }
}

/**
 * Run `git worktree list --porcelain` for a single root and build state objects.
 * Returns the set of seen paths (used for deletion candidate calculation).
 *
 * @param {object} store
 * @param {string} workspaceRoot
 * @param {object|null} logger
 * @returns {Set<string>} paths seen for this root
 */
function collectWorktreesForRoot(store, workspaceRoot, logger) {
  const log = logger && typeof logger.child === 'function'
    ? logger.child({ workspace: workspaceRoot })
    : logger;
  let stdout;
  try {
    stdout = execSync('git worktree list --porcelain', {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 10_000,
    });
  } catch (err) {
    log && log.error('git-worktree-list.failed', { workspaceRoot, error: err.message });
    console.error('[worktree] git worktree list failed:', err.message);
    return new Set();
  }

  const worktrees = parseGitWorktreeList(stdout);
  const seenPaths = new Set();

  for (const wt of worktrees) {
    // Skip the base repo worktree (main/master) — dashboard cards represent
    // feature work, and the base worktree is not a unit of work.
    if (wt.branch === 'main' || wt.branch === 'master') continue;
    seenPaths.add(wt.path);
    const ctx = readJiraContext(wt.path, log);
    const state = {
      path: wt.path,
      branch: wt.branch,
      workspaceRoot,
      taskId: ctx ? ctx.taskId : null,
      noContext: ctx === null,
      completedSteps: ctx ? ctx.completedSteps : [],
      summary: ctx ? ctx.summary : null,
      priority: ctx ? ctx.priority : null,
      status: ctx ? ctx.status : null,
      epic: ctx ? ctx.epic : null,
    };
    // cachedIssue/lastFetchedAt: jira-collector가 단독 owner. 파일에 값이
    // 있을 때만 cold-start fill용으로 전달 (store U7b 가드가 처리). 파일에
    // 없으면 키 자체를 보내지 않아 jira-collector가 채운 메모리 캐시를 보존.
    if (ctx && ctx.cachedIssue) {
      state.cachedIssue = ctx.cachedIssue;
      state.lastFetchedAt = ctx.lastFetchedAt;
    }
    store.upsertWorktree(state);
  }

  return seenPaths;
}

/**
 * Run `git worktree list --porcelain` for N workspace roots and build state objects.
 * Only removes entries that belong to one of the given roots and have disappeared.
 *
 * @param {object} store
 * @param {string[]} workspaceRoots
 * @param {object|null} logger
 */
function collectWorktrees(store, workspaceRoots, logger) {
  const allSeenPaths = new Set();

  for (const root of workspaceRoots) {
    const seenForRoot = collectWorktreesForRoot(store, root, logger);
    for (const p of seenForRoot) allSeenPaths.add(p);
  }

  // Remove worktrees that disappeared — but only those whose workspaceRoot is
  // one of the roots we just scanned (avoid touching entries from other roots).
  const rootSet = new Set(workspaceRoots);
  const snapshot = store.getSnapshot();
  for (const existing of snapshot) {
    if (rootSet.has(existing.workspaceRoot) && !allSeenPaths.has(existing.path)) {
      store.removeWorktree(existing.path);
    }
  }
}

/**
 * Start the worktree collector.
 *
 * Accepts either a single `workspaceRoot` (string, legacy) or `workspaceRoots` (string[]).
 * When both are provided, `workspaceRoots` wins.
 *
 * @param {object} store  Store instance from createStore()
 * @param {{ workspaceRoots?: string[], workspaceRoot?: string, pollIntervalMs?: number, logger?: object }} opts
 * @returns {{ stop(): void }}
 */
function startWorktreeCollector(store, opts) {
  const { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, logger = null } = opts;

  // Normalise to array — prefer workspaceRoots[], fall back to single workspaceRoot.
  const workspaceRoots = opts.workspaceRoots
    ? opts.workspaceRoots
    : [opts.workspaceRoot];

  // Initial collection
  collectWorktrees(store, workspaceRoots, logger);

  // 30s polling
  const pollTimer = setInterval(() => {
    collectWorktrees(store, workspaceRoots, logger);
  }, pollIntervalMs);
  pollTimer.unref && pollTimer.unref();

  // chokidar fs watch for .jira-context.json changes
  let watcher = null;
  let chokidar;
  try {
    chokidar = require('chokidar');
  } catch {
    logger && logger.warn('chokidar.not-installed', { msg: 'falling back to polling only' });
    console.warn('[worktree] chokidar not installed, running polling-only mode');
  }

  if (chokidar) {
    // Watch .jira-context.json files under the parent dir of each workspace root.
    // Build an array of patterns (one per root) — chokidar accepts an array.
    const patterns = workspaceRoots.map((root) => {
      const parentDir = path.dirname(root);
      return path.join(parentDir, '*', '.jira-context.json');
    });

    try {
      watcher = chokidar.watch(patterns, {
        ignoreInitial: true,
        depth: 0,
        usePolling: false,
      });

      const handleChange = (filePath) => {
        const worktreePath = path.dirname(filePath);
        const wtLog = logger && typeof logger.child === 'function'
          ? logger.child({ workspace: worktreePath })
          : logger;
        const ctx = readJiraContext(worktreePath, wtLog);
        if (ctx === null) {
          // File may have been removed or is unreadable; re-run full collect
          collectWorktrees(store, workspaceRoots, logger);
          return;
        }
        // Get current branch and workspaceRoot from snapshot
        const snapshot = store.getSnapshot();
        const existing = snapshot.find((w) => w.path === worktreePath);
        const update = {
          path: worktreePath,
          branch: existing ? existing.branch : null,
          workspaceRoot: existing ? existing.workspaceRoot : null,
          taskId: ctx.taskId,
          noContext: false,
          completedSteps: ctx.completedSteps,
          summary: ctx.summary,
          priority: ctx.priority,
          status: ctx.status,
          epic: ctx.epic,
        };
        if (ctx.cachedIssue) {
          update.cachedIssue = ctx.cachedIssue;
          update.lastFetchedAt = ctx.lastFetchedAt;
        }
        store.upsertWorktree(update);
        wtLog && wtLog.info('worktree.context-changed', { path: worktreePath });
      };

      watcher.on('change', handleChange);
      watcher.on('add', handleChange);
      watcher.on('unlink', (filePath) => {
        const worktreePath = path.dirname(filePath);
        const wtLog = logger && typeof logger.child === 'function'
          ? logger.child({ workspace: worktreePath })
          : logger;
        store.upsertWorktree({
          path: worktreePath,
          branch: null,
          workspaceRoot: null,
          taskId: null,
          cachedIssue: null,
          lastFetchedAt: null,
          noContext: true,
          completedSteps: [],
          summary: null,
          priority: null,
          status: null,
          epic: null,
        });
        wtLog && wtLog.info('worktree.context-removed', { path: worktreePath });
      });
      watcher.on('error', (err) => {
        logger && logger.error('chokidar.error', { error: err.message });
      });
    } catch (err) {
      logger && logger.error('chokidar.watch-failed', { error: err.message });
      watcher = null;
    }
  }

  return {
    stop() {
      clearInterval(pollTimer);
      if (watcher) watcher.close();
    },
  };
}

module.exports = { startWorktreeCollector, parseGitWorktreeList, readJiraContext, collectWorktrees };
