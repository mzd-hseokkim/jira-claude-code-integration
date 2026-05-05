/**
 * Dashboard state reducer.
 *
 * State shape:
 *   {
 *     connection: 'never-connected' | 'connected' | 'disconnected',
 *     lastConnectedAt: string | null,   // ISO8601
 *     worktrees: { [path: string]: WorktreeState },
 *     sessions: { [sessionId: string]: SessionState }
 *   }
 *
 * Action types:
 *   SNAPSHOT              — initial snapshot from SSE
 *   WORKTREE_ADDED        — new worktree detected
 *   WORKTREE_CHANGED      — worktree state updated
 *   WORKTREE_REMOVED      — worktree removed
 *   SESSION_ADDED         — new session detected
 *   SESSION_CHANGED       — session state updated
 *   SESSION_REMOVED       — session ended/removed
 *   CONNECTION_LOST       — SSE stream disconnected mid-session
 *   CONNECTION_FAILED_INITIAL — first connection attempt failed
 *   LIVE_EVENT            — any live SSE event received; updates lastEventAt
 */

export const initialState = {
  connection: 'never-connected',
  lastConnectedAt: null,
  worktrees: {},
  sessions: {},
  lastEventAt: null,
  // jira-collector polling cycle 기준점 (서버 시계 → 클라이언트 시계 보정값)
  pollCycleAnchorMs: null, // 클라이언트 Date.now() 기준 사이클 시작점
  pollCycleTickMs: null,   // 한 사이클 길이 (ms)
};

/**
 * @param {typeof initialState} state
 * @param {{ type: string, [key: string]: unknown }} action
 * @returns {typeof initialState}
 */
export function reducer(state, action) {
  switch (action.type) {
    case 'SNAPSHOT': {
      const worktrees = {};
      for (const wt of action.worktrees ?? []) {
        worktrees[wt.path] = wt;
      }
      const sessions = {};
      for (const s of action.sessions ?? []) {
        sessions[s.sessionId] = s;
      }
      // 서버가 보낸 lastTickAt(서버 epoch ms)을 클라이언트 시계로 변환.
      // 서버↔클라이언트 시계 오차 = clientNow - serverNowMs.
      let pollCycleAnchorMs = state.pollCycleAnchorMs;
      let pollCycleTickMs = state.pollCycleTickMs ?? action.tickMs ?? null;
      if (action.lastTickAt && action.serverNowMs) {
        const skew = Date.now() - action.serverNowMs;
        pollCycleAnchorMs = action.lastTickAt + skew;
        if (action.tickMs) pollCycleTickMs = action.tickMs;
      }
      return {
        ...state,
        connection: 'connected',
        lastConnectedAt: new Date().toISOString(),
        worktrees,
        sessions,
        pollCycleAnchorMs,
        pollCycleTickMs,
      };
    }

    case 'JIRA_TICK': {
      // 서버에서 새 polling tick이 시작됨. 서버 시계 → 클라이언트 시계 보정.
      const skew = action.serverNowMs ? (Date.now() - action.serverNowMs) : 0;
      return {
        ...state,
        pollCycleAnchorMs: (action.at ?? Date.now()) + skew,
        pollCycleTickMs: action.tickMs ?? state.pollCycleTickMs,
      };
    }

    case 'WORKTREE_ADDED':
    case 'WORKTREE_CHANGED': {
      return {
        ...state,
        connection: action.type === 'WORKTREE_ADDED' ? 'connected' : state.connection,
        worktrees: {
          ...state.worktrees,
          [action.path]: action.state,
        },
      };
    }

    case 'WORKTREE_REMOVED': {
      const { [action.path]: _removed, ...rest } = state.worktrees;
      return {
        ...state,
        worktrees: rest,
      };
    }

    case 'SESSION_ADDED':
    case 'SESSION_CHANGED': {
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.sessionId]: action.state,
        },
      };
    }

    case 'SESSION_REMOVED': {
      const { [action.sessionId]: _removedSession, ...restSessions } = state.sessions;
      return {
        ...state,
        sessions: restSessions,
      };
    }

    case 'CONNECTION_LOST': {
      return {
        ...state,
        connection: 'disconnected',
      };
    }

    case 'CONNECTION_FAILED_INITIAL': {
      return {
        ...state,
        connection: 'never-connected',
      };
    }

    case 'LIVE_EVENT': {
      return {
        ...state,
        lastEventAt: action.at,
      };
    }

    default:
      return state;
  }
}
