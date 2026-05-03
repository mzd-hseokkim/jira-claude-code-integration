import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// MAE-280: App workspace grouping 통합 테스트 (E1-E6)

beforeAll(() => {
  globalThis.EventSource = class {
    constructor() {}
    close() {}
    addEventListener() {}
    removeEventListener() {}
  };
});

vi.mock('../src/hooks/useDashboardStream.js', () => ({
  useDashboardStream: () => {},
}));

// useWorkspaces mock — 테스트마다 값을 교체할 수 있도록 ref로 관리
let mockWorkspaces = [];
vi.mock('../src/hooks/useWorkspaces.js', () => ({
  useWorkspaces: () => ({ workspaces: mockWorkspaces, lastFetchAt: Date.now(), error: null }),
}));

// DashboardContext mock — worktrees를 주입하기 위해 Context를 교체
let mockWorktrees = {};
vi.mock('../src/state/DashboardContext.jsx', () => {
  const { createContext, useContext } = require('react');
  const Ctx = createContext({ state: { connection: 'connected', lastConnectedAt: null, worktrees: {}, lastEventAt: null, pollCycleAnchorMs: null, pollCycleTickMs: null }, dispatch: () => {} });
  return {
    DashboardProvider: ({ children }) => {
      const { createElement } = require('react');
      return createElement(Ctx.Provider, {
        value: {
          state: {
            connection: 'connected',
            lastConnectedAt: null,
            worktrees: mockWorktrees,
            lastEventAt: null,
            pollCycleAnchorMs: null,
            pollCycleTickMs: null,
          },
          dispatch: () => {},
        },
      }, children);
    },
    useDashboard: () => useContext(Ctx),
  };
});

async function mountApp() {
  const { default: App } = await import('../src/App.jsx');
  return render(<App />);
}

// 모듈 캐시를 비워 각 테스트에서 mock 값이 반영되도록 함
function resetModules() {
  vi.resetModules();
  // 모듈 캐시 리셋 후 mock 재등록 필요
  vi.mock('../src/hooks/useDashboardStream.js', () => ({
    useDashboardStream: () => {},
  }));
  vi.mock('../src/hooks/useWorkspaces.js', () => ({
    useWorkspaces: () => ({ workspaces: mockWorkspaces, lastFetchAt: Date.now(), error: null }),
  }));
  vi.mock('../src/state/DashboardContext.jsx', () => {
    const { createContext, useContext } = require('react');
    const Ctx = createContext({});
    return {
      DashboardProvider: ({ children }) => {
        const { createElement } = require('react');
        return createElement(Ctx.Provider, {
          value: {
            state: {
              connection: 'connected',
              lastConnectedAt: null,
              worktrees: mockWorktrees,
              lastEventAt: null,
              pollCycleAnchorMs: null,
              pollCycleTickMs: null,
            },
            dispatch: () => {},
          },
        }, children);
      },
      useDashboard: () => useContext(Ctx),
    };
  });
}

const WS_A = { path: '/ws/alpha', registeredAt: '2026-01-01T00:00:00Z', lastSeenAt: null, status: 'active', health: 'healthy', worktreeCount: 1 };
const WS_B = { path: '/ws/beta', registeredAt: '2026-01-01T00:00:00Z', lastSeenAt: null, status: 'active', health: 'creds-missing', worktreeCount: 1 };

const WT_A1 = { path: '/ws/alpha/task1', branch: 'feature/A1', taskId: 'A-1', noContext: false, workspaceRoot: '/ws/alpha', cachedIssue: { key: 'A-1', summary: 'Alpha task 1', status: '진행 중', priority: '주요', assignee: null, issuetype: '작업' }, activity: [] };
const WT_B1 = { path: '/ws/beta/task2', branch: 'feature/B1', taskId: 'B-1', noContext: false, workspaceRoot: '/ws/beta', cachedIssue: { key: 'B-1', summary: 'Beta task 1', status: '진행 중', priority: '주요', assignee: null, issuetype: '작업' }, activity: [] };

