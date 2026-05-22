'use strict';

// SDLC 단계 순서 (퍼널 집계용) — store.js SDLC_STEPS와 일치
const SDLC_STEPS = ['start', 'approach', 'impl', 'test', 'review', 'pr', 'done'];

/**
 * worktree store snapshot을 기반으로 SDLC 퍼널과 에이전트 처리량을 조립.
 * spaceId의 projectKey 접두사로 스코프 제한.
 *
 * @param {object} worktreeStore  createStore() 반환값 (getWorktreeActivityByTask 지원)
 * @param {string} spaceId
 * @returns {{ sdlcFunnel: Array<{step,count}>, agentThroughput: Array<{taskId,toolCallCount,completedSteps}> }}
 */
function buildWorktreeMetrics(worktreeStore, spaceId) {
  if (!worktreeStore || typeof worktreeStore.getWorktreeActivityByTask !== 'function') {
    return { sdlcFunnel: [], agentThroughput: [] };
  }

  // spaceId 형식: "<site>::<projectKey>" — projectKey 접두사로 필터
  const projectKey = spaceId.split('::')[1] || '';

  const allActivity = worktreeStore.getWorktreeActivityByTask();
  // 로컬 worktree 중 이 스페이스의 프로젝트에 속하는 것만 (taskId prefix 매칭)
  const matched = projectKey
    ? allActivity.filter((a) => a.taskId && a.taskId.startsWith(projectKey + '-'))
    : allActivity;

  // SDLC 퍼널: 각 단계를 completedSteps에 포함한 taskId 건수
  const stepCounts = {};
  for (const step of SDLC_STEPS) stepCounts[step] = 0;
  for (const entry of matched) {
    for (const step of entry.completedSteps) {
      if (step in stepCounts) stepCounts[step]++;
    }
  }
  const sdlcFunnel = SDLC_STEPS.map((step) => ({ step, count: stepCounts[step] }));

  // 에이전트 처리량 (최근 활동 기준 근사)
  const agentThroughput = matched
    .filter((a) => a.toolCallCount > 0 || a.completedSteps.length > 0)
    .map((a) => ({ taskId: a.taskId, toolCallCount: a.toolCallCount, completedSteps: a.completedSteps }))
    .sort((a, b) => b.toolCallCount - a.toolCallCount);

  return { sdlcFunnel, agentThroughput };
}

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
 *   sdlcFunnel: Array<{ step, count }>,
 *   agentThroughput: Array<{ taskId, toolCallCount, completedSteps }>,
 *   priorityDistribution: Array<{ priority, count }>,
 *   epicProgress: Array<{ epic, total, done, pct }>,
 * }
 *
 * @param {object} metricsStore
 * @param {object} [logger]
 * @param {object} [worktreeStore]  createStore() 반환값
 * @returns {import('express').Router}
 */
function createMetricsRouter(metricsStore, logger, worktreeStore) {
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
    let priorityDistribution, epicProgress;
    try {
      statusDistribution = metricsStore.getStatusDistribution(spaceId);
      wip = metricsStore.getWip(spaceId);
      throughput = metricsStore.getThroughput(spaceId, weeks);
      leadTime = metricsStore.getLeadTime(spaceId);
      cycleTime = metricsStore.getCycleTime(spaceId);
      perAssignee = metricsStore.getPerAssignee(spaceId, weeks);
      agingWip = metricsStore.getAgingWip(spaceId);
      priorityDistribution = metricsStore.getPriorityDistribution(spaceId);
      epicProgress = metricsStore.getEpicProgress(spaceId);
    } catch (err) {
      logger && logger.error('metrics-route.query-failed', { spaceId, error: err.message });
      return res.status(500).json({ error: 'metrics query failed' });
    }

    const { sdlcFunnel, agentThroughput } = buildWorktreeMetrics(worktreeStore, spaceId);

    res.json({
      spaceId, weeks,
      statusDistribution, wip, throughput, leadTime, cycleTime, perAssignee, agingWip,
      sdlcFunnel, agentThroughput,
      priorityDistribution, epicProgress,
    });
  });

  return router;
}

module.exports = { createMetricsRouter };
