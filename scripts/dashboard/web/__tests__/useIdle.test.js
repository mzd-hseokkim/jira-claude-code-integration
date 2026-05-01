import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdle } from '../src/hooks/useIdle.js';

describe('useIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // U3: lastEventAt=null → false (connecting, not idle)
  it('U3 — lastEventAt=null → false', () => {
    const { result } = renderHook(() => useIdle(null));
    expect(result.current).toBe(false);
  });

  // U4: 임계 미만 → false
  it('U4 — 임계 미만(1000ms) → false', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { result } = renderHook(() => useIdle(now - 1000, 15_000));
    expect(result.current).toBe(false);
  });

  // U5: 임계 초과 → true (fake timer로 16s 진행)
  it('U5 — 16초 경과 후 → true', () => {
    const start = Date.now();
    vi.setSystemTime(start);
    const { result } = renderHook(() => useIdle(start, 15_000));
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    expect(result.current).toBe(true);
  });

  // 시계 점프 방어: now < lastEventAt → false
  it('clock jump guard — now < lastEventAt → false', () => {
    const future = Date.now() + 60_000;
    const { result } = renderHook(() => useIdle(future, 15_000));
    expect(result.current).toBe(false);
  });

  // lastEventAt 변경 시 idle 리셋
  it('lastEventAt 갱신 시 idle 리셋', () => {
    const start = Date.now();
    vi.setSystemTime(start);

    const { result, rerender } = renderHook(
      ({ ts }) => useIdle(ts, 15_000),
      { initialProps: { ts: start } }
    );

    // 16초 뒤 idle
    act(() => { vi.advanceTimersByTime(16_000); });
    expect(result.current).toBe(true);

    // 새 이벤트 도착 → idle 리셋
    const refreshed = Date.now();
    act(() => { rerender({ ts: refreshed }); });
    expect(result.current).toBe(false);
  });
});
