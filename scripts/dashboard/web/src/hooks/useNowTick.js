import { useEffect, useState } from 'react';

/**
 * 매 N ms마다 현재 시각(ms)을 반환해 시간 기반 표시를 자동 업데이트.
 * @param {number} [intervalMs=1000]
 * @returns {number}
 */
export function useNowTick(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
