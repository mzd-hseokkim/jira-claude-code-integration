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
    const ci = (obj.cachedIssue && typeof obj.cachedIssue === 'object') ? obj.cachedIssue : null;
    return {
      taskId: obj.taskId || null,
      cachedIssue: ci,
      lastFetchedAt: ci && ci.fetchedAt ? ci.fetchedAt : null,
      completedSteps: Array.isArray(obj.completedSteps) ? obj.completedSteps : [],
      summary: obj.summary || ci?.summary || null,
      priority: obj.priority || ci?.priority || null,
      status: obj.status || ci?.status || null,
      epic: obj.epic || ci?.epic || null,
    };
  } catch (err) {
    logger && logger.warn('jira-context.parse-error', { path: ctxPath, error: err.message });
    return null;
  }
}

/**
 * Run `git worktree list --porcelain` and build state objects for each worktree.
 */
function collectWorktrees(store, workspaceRoot, logger) {
  let stdout;
  try {
    stdout = execSync('git worktree list --porcelain', {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 10_000,
    });
  } catch (err) {
    logger && logger.error('git-worktree-list.failed', { error: err.message });
    console.error('[worktree] git worktree list failed:', err.message);
    return;
  }

  const worktrees = parseGitWorktreeList(stdout);
  const seenPaths = new Set();

  for (const wt of worktrees) {
    // Skip the base repo worktree (main/master) — dashboard cards represent
    // feature work, and the base worktree is not a unit of work.
    if (wt.branch === 'main' || wt.branch === 'master') continue;
    seenPaths.add(wt.path);
    const ctx = readJiraContext(wt.path, logger);
    const state = {
      path: wt.path,
      branch: wt.branch,
      taskId: ctx ? ctx.taskId : null,
      cachedIssue: ctx ? ctx.cachedIssue : null,
      lastFetchedAt: ctx ? ctx.lastFetchedAt : null,
      noContext: ctx === null,
      completedSteps: ctx ? ctx.completedSteps : [],
      summary: ctx ? ctx.summary : null,
      priority: ctx ? ctx.priority : null,
      status: ctx ? ctx.status : null,
      epic: ctx ? ctx.epic : null,
    };
    store.upsertWorktree(state);
  }

  // Remove worktrees that disappeared from the list
  const snapshot = store.getSnapshot();
  for (const existing of snapshot) {
    if (!seenPaths.has(existing.path)) {
      store.removeWorktree(existing.path);
    }
  }
}

/**
 * Start the worktree collector.
 *
 * @param {object} store  Store instance from createStore()
 * @param {{ workspaceRoot: string, pollIntervalMs?: number, logger?: object }} opts
 * @returns {{ stop(): void }}
 */
function startWorktreeCollector(store, opts) {
  const { workspaceRoot, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, logger = null } = opts;

  // Initial collection
  collectWorktrees(store, workspaceRoot, logger);

  // 30s polling
  const pollTimer = setInterval(() => {
    collectWorktrees(store, workspaceRoot, logger);
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
    // Watch all .jira-context.json files under the parent worktrees directory.
    // We watch the workspace parent dir for add/unlink of .jira-context.json files.
    const parentDir = path.dirname(workspaceRoot);
    const pattern = path.join(parentDir, '*', '.jira-context.json');

    try {
      watcher = chokidar.watch(pattern, {
        ignoreInitial: true,
        depth: 0,
        usePolling: false,
      });

      const handleChange = (filePath) => {
        const worktreePath = path.dirname(filePath);
        const ctx = readJiraContext(worktreePath, logger);
        if (ctx === null) {
          // File may have been removed or is unreadable; re-run full collect
          collectWorktrees(store, workspaceRoot, logger);
          return;
        }
        // Get current branch from snapshot
        const snapshot = store.getSnapshot();
        const existing = snapshot.find((w) => w.path === worktreePath);
        store.upsertWorktree({
          path: worktreePath,
          branch: existing ? existing.branch : null,
          taskId: ctx.taskId,
          cachedIssue: ctx.cachedIssue,
          lastFetchedAt: ctx.lastFetchedAt,
          noContext: false,
          completedSteps: ctx.completedSteps,
          summary: ctx.summary,
          priority: ctx.priority,
          status: ctx.status,
          epic: ctx.epic,
        });
        logger && logger.info('worktree.context-changed', { path: worktreePath });
      };

      watcher.on('change', handleChange);
      watcher.on('add', handleChange);
      watcher.on('unlink', (filePath) => {
        const worktreePath = path.dirname(filePath);
        store.upsertWorktree({
          path: worktreePath,
          branch: null,
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
        logger && logger.info('worktree.context-removed', { path: worktreePath });
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
