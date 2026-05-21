'use strict';

/**
 * GET /spaces — 스페이스 선택기용 목록 반환.
 *
 * Response: { spaces: Array<{ id, site, projectKey, credsOk, addedAt }> }
 *
 * @param {object} metricsStore
 * @param {object} [logger]
 * @returns {import('express').Router}
 */
function createSpacesRouter(metricsStore, logger) {
  const express = require('express');
  const router = express.Router();

  router.get('/', (_req, res) => {
    let spaces;
    try {
      spaces = metricsStore.listSpaces();
    } catch (err) {
      logger && logger.error('spaces-route.list-failed', { error: err.message });
      return res.status(500).json({ error: 'spaces read failed' });
    }

    res.json({ spaces });
  });

  return router;
}

module.exports = { createSpacesRouter };