describe('App grouping — E1: N=2 workspace 그룹 헤더 렌더', () => {
  it('workspace 2개일 때 WorkspaceGroup 헤더 2개 렌더', async () => {
    mockWorkspaces = [WS_A, WS_B];
    mockWorktrees = {
      [WT_A1.path]: WT_A1,
      [WT_B1.path]: WT_B1,
    };
    resetModules();

    const { container } = await mountApp();
    const groups = container.querySelectorAll('.workspace-group');
    expect(groups.length).toBe(2);
  });
});

describe('App grouping — E2: N=1 자동 평면 모드', () => {
  it('workspace 1개일 때 workspace-group 없이 평면 카드', async () => {
    mockWorkspaces = [WS_A];
    mockWorktrees = { [WT_A1.path]: WT_A1 };
    resetModules();

    const { container } = await mountApp();
    expect(container.querySelector('.workspace-group')).toBeNull();
    expect(container.querySelector('.dashboard-grid')).not.toBeNull();
  });
});

describe('App grouping — E3: health 배지 정확도', () => {
  it('WS_A=healthy, WS_B=creds-missing → 각각 배지 클래스 적용', async () => {
    mockWorkspaces = [WS_A, WS_B];
    mockWorktrees = {
      [WT_A1.path]: WT_A1,
      [WT_B1.path]: WT_B1,
    };
    resetModules();

    const { container } = await mountApp();
    expect(container.querySelector('.health-badge--healthy')).not.toBeNull();
    expect(container.querySelector('.health-badge--creds-missing')).not.toBeNull();
  });
});

describe('App grouping — E5: 검색 필터로 한 그룹만 0건 → 해당 그룹 헤더 미렌더', () => {
  it('B 그룹 키워드 검색 시 A 헤더 미렌더, B 헤더만 표시', async () => {
    mockWorkspaces = [WS_A, WS_B];
    mockWorktrees = {
      [WT_A1.path]: WT_A1,
      [WT_B1.path]: WT_B1,
    };
    resetModules();

    const { container } = await mountApp();

    // B 그룹 키워드("Beta task")로 필터
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'Beta task' } });

    await waitFor(() => {
      const groups = container.querySelectorAll('.workspace-group');
      // alpha 그룹은 0건이므로 숨겨짐 → 그룹 1개만 남아야 함
      expect(groups.length).toBe(1);
    });
  });
});

describe('App grouping — E6: fallback 그룹 (workspaceRoot가 registry에 없음)', () => {
  it('매칭 없는 worktree → "(no workspace)" 헤더로 표시', async () => {
    mockWorkspaces = [WS_A, WS_B];
    const wtOrphan = { path: '/ws/orphan/task3', branch: 'feature/ORG', taskId: 'ORG-1', noContext: false, workspaceRoot: '/ws/orphan', cachedIssue: { key: 'ORG-1', summary: 'Orphan task', status: '진행 중', priority: '주요', assignee: null, issuetype: '작업' }, activity: [] };
    mockWorktrees = {
      [WT_A1.path]: WT_A1,
      [wtOrphan.path]: wtOrphan,
    };
    resetModules();

    const { container } = await mountApp();
    // alpha(1카드) + __unassigned__(1카드) = 그룹 2개
    const groups = container.querySelectorAll('.workspace-group');
    expect(groups.length).toBe(2);
    // "(no workspace)" 텍스트 존재
    expect(screen.getByText('(no workspace)')).toBeInTheDocument();
  });
});

describe('App grouping — E2 경계: workspace 0개 시 평면 모드', () => {
  it('workspaces 빈 배열이면 workspace-group 없음', async () => {
    mockWorkspaces = [];
    mockWorktrees = { [WT_A1.path]: WT_A1 };
    resetModules();

    const { container } = await mountApp();
    expect(container.querySelector('.workspace-group')).toBeNull();
  });
});
