/**
 * GraphFilterBar 인터랙션 테스트 (MAE-265).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GraphFilterBar from '../src/components/graph/GraphFilterBar.jsx';

const baseOptions = {
  statuses: [
    { value: '진행 중', count: 2 },
    { value: '할 일',   count: 1 },
  ],
  assignees: [
    { value: 'alice', count: 2 },
    { value: 'bob',   count: 1 },
  ],
};

function setup(overrides = {}) {
  const props = {
    options: baseOptions,
    statusSet: new Set(),
    assigneeSet: new Set(),
    onToggleStatus: vi.fn(),
    onToggleAssignee: vi.fn(),
    onClearStatus: vi.fn(),
    onClearAssignee: vi.fn(),
    matchedCount: 3,
    totalCount: 3,
    ...overrides,
  };
  return { props, ...render(<GraphFilterBar {...props} />) };
}

describe('GraphFilterBar', () => {
  it('U1: status / assignee 옵션을 모두 렌더하고 카운트 표시', () => {
    setup();
    expect(screen.getByText('STATUS')).toBeInTheDocument();
    expect(screen.getByText('ASSIGNEE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /진행 중/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /alice/ })).toBeInTheDocument();
  });

  it('U2: 필터 비활성 시 매치 카운트 미표시', () => {
    setup();
    expect(screen.queryByText(/매치/)).toBeNull();
  });

  it('U3: 필터 활성 시 "x/y 매치" 표시', () => {
    setup({ statusSet: new Set(['진행 중']), matchedCount: 2, totalCount: 3 });
    expect(screen.getByText('2/3 매치')).toBeInTheDocument();
  });

  it('U4: status chip 클릭 시 onToggleStatus(value) 호출', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /진행 중/ }));
    expect(props.onToggleStatus).toHaveBeenCalledWith('진행 중');
  });

  it('U5: STATUS "전체" 버튼 클릭 시 onClearStatus 호출', () => {
    const { props } = setup({ statusSet: new Set(['진행 중']) });
    // STATUS 그룹의 "전체" 버튼은 첫 번째.
    const allButtons = screen.getAllByRole('button', { name: /^전체/ });
    fireEvent.click(allButtons[0]);
    expect(props.onClearStatus).toHaveBeenCalled();
  });

  it('U6: 활성 칩에 aria-pressed=true', () => {
    setup({ assigneeSet: new Set(['alice']) });
    const aliceBtn = screen.getByRole('button', { name: /alice/ });
    expect(aliceBtn.getAttribute('aria-pressed')).toBe('true');
    const bobBtn = screen.getByRole('button', { name: /bob/ });
    expect(bobBtn.getAttribute('aria-pressed')).toBe('false');
  });
});
