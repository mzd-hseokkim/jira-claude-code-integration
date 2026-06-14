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

// TASK-ID 패턴 (예: MAE-445). 프로젝트 키는 대문자 영문, 번호는 숫자.
const TASK_ID_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

/**
 * Agent 도구 spawn prompt에서 TASK-ID를 추출.
 * jira-task-auto의 표준 prompt는 "Jira task <TASK-ID>의 ..." 로 시작하므로
 * 첫 매칭 TASK-ID를 그 sub-agent가 다루는 태스크로 본다.
 *
 * @param {unknown} prompt
 * @returns {string|null}
 */
function parseTaskIdFromPrompt(prompt) {
  if (typeof prompt !== 'string') return null;
  const m = prompt.match(TASK_ID_RE);
  return m ? m[1] : null;
}

/**
 * snapshot에서 taskId에 해당하는 worktree path를 찾는다.
 * @param {object} store
 * @param {string} taskId
 * @returns {string|null}
 */
function worktreePathForTask(store, taskId) {
  if (!taskId) return null;
  for (const wt of store.getSnapshot()) {
    if (wt.taskId === taskId && wt.path) return wt.path;
  }
  return null;
}

/**
 * sub-agent activity를 worktree로 라우팅하기 위한 인메모리 매핑.
 *
 * 배경: loop/auto는 메인 세션 cwd(= repo root)에서 각 단계를 sub-agent(`Agent`
 * 도구)로 위임한다. sub-agent의 hook payload는 `cwd`가 여전히 메인 세션 dir라
 * cwd 기반 lookupWorktree로는 worktree에 매핑되지 않는다. 그러나 payload에
 * `agent_id`가 있어 sub-agent 활동을 메인 활동과 구분할 수 있고, 메인이 `Agent`를
 * 호출하는 PreToolUse의 `tool_input.prompt`에 TASK-ID가 들어 있다.
 *
 * 연결 방식 (시간 순서 보장):
 *   1. 메인의 Agent PreToolUse(payload.agent_id 없음) → prompt에서 TASK-ID 파싱,
 *      worktree 해석 후 _pendingSpawns FIFO 큐에 적재.
 *   2. 처음 보는 agent_id를 가진 hook → 큐의 가장 오래된 pending에 바인딩.
 *      (auto는 "한 메시지에 Agent 하나" 계약이라 동시 spawn 없음 → FIFO 안전.)
 *   3. 바인딩된 agent_id의 후속 hook → 해당 worktree activity로 라우팅.
 *   4. SubagentStop → 라우팅 후 바인딩 정리.
 */
