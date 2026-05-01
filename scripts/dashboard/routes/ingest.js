'use strict';

const { randomUUID } = require('node:crypto');

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
function lookupWorktree(store, cwd) {
  if (!cwd) return { taskId: null, worktreePath: null };

  const snapshot = store.getSnapshot();
  for (const wt of snapshot) {
    if (wt.path && (cwd === wt.path || cwd.startsWith(wt.path + '/'))) {
      return { taskId: wt.taskId ?? null, worktreePath: wt.path };
    }
  }
  return { taskId: null, worktreePath: null };
}

/**
 * Create the Express router for POST /ingest.
 *
 * @param {object} store      - createStore() instance from store.js
 * @param {object} [logger]   - optional logger with .info() / .warn()
 * @returns {import('express').Router}
 */
function createIngestRouter(store, logger = null) {
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
    let label = 'no-context';

    try {
      const mapped = lookupWorktree(store, cwd);
      taskId = mapped.taskId;
      worktreePath = mapped.worktreePath;
      label = worktreePath ? 'mapped' : 'no-context';
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
      label,
      payload,
    };

    // Push into the store. Use worktreePath as the key if mapped; otherwise use
    // the actual cwd from payload so the card shows real directory info. Fall
    // back to synthetic "__no-context__" only if cwd is also missing.
    const storeKey = worktreePath ?? cwd ?? '__no-context__';
    store.pushActivity(storeKey, { ts: receivedAt, type: hookName, data: event });

    logger && logger.info('ingest.received', { ingestId, hookName, cwd, label, taskId });

    // Always respond 200 — forwarder ignores the body, but include it for debugging.
    res.json({ ok: true, ingestId, taskId, label });
  });

  return router;
}

module.exports = { createIngestRouter, lookupWorktree };
