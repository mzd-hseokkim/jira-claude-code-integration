import { useEffect, useRef } from 'react';

/**
 * Subscribes to the backend SSE `/events` stream and dispatches actions
 * to the dashboard reducer.
 *
 * EventSource는 일부 환경(특히 macOS Safari/Chrome 절전, sleep 후 깨어남)에서
 * 자동 재연결이 멈출 때가 있다. 명시적 close → 백오프 재연결로 보정한다.
 *
 * @param {React.Dispatch<any>} dispatch
 */
export function useDashboardStream(dispatch) {
  const everConnected = useRef(false);

  useEffect(() => {
    let es = null;
    let retryTimer = null;
    let visibilityHandler = null;
    let backoffMs = 500;
    const BACKOFF_MAX = 8000;
    let unmounted = false;

    function scheduleReconnect() {
      if (unmounted) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, backoffMs);
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX);
    }

    function connect() {
      if (unmounted) return;
      if (es) {
        try { es.close(); } catch {}
        es = null;
      }
      es = new EventSource('/events');

      es.addEventListener('snapshot', (e) => {
        try {
          const data = JSON.parse(e.data);
          everConnected.current = true;
          backoffMs = 500; // 성공 시 백오프 리셋
          dispatch({
            type: 'SNAPSHOT',
            worktrees: data.worktrees ?? [],
            lastTickAt: data.lastTickAt ?? null,
            tickMs: data.tickMs ?? null,
            serverNowMs: data.serverNowMs ?? null,
          });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {
          console.warn('[useDashboardStream] failed to parse snapshot event');
        }
      });

      es.addEventListener('jira-collector.tick', (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch({
            type: 'JIRA_TICK',
            at: data.at,
            tickMs: data.tickMs,
            serverNowMs: data.at, // tick 이벤트는 서버 발행 직후라 at == serverNow로 근사
          });
        } catch {}
      });

      es.addEventListener('worktree.added', (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch({ type: 'WORKTREE_ADDED', path: data.path, state: data.state });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {}
      });

      es.addEventListener('worktree.changed', (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch({ type: 'WORKTREE_CHANGED', path: data.path, state: data.state });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {}
      });

      es.addEventListener('worktree.removed', (e) => {
        try {
          const data = JSON.parse(e.data);
          dispatch({ type: 'WORKTREE_REMOVED', path: data.path });
          dispatch({ type: 'LIVE_EVENT', at: Date.now() });
        } catch {}
      });

      es.onerror = () => {
        if (everConnected.current) {
          dispatch({ type: 'CONNECTION_LOST' });
        } else {
          dispatch({ type: 'CONNECTION_FAILED_INITIAL' });
        }
        // EventSource 기본 재연결을 신뢰하지 않고 명시적으로 닫고 재시도.
        try { es?.close(); } catch {}
        es = null;
        scheduleReconnect();
      };
    }

    // 탭이 다시 보이면 연결 상태 점검 후 즉시 재연결 시도.
    visibilityHandler = () => {
      if (document.visibilityState === 'visible' && (!es || es.readyState === 2)) {
        backoffMs = 500;
        connect();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    connect();

    return () => {
      unmounted = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      if (es) {
        try { es.close(); } catch {}
      }
    };
  }, [dispatch]);
}
