import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_SPACES_INTERVAL_MS = 60_000;
const DEFAULT_METRICS_INTERVAL_MS = 60_000;

/**
 * GET /spaces를 주기적으로 polling해 스페이스 목록을 반환.
 *
 * @param {{ intervalMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {{ spaces: Array<{id,site,projectKey,credsOk}>, loading: boolean, error: string|null }}
 */
export function useSpaces({ intervalMs = DEFAULT_SPACES_INTERVAL_MS, fetchImpl } = {}) {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const prevRef = useRef([]);
  const fetcher = fetchImpl ?? fetch;

  useEffect(() => {
    let timerId = null;
    let cancelled = false;

    async function doFetch() {
      try {
        const res = await fetcher('/spaces');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items = Array.isArray(json.spaces) ? json.spaces : [];
        prevRef.current = items;
        if (!cancelled) {
          setSpaces(items);
          setLoading(false);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSpaces(prevRef.current);
          setLoading(false);
          setError(e.message);
        }
      }
    }

    function schedule() {
      timerId = setTimeout(async () => {
        await doFetch();
        if (!cancelled && document.visibilityState !== 'hidden') schedule();
      }, intervalMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      } else {
        doFetch().then(() => { if (!cancelled) schedule(); });
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    doFetch().then(() => { if (!cancelled) schedule(); });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerId !== null) clearTimeout(timerId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, fetcher]);

  return { spaces, loading, error };
}

/**
 * GET /metrics?space=<spaceId>&weeks=<n> を polling.
 *
 * spaceId が null/undefined なら fetch しない (空 state 返却).
 *
 * @param {string|null} spaceId
 * @param {{ weeks?: number, intervalMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {{
 *   data: { statusDistribution, wip, throughput } | null,
 *   loading: boolean,
 *   error: string|null,
 *   refresh: () => void,
 * }}
 */
export function useMetrics(spaceId, { weeks = 8, intervalMs = DEFAULT_METRICS_INTERVAL_MS, fetchImpl } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const fetcher = fetchImpl ?? fetch;
  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;

  const doFetch = useCallback(async () => {
    const sid = spaceIdRef.current;
    if (!sid) return;
    setLoading(true);
    try {
      const res = await fetcher(`/metrics?space=${encodeURIComponent(sid)}&weeks=${weeks}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData({
        statusDistribution: json.statusDistribution || [],
        wip: json.wip ?? 0,
        throughput: json.throughput || [],
      });
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetcher, weeks]);

  useEffect(() => {
    if (!spaceId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    function schedule() {
      timerRef.current = setTimeout(async () => {
        if (!cancelled) {
          await doFetch();
          if (!cancelled && document.visibilityState !== 'hidden') schedule();
        }
      }, intervalMs);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
      } else {
        if (!cancelled) doFetch().then(() => { if (!cancelled) schedule(); });
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    setLoading(true);
    doFetch().then(() => { if (!cancelled) schedule(); });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, intervalMs, doFetch]);

  const refresh = useCallback(() => { doFetch(); }, [doFetch]);

  return { data, loading, error, refresh };
}
