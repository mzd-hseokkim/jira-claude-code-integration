import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspaces } from '../src/hooks/useWorkspaces.js';

// MAE-280: useWorkspaces hook 단위 테스트 (U1-U4)

function makeFetch(data, { ok = true, reject = false } = {}) {
  return vi.fn(() => {
    if (reject) return Promise.reject(new Error('network error'));
    return Promise.resolve({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(data),
    });
  });
}

const W1 = { path: '/ws/a', registeredAt: '2026-01-01T00:00:00Z', lastSeenAt: null, status: 'active', health: 'healthy', worktreeCount: 1 };
const W2 = { path: '/ws/b', registeredAt: '2026-01-01T00:00:00Z', lastSeenAt: null, status: 'active', health: 'creds-missing', worktreeCount: 2 };

describe('useWorkspaces — U1: 첫 fetch 성공', () => {
  it('workspaces 배열 반환, error null', async () => {
    const fetchImpl = makeFetch({ workspaces: [W1, W2] });
    const { result } = renderHook(() => useWorkspaces({ intervalMs: 60000, fetchImpl }));

    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));
    expect(result.current.error).toBeNull();
    expect(result.current.workspaces[0].path).toBe('/ws/a');
    expect(result.current.workspaces[1].path).toBe('/ws/b');
  });
});

describe('useWorkspaces — U2: fetch 실패', () => {
  it('error 세팅, workspaces 빈 배열 유지', async () => {
    const fetchImpl = makeFetch(null, { reject: true });
    const { result } = renderHook(() => useWorkspaces({ intervalMs: 60000, fetchImpl }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.workspaces).toHaveLength(0);
    expect(result.current.error).toMatch(/network error/i);
  });

  it('첫 fetch 성공 후 두 번째 실패 시 직전 값 유지', async () => {
    let callCount = 0;
    const fetchImpl = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ workspaces: [W1] }),
        });
      }
      return Promise.reject(new Error('fail'));
    });

    const { result } = renderHook(() => useWorkspaces({ intervalMs: 50, fetchImpl }));
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1));

    // 두 번째 fetch (polling) 실패 후
    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 500 });
    expect(result.current.workspaces).toHaveLength(1); // 직전 값 유지
  });
});

describe('useWorkspaces — U3: polling tick', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('intervalMs 경과 후 fetch 2회 호출', async () => {
    const fetchImpl = makeFetch({ workspaces: [W1] });
    renderHook(() => useWorkspaces({ intervalMs: 100, fetchImpl }));

    // 초기 fetch 완료 대기
    await act(async () => { await Promise.resolve(); });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // 100ms 경과 → polling fetch
    await act(async () => {
      vi.advanceTimersByTime(110);
      await Promise.resolve();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('useWorkspaces — U4: visibility hidden 시 polling 중단', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible', writable: true, configurable: true,
    });
  });

  it('hidden 상태에서 interval 경과해도 추가 fetch 없음', async () => {
    const fetchImpl = makeFetch({ workspaces: [W1] });
    renderHook(() => useWorkspaces({ intervalMs: 100, fetchImpl }));

    // 초기 fetch
    await act(async () => { await Promise.resolve(); });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // hidden으로 전환
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden', writable: true, configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => { await Promise.resolve(); });

    // 시간 경과해도 fetch 추가 없음
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('useWorkspaces — path 없는 항목 skip', () => {
  it('path 없는 항목은 제외, 유효한 항목만 반환', async () => {
    const fetchImpl = makeFetch({ workspaces: [W1, { health: 'healthy' } /* path 없음 */, W2] });
    const { result } = renderHook(() => useWorkspaces({ intervalMs: 60000, fetchImpl }));

    await waitFor(() => expect(result.current.workspaces).toHaveLength(2));
    expect(result.current.workspaces.every(w => w.path)).toBe(true);
  });
});
