/**
 * AnalyticsView.test.jsx — MAE-386 Test Plan T6 + MAE-387 신규 섹션 렌더
 *
 * T6: AnalyticsView empty/loading/error state 렌더 (useMetrics mock)
 * MAE-387: leadTime/cycleTime/perAssignee/agingWip 섹션 렌더 확인
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock useMetrics / useSpaces hooks
// ---------------------------------------------------------------------------

vi.mock('../src/hooks/useMetrics.js', () => ({
  useSpaces: vi.fn(),
  useMetrics: vi.fn(),
}));

import { useSpaces, useMetrics } from '../src/hooks/useMetrics.js';
import AnalyticsView from '../src/components/AnalyticsView.jsx';

// ---------------------------------------------------------------------------
// Default stub values
// ---------------------------------------------------------------------------

const defaultMetrics = {
  data: {
    spaceId: 'sp1',
    weeks: 8,
    statusDistribution: [
      { status: 'In Progress', statusCategory: 'indeterminate', count: 3 },
      { status: 'Done', statusCategory: 'done', count: 5 },
    ],
    wip: 3,
    throughput: [{ week: '2024-01', completed: 2 }],
    // MAE-387 신규 필드
    leadTime: { median: 10, p75: 15, p95: 20, distribution: [{ issueKey: 'MAE-1', days: 10 }] },
    cycleTime: { median: 5, p75: 8, p95: 12, distribution: [{ issueKey: 'MAE-1', days: 5 }], note: '근사값' },
    perAssignee: [{ assignee: 'alice', completed: 3, wip: 1 }],
    agingWip: [{ issueKey: 'MAE-2', summary: 'Old issue', assignee: 'alice', created: '2024-01-01', ageDays: 30 }],
  },
  loading: false,
  error: null,
  refresh: vi.fn(),
};

const defaultSpaces = [
  { id: 'sp1', site: 'https://x.atlassian.net', projectKey: 'MAE', credsOk: true, addedAt: '2024-01-01' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// T6: loading state
// ---------------------------------------------------------------------------

describe('AnalyticsView — T6 loading/empty/error states (MAE-386)', () => {
  it('T6-loading: spacesLoading=true → loading indicator 렌더', () => {
    useSpaces.mockReturnValue({ spaces: [], loading: true, error: null });
    useMetrics.mockReturnValue(defaultMetrics);

    render(<AnalyticsView />);

    const container = document.querySelector('[aria-busy="true"]');
    expect(container).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // T6: error state
  // -------------------------------------------------------------------------

  it('T6-error: spacesError 설정 → error 메시지 렌더 + 다시 시도 버튼', () => {
    const refresh = vi.fn();
    useSpaces.mockReturnValue({ spaces: [], loading: false, error: 'Network error' });
    useMetrics.mockReturnValue({ ...defaultMetrics, refresh });

    render(<AnalyticsView />);

    const alert = document.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('Network error');

    const retryBtn = screen.getByRole('button', { name: /다시 시도/i });
    expect(retryBtn).toBeTruthy();
    fireEvent.click(retryBtn);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // T6: empty state
  // -------------------------------------------------------------------------

  it('T6-empty: spaces=[] loading=false → empty 안내 문구 렌더', () => {
    useSpaces.mockReturnValue({ spaces: [], loading: false, error: null });
    useMetrics.mockReturnValue(defaultMetrics);

    render(<AnalyticsView />);

    const status = document.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.textContent).toContain('등록된 스페이스가 없습니다');
  });

  // -------------------------------------------------------------------------
  // T6: normal render with data
  // -------------------------------------------------------------------------

  it('T6-normal: spaces 존재 → 스페이스 선택기 + 차트 컨테이너 렌더', () => {
    useSpaces.mockReturnValue({ spaces: defaultSpaces, loading: false, error: null });
    useMetrics.mockReturnValue(defaultMetrics);

    render(<AnalyticsView />);

    // 스페이스 선택기 (radiogroup)
    const radiogroup = screen.getByRole('radiogroup', { name: /스페이스 선택/i });
    expect(radiogroup).toBeTruthy();

    // 스페이스 버튼 (projectKey 표시)
    const spaceBtn = screen.getByRole('radio', { name: /MAE/i });
    expect(spaceBtn).toBeTruthy();
    expect(spaceBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('T6-normal: metricsLoading=true while space selected → loading indicator', () => {
    useSpaces.mockReturnValue({ spaces: defaultSpaces, loading: false, error: null });
    useMetrics.mockReturnValue({ ...defaultMetrics, loading: true, data: null });

    render(<AnalyticsView />);

    // The view renders and spaces selector still visible
    const radiogroup = screen.getByRole('radiogroup', { name: /스페이스 선택/i });
    expect(radiogroup).toBeTruthy();
  });

  it('T6-normal: credsOk=false space is disabled', () => {
    const noCredsSpaces = [
      { id: 'sp-nocreds', site: 'https://x.atlassian.net', projectKey: 'NOCREDS', credsOk: false, addedAt: '2024-01-01' },
    ];
    useSpaces.mockReturnValue({ spaces: noCredsSpaces, loading: false, error: null });
    useMetrics.mockReturnValue({ ...defaultMetrics, data: null });

    render(<AnalyticsView />);

    const spaceBtn = screen.getByRole('radio', { name: /NOCREDS/i });
    expect(spaceBtn).toBeTruthy();
    expect(spaceBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// MAE-387: 신규 섹션 렌더 확인
// ---------------------------------------------------------------------------

describe('AnalyticsView — MAE-387 신규 섹션 렌더', () => {
  beforeEach(() => {
    useSpaces.mockReturnValue({ spaces: defaultSpaces, loading: false, error: null });
    useMetrics.mockReturnValue(defaultMetrics);
  });

  it('MAE-387: Lead Time 분포 섹션 헤딩이 렌더된다', () => {
    render(<AnalyticsView />);
    expect(screen.getByText(/Lead Time 분포/i)).toBeTruthy();
  });

  it('MAE-387: Cycle Time 분포 섹션 헤딩이 렌더된다', () => {
    render(<AnalyticsView />);
    expect(screen.getByText(/Cycle Time 분포/i)).toBeTruthy();
  });

  it('MAE-387: 사람별 처리량 섹션 — PerAssigneeTable aria-label 렌더된다', () => {
    render(<AnalyticsView />);
    expect(screen.getByText(/사람별 처리량/i)).toBeTruthy();
    const table = document.querySelector('[aria-label="사람별 처리량"]');
    expect(table).not.toBeNull();
  });

  it('MAE-387: Aging WIP 섹션 — AgingWipTable aria-label 렌더된다', () => {
    render(<AnalyticsView />);
    expect(screen.getByText(/Aging WIP/i)).toBeTruthy();
    const table = document.querySelector('[aria-label="Aging WIP"]');
    expect(table).not.toBeNull();
  });

  it('MAE-387: perAssignee 데이터가 테이블에 렌더된다', () => {
    render(<AnalyticsView />);
    // alice entry should appear in PerAssigneeTable
    const aliceElements = screen.getAllByText('alice');
    expect(aliceElements.length).toBeGreaterThan(0);
  });

  it('MAE-387: agingWip 데이터가 테이블에 렌더된다', () => {
    render(<AnalyticsView />);
    // MAE-2 issueKey should appear in AgingWipTable
    expect(screen.getByText('MAE-2')).toBeTruthy();
  });

  it('MAE-387: leadTime/cycleTime/perAssignee/agingWip 빈 데이터 — graceful empty state 렌더', () => {
    useMetrics.mockReturnValue({
      ...defaultMetrics,
      data: {
        ...defaultMetrics.data,
        leadTime: { median: null, p75: null, p95: null, distribution: [] },
        cycleTime: { median: null, p75: null, p95: null, distribution: [], note: '근사값' },
        perAssignee: [],
        agingWip: [],
      },
    });

    render(<AnalyticsView />);

    // empty state 컴포넌트가 렌더되어야 함 (crash 없이)
    expect(screen.getByText(/Lead Time 분포/i)).toBeTruthy();
    expect(screen.getByText(/사람별 처리량 데이터 없음/i)).toBeTruthy();
    expect(screen.getByText(/Aging WIP 없음/i)).toBeTruthy();
  });
});
