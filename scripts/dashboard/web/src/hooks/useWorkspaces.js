import { useState, useEffect, useRef } from 'react';

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * GET /workspaces를 60s 주기로 polling.
 * visibilityState === 'hidden'이면 polling 일시정지, 재개 시 즉시 fetch.
 *
 * @param {object} [opts]
 * @param {number} [opts.intervalMs]       polling 주기 (테스트에서 오버라이드용)
 * @param {typeof fetch} [opts.fetchImpl]  fetch 구현 (테스트에서 mock 주입용)
 * @returns {{ workspaces: WorkspaceEntry[], lastFetchAt: number|null, error: string|null }}
 */
export function useWorkspaces({ intervalMs = DEFAULT_INTERVAL_MS, fetchImpl } = {}) {
  const [workspaces, setWorkspaces] = useState([]);
  const [lastFetchAt, setLastFetchAt] = useState(null);
  const [error, setError] = useState(null);

  // 직전 성공 workspaces를 ref에 보관 → fetch 실패 시 유지
  const prevWorkspacesRef = useRef([]);

  const fetcher = fetchImpl ?? fetch;

  useEffect(() => {
    let timerId = null;

    async function doFetch() {
      try {
        const res = await fetcher('/workspaces');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items = Array.isArray(json.workspaces) ? json.workspaces : [];
        // 항목 단위 검증: path 필드 없으면 skip + warn
        const valid = [];
        for (const item of items) {
          try {
            if (typeof item.path !== 'string' || !item.path) {
              console.warn('[useWorkspaces] workspace 항목에 path 없음, skip:', item);
              continue;
            }
            valid.push(item);
          } catch (e) {
            console.warn('[useWorkspaces] workspace 항목 파싱 오류, skip:', e.message);
          }
        }
        prevWorkspacesRef.current = valid;
        setWorkspaces(valid);
        setLastFetchAt(Date.now());
        setError(null);
      } catch (e) {
        console.warn('[useWorkspaces] GET /workspaces 실패:', e.message);
        // 직전 값 유지
        setWorkspaces(prevWorkspacesRef.current);
        setError(e.message);
      }
    }

    function schedule() {
      timerId = setTimeout(async () => {
        await doFetch();
        if (document.visibilityState !== 'hidden') {
          schedule();
        }
      }, intervalMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        // 숨겨지면 pending timer 취소
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
      } else {
        // 재개: 즉시 fetch 후 timer 재시작
        doFetch().then(() => schedule());
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    // 최초 fetch
    doFetch().then(() => {
      if (document.visibilityState !== 'hidden') {
        schedule();
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerId !== null) clearTimeout(timerId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, fetcher]);

  return { workspaces, lastFetchAt, error };
}
