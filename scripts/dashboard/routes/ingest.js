'use strict';

const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Walk up the directory tree from startPath looking for a .git directory or file.
 * Returns the directory containing .git, or null if not found / path invalid.
 *
 * @param {string} startPath  - absolute path to start from
 * @param {{ logger?: object }} [opts]
 * @returns {string|null}
 */
function findGitRoot(startPath, opts = {}) {
  const logger = opts.logger || null;
  if (typeof startPath !== 'string' || !path.isAbsolute(startPath)) return null;

  let current = startPath;
  while (true) {
    let gitStat;
    try {
      gitStat = fs.statSync(path.join(current, '.git'));
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        // Unexpected fs error (permissions, etc.) — bail out
        logger && logger.warn('findGitRoot.stat-error', { dir: current, err: err.message });
        return null;
      }
      gitStat = null;
    }

    if (gitStat) return current; // found .git (dir or file for linked worktrees)

    const parent = path.dirname(current);
    if (parent === current) return null; // reached filesystem root
    current = parent;
  }
}

/**
 * Determine if a git root path should be rejected for auto-registration (D-7).
 * Rejects: filesystem root, $HOME itself, $HOME direct children.
 *
 * @param {string} gitRoot
 * @returns {boolean}
 */
function shouldRejectAutoRegister(gitRoot) {
  const parsed = path.parse(gitRoot);
  if (parsed.root === gitRoot) return true; // filesystem root (e.g. C:\, /)
  const home = os.homedir();
  if (gitRoot === home) return true;
  if (path.dirname(gitRoot) === home) return true;
  return false;
}

/**
 * Hook names that are recognized as first-class events.
 * Others are stored with hookName: "<unknown>" for debugging.
 */
const HOOK_WHITELIST = new Set([
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'SubagentStop',
  'Notification',
  'SessionStart',
  'SessionEnd',
  'Stop',
]);

/**
 * Look up the worktree record for the given cwd.
 * Iterates the store snapshot and returns the first worktree whose path
 * is a prefix of (or equal to) the given cwd.
 *
 * @param {object} store  - createStore() instance
 * @param {string|null} cwd
 * @returns {{ taskId: string|null, worktreePath: string|null }}
 */
// Windows hooks send cwd with backslashes ("C:\\WORK\\..."), but git worktree
// list emits POSIX slashes ("C:/WORK/..."). Normalize before comparing.
function normalizePath(p) {
  return typeof p === 'string' ? p.replace(/\\/g, '/') : p;
}

function lookupWorktree(store, cwd) {
  if (!cwd) return { taskId: null, worktreePath: null };
  const ncwd = normalizePath(cwd);

  const snapshot = store.getSnapshot();
  // longest-prefix wins to handle nested worktrees correctly.
  let best = null;
  for (const wt of snapshot) {
    if (!wt.path) continue;
    const npath = normalizePath(wt.path);
    if (ncwd === npath || ncwd.startsWith(npath + '/')) {
      if (!best || npath.length > normalizePath(best.path).length) best = wt;
    }
  }
  if (best) return { taskId: best.taskId ?? null, worktreePath: best.path };
  return { taskId: null, worktreePath: null };
}

/**
 * Create the Express router for POST /ingest.
 *
 * @param {object} store              - createStore() instance from store.js
 * @param {object} [logger]           - optional logger with .info() / .warn()
 * @param {object} [workspacesModule] - workspaces module (register, events). If omitted, auto-register is disabled.
 * @returns {import('express').Router}
 */
function createIngestRouter(store, logger = null, workspacesModule = null) {
  const express = require('express');
  const router = express.Router();

  // 256 KB body limit (design spec: Data Model / constraints)
  router.use(express.json({ limit: '256kb' }));

  router.post('/', (req, res) => {
    const rawHook = req.query.hook ?? '';
    const hookName = HOOK_WHITELIST.has(rawHook) ? rawHook : '<unknown>';

    const payload = req.body ?? {};
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : null;

    let taskId = null;
    let worktreePath = null;
    let sessionId = null;
    let label = 'no-context';

    try {
      const mapped = lookupWorktree(store, cwd);
      taskId = mapped.taskId;
      worktreePath = mapped.worktreePath;

      if (worktreePath) {
        label = 'mapped';
      } else {
        // worktree miss: session_id 기반 session entry 경로.
        // auto-register는 의도적으로 제거됨 (MAE-331) — 임시 cwd가 워크스페이스로
        // 등록되는 부작용을 막기 위함.
        const rawSid = typeof payload.session_id === 'string' ? payload.session_id : null;
        if (rawSid) {
          sessionId = rawSid;
          label = 'session';
        }
      }
    } catch (err) {
      // Error Handling: worktreeMap.lookup throw → log + no-context (design §Error Handling row 7)
      logger && logger.warn('ingest.lookup-error', { err: err.message, cwd });
    }

    const ingestId = randomUUID();
    const receivedAt = new Date().toISOString();

    /** @type {import('../store').ActivityEvent} */
    const event = {
      ingestId,
      receivedAt,
      hookName,
      cwd,
      taskId,
      worktreePath,
      sessionId,
      label,
      payload,
    };

    if (label === 'mapped') {
      store.pushActivity(worktreePath, { ts: receivedAt, type: hookName, data: event });
    } else if (label === 'session') {
      // SessionStart → 신규 등록 또는 startedAt/cwd/source 갱신.
      // 그 외 lifecycle hook → lastActiveAt만 partial update.
      if (hookName === 'SessionStart') {
        store.upsertSession({
          sessionId,
          cwd,
          source: typeof payload.source === 'string' ? payload.source : null,
          startedAt: receivedAt,
          lastActiveAt: receivedAt,
        });
      } else {
        store.upsertSession({ sessionId, lastActiveAt: receivedAt });
      }
      store.pushSessionActivity(sessionId, { ts: receivedAt, type: hookName, data: event });
    } else {
      // no-context: cwd도 없거나 session_id도 없는 hook. drop + log.
      logger && logger.warn('ingest.session-id-missing', { cwd, hookName });
    }

    const ingestLog = label === 'mapped' && worktreePath && logger && typeof logger.child === 'function'
      ? logger.child({ workspace: worktreePath })
      : logger;
    ingestLog && ingestLog.info('ingest.received', { ingestId, hookName, cwd, label, taskId, sessionId });

    // Always respond 200 — forwarder ignores the body, but include it for debugging.
    res.json({ ok: true, ingestId, taskId, sessionId, label });
  });

  return router;
}

module.exports = { createIngestRouter, lookupWorktree, findGitRoot, shouldRejectAutoRegister };
