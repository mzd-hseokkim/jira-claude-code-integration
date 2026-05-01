/**
 * Dashboard state reducer.
 *
 * State shape:
 *   {
 *     connection: 'never-connected' | 'connected' | 'disconnected',
 *     lastConnectedAt: string | null,   // ISO8601
 *     worktrees: { [path: string]: WorktreeState }
 *   }
 *
 * Action types:
 *   SNAPSHOT              — initial snapshot from SSE
 *   WORKTREE_ADDED        — new worktree detected
 *   WORKTREE_CHANGED      — worktree state updated
 *   WORKTREE_REMOVED      — worktree removed
 *   CONNECTION_LOST       — SSE stream disconnected mid-session
 *   CONNECTION_FAILED_INITIAL — first connection attempt failed
 *   LIVE_EVENT            — any live SSE event received; updates lastEventAt
 */

export const initialState = {
  connection: 'never-connected',
  lastConnectedAt: null,
  worktrees: {},
  lastEventAt: null,
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
      return {
        ...state,
        connection: 'connected',
        lastConnectedAt: new Date().toISOString(),
        worktrees,
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
