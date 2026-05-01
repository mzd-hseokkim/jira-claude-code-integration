import { useEffect, useRef } from 'react';

/**
 * Subscribes to the backend SSE `/events` stream and dispatches actions
 * to the dashboard reducer.
 *
 * Distinguishes first-connection failure (never-connected) from mid-session
 * disconnects (disconnected).
 *
 * @param {React.Dispatch<any>} dispatch
 */
export function useDashboardStream(dispatch) {
  // Track whether we've successfully connected at least once this mount.
  const everConnected = useRef(false);

  useEffect(() => {
    let es;

    function connect() {
      es = new EventSource('/events');

      es.addEventListener('snapshot', (e) => {
        try {
          const data = JSON.parse(e.data);
          everConnected.current = true;
          dispatch({ type: 'SNAPSHOT', worktrees: data.worktrees ?? [] });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {
          console.warn('[useDashboardStream] failed to parse snapshot event');
        }
      });

      es.addEventListener('worktree.added', (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch({ type: 'WORKTREE_ADDED', path: data.path, state: data.state });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {
          console.warn('[useDashboardStream] failed to parse worktree.added event');
        }
      });

      es.addEventListener('worktree.changed', (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch({ type: 'WORKTREE_CHANGED', path: data.path, state: data.state });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {
          console.warn('[useDashboardStream] failed to parse worktree.changed event');
        }
      });

      es.addEventListener('worktree.removed', (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch({ type: 'WORKTREE_REMOVED', path: data.path });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {
          console.warn('[useDashboardStream] failed to parse worktree.removed event');
        }
      });

      es.onerror = () => {
        if (everConnected.current) {
          dispatch({ type: 'CONNECTION_LOST' });
        } else {
          dispatch({ type: 'CONNECTION_FAILED_INITIAL' });
        }
        // EventSource 기본 자동 재연결(~3s)에 위임. 재연결 성공 시 snapshot 이벤트가 도착하면
        // SNAPSHOT action이 dispatch되어 connection='connected'로 복구됨.
      };
    }

    connect();

    return () => {
      if (es) es.close();
    };
  }, [dispatch]);
}
