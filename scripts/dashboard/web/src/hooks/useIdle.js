import { useState, useEffect } from 'react';

/**
 * Returns true when no SSE event has been received for longer than thresholdMs.
 *
 * - null lastEventAt → false (still connecting, not idle)
 * - clock jump guard: if now < lastEventAt, returns false
 *
 * @param {number|null} lastEventAt  — epoch ms of last SSE event (from reducer state)
 * @param {number}      thresholdMs  — idle threshold, default 15 000 ms
 * @returns {boolean}
 */
export function useIdle(lastEventAt, thresholdMs = 15_000) {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    function check() {
      if (lastEventAt == null) {
        setIsIdle(false);
        return;
      }
      const elapsed = Date.now() - lastEventAt;
      setIsIdle(elapsed > thresholdMs && elapsed >= 0);
    }

    check(); // run immediately on mount / lastEventAt change

    const id = setInterval(check, 1_000);
    return () => clearInterval(id);
  }, [lastEventAt, thresholdMs]);

  return isIdle;
}
