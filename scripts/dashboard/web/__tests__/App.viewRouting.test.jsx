import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

const App = (await import('../src/App.jsx')).default;

describe('App — 카드/그래프 뷰 라우팅 (MAE-259)', () => {
  it('초기 카드 모드에서는 dashboard-grid가 렌더되고 graph-canvas는 없음', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.dashboard-grid')).not.toBeNull();
    expect(screen.queryByTestId('graph-canvas')).toBeNull();
  });

  it('그래프 모드로 전환하면 graph-canvas가 렌더되고 dashboard-grid는 사라짐', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '그래프' }));
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    expect(container.querySelector('.dashboard-grid')).toBeNull();
  });

  it('카드 모드로 다시 전환하면 dashboard-grid가 복귀하고 graph-canvas는 사라짐', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '그래프' }));
    fireEvent.click(screen.getByRole('radio', { name: '카드' }));
    expect(container.querySelector('.dashboard-grid')).not.toBeNull();
    expect(screen.queryByTestId('graph-canvas')).toBeNull();
  });
});
