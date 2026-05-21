'use strict';

/**
 * GET /metrics?space=<spaceId>&weeks=<n>
 *
 * 선택 스페이스의 status 분포·WIP·주별 throughput JSON을 반환.
 *
 * Response:
 * {
 *   spaceId: string,
 *   weeks: number,
 *   statusDistribution: Array<{ status, statusCategory, count }>,
 *   wip: number,
 *   throughput: Array<{ week, completed }>,
 *   leadTime: { median, p75, p95, distribution: Array<{ issueKey, days }> },
 *   cycleTime: { median, p75, p95, distribution: Array<{ issueKey, days }>, note: string },
 *   perAssignee: Array<{ assignee, completed, wip }>,
 *   agingWip: Array<{ issueKey, summary, assignee, created, ageDays }>,
 * }
 *
 * @param {object} metricsStore
 * @param {object} [logger]
 * @returns {import('express').Router}
 */
function createMetricsRouter(metricsStore, logger) {
  const express = require('express');
  const router = express.Router();

  router.get('/', (req, res) => {
    const spaceId = req.query.space;
    if (!spaceId || typeof spaceId !== 'string') {
      return res.status(400).json({ error: 'space query parameter required' });
    }

    const weeksRaw = parseInt(req.query.weeks, 10);
    const weeks = Number.isFinite(weeksRaw) && weeksRaw > 0 ? weeksRaw : 8;

    let statusDistribution, wip, throughput, leadTime, cycleTime, perAssignee, agingWip;
    try {
      statusDistribution = metricsStore.getStatusDistribution(spaceId);
      wip = metricsStore.getWip(spaceId);
      throughput = metricsStore.getThroughput(spaceId, weeks);
      leadTime = metricsStore.getLeadTime(spaceId);
      cycleTime = metricsStore.getCycleTime(spaceId);
      perAssignee = metricsStore.getPerAssignee(spaceId, weeks);
      agingWip = metricsStore.getAgingWip(spaceId);
    } catch (err) {
      logger && logger.error('metrics-route.query-failed', { spaceId, error: err.message });
      return res.status(500).json({ error: 'metrics query failed' });
    }

    res.json({ spaceId, weeks, statusDistribution, wip, throughput, leadTime, cycleTime, perAssignee, agingWip });
  });

  return router;
}

module.exports = { createMetricsRouter };
