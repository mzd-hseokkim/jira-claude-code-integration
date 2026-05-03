'use strict';

const workspaces = require('../workspaces');

/**
 * Express router: GET /workspaces — registry list + per-workspace health.
 *
 * Response shape: see docs/design/MAE-279.design.md.
 *
 * @param {object} store
 * @param {object} [logger]
 * @param {{ getLastTickAt?: () => (number|null), pluginRoot?: string }} [opts]
 * @returns {import('express').Router}
 */
function createWorkspacesRouter(store, logger, opts = {}) {
  const express = require('express');
  const router = express.Router();
  const getLastTickAt = typeof opts.getLastTickAt === 'function' ? opts.getLastTickAt : () => null;
  const pluginRoot = opts.pluginRoot || process.env.CLAUDE_PLUGIN_ROOT || null;

  router.get('/', (_req, res) => {
    let entries;
    try {
      entries = workspaces.list();
    } catch (err) {
      logger && logger.error('workspaces-route.list-failed', { error: err.message });
      return res.status(500).json({ error: 'registry read failed' });
    }

    let snapshot;
    try {
      snapshot = store.getSnapshot();
    } catch (err) {
      logger && logger.error('workspaces-route.snapshot-failed', { error: err.message });
      snapshot = null;
    }

    const out = entries.map((entry) => {
      let health = 'unknown';
      let worktreeCount = 0;
      try {
        if (snapshot) {
          const matched = snapshot.filter((w) => w.workspaceRoot === entry.path);
          worktreeCount = matched.length;
          if (matched.length === 0) {
            health = 'no-worktrees';
          } else if (matched.some((w) => w.credsStatus === 'missing')) {
            health = 'creds-missing';
          } else if (matched.every((w) => w.credsStatus === 'ok')) {
            health = 'healthy';
          } else {
            health = 'unknown';
          }
        }
      } catch (err) {
        const entryLog = logger && typeof logger.child === 'function'
          ? logger.child({ workspace: entry.path })
          : logger;
        entryLog && entryLog.warn('workspaces-route.derive-failed', { path: entry.path, error: err.message });
        health = 'unknown';
      }

      return {
        path: entry.path,
        registeredAt: entry.registeredAt,
        lastSeenAt: entry.lastSeenAt,
        status: entry.status,
        health,
        worktreeCount,
      };
    });

    res.json({
      workspaces: out,
      serverPluginRoot: pluginRoot,
      serverNowMs: Date.now(),
      lastTickAt: getLastTickAt(),
    });
  });

  return router;
}

module.exports = { createWorkspacesRouter };