function createAgentTracker() {
  /** @type {Array<{ taskId: string, worktreePath: string, at: number }>} */
  const pending = [];
  /** @type {Map<string, { taskId: string, worktreePath: string, at: number }>} */
  const bound = new Map();

  // bound 항목이 영원히 쌓이지 않도록 TTL sweep (sub-agent가 죽어 SubagentStop이
  // 누락된 경우 대비). 10분.
  const BOUND_TTL_MS = 10 * 60 * 1000;
  // pending spawn은 직후 도착하는 sub-agent 첫 hook과만 매칭돼야 한다. enqueue→
  // resolve 간격은 정상적으로 1초 미만이다. 이보다 오래된 pending은 "매칭될
  // agent_id가 영영 안 온"(spawn 실패/권한 거부) 것으로 보고 폐기한다 — 그래야
  // stale pending이 다음 무관 sub-agent에 잘못 바인딩되는 race를 막는다.
  const PENDING_GRACE_MS = 10 * 1000;
  function sweep(now) {
    while (pending.length && now - pending[0].at > PENDING_GRACE_MS) pending.shift();
    for (const [aid, rec] of bound) {
      if (now - rec.at > BOUND_TTL_MS) bound.delete(aid);
    }
  }

  return {
    /** 메인의 Agent spawn을 pending 큐에 적재. */
    enqueueSpawn(taskId, worktreePath, now) {
      sweep(now);
      pending.push({ taskId, worktreePath, at: now });
    },
    /**
     * agent_id에 대한 worktree 바인딩 반환. 미바인딩이면 grace 윈도우 내의 가장
     * 오래된 pending에 바인딩한다. 그런 pending이 없으면 null.
     * @returns {{ taskId: string, worktreePath: string } | null}
     */
    resolve(agentId, now) {
      if (!agentId) return null;
      let rec = bound.get(agentId);
      if (!rec) {
        // grace 경과한 stale pending을 먼저 폐기 후 매칭.
        sweep(now);
        const next = pending.shift();
        if (!next) return null;
        rec = { ...next, at: now };
        bound.set(agentId, rec);
      } else {
        rec.at = now; // keep-alive
      }
      return { taskId: rec.taskId, worktreePath: rec.worktreePath };
    },
    /** SubagentStop 이후 바인딩 해제. */
    release(agentId) {
      if (agentId) bound.delete(agentId);
    },
    // 테스트 노출용
    _pending: pending,
    _bound: bound,
  };
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

  // loop/auto sub-agent activity를 worktree로 라우팅하는 agent_id→worktree 매핑.
  const agentTracker = createAgentTracker();

  router.post('/', (req, res) => {
    const rawHook = req.query.hook ?? '';
    const hookName = HOOK_WHITELIST.has(rawHook) ? rawHook : '<unknown>';

    const payload = req.body ?? {};
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : null;
    const agentId = typeof payload.agent_id === 'string' ? payload.agent_id : null;
    const now = Date.now();

    let taskId = null;
    let worktreePath = null;
    let sessionId = null;
    let label = 'no-context';

    try {
      // (1) 메인 세션이 Agent 도구로 sub-agent를 띄우는 PreToolUse (agent_id 없음).
      //     prompt에서 TASK-ID를 파싱해 pending spawn으로 적재 → 다음 새 agent_id에 바인딩.
      if (!agentId && hookName === 'PreToolUse' && payload.tool_name === 'Agent') {
        const spawnTaskId = parseTaskIdFromPrompt(payload.tool_input && payload.tool_input.prompt);
        const spawnWt = spawnTaskId ? worktreePathForTask(store, spawnTaskId) : null;
        if (spawnTaskId && spawnWt) agentTracker.enqueueSpawn(spawnTaskId, spawnWt, now);
      }

      // (2) sub-agent hook (agent_id 보유) → cwd 무시하고 바인딩된 worktree로 라우팅.
      //     cwd가 우연히 worktree에 매핑되더라도 agent 바인딩을 우선한다 (정확한 task).
      const agentRoute = agentId ? agentTracker.resolve(agentId, now) : null;
      if (agentRoute) {
        taskId = agentRoute.taskId;
        worktreePath = agentRoute.worktreePath;
        label = 'mapped';
      } else {
        const mapped = lookupWorktree(store, cwd);
        taskId = mapped.taskId;
        worktreePath = mapped.worktreePath;
        if (worktreePath) label = 'mapped';
      }

      if (label !== 'mapped') {
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
      // sub-agent 종료 → agent_id 바인딩 정리 (메모리 누수 방지).
      if (hookName === 'SubagentStop' && agentId) agentTracker.release(agentId);
    } else if (label === 'session') {
      // SessionStart → 신규 등록 또는 startedAt/cwd/source 갱신.
      // SessionEnd  → session entry 즉시 제거 (sweep TTL 기다리지 않음).
      // 그 외 lifecycle hook → lastActiveAt만 partial update.
      if (hookName === 'SessionEnd') {
        store.removeSession(sessionId);
      } else {
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
      }
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

module.exports = {
  createIngestRouter,
  lookupWorktree,
  findGitRoot,
  shouldRejectAutoRegister,
  parseTaskIdFromPrompt,
  worktreePathForTask,
  createAgentTracker,
};
