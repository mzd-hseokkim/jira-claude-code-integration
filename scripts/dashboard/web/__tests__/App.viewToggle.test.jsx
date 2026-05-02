import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

beforeAll(() => {
  // jsdom에는 EventSource가 없어 useDashboardStream이 폭주한다 — no-op stub.
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

describe('App — 카드/그래프 뷰 토글 (MAE-258)', () => {
  it('초기 렌더 시 카드 모드가 active', () => {
    render(<App />);
    const cardsBtn = screen.getByRole('radio', { name: '카드' });
    const graphBtn = screen.getByRole('radio', { name: '그래프' });
    expect(cardsBtn).toHaveAttribute('aria-checked', 'true');
    expect(graphBtn).toHaveAttribute('aria-checked', 'false');
    expect(cardsBtn.className).toContain('view-toggle__btn--active');
  });

  it('그래프 버튼 클릭 시 active 상태가 그래프로 전환', () => {
    render(<App />);
    const graphBtn = screen.getByRole('radio', { name: '그래프' });
    fireEvent.click(graphBtn);
    expect(graphBtn).toHaveAttribute('aria-checked', 'true');
    expect(graphBtn.className).toContain('view-toggle__btn--active');
    expect(screen.getByRole('radio', { name: '카드' })).toHaveAttribute('aria-checked', 'false');
  });

  it('카드 버튼 클릭 시 다시 카드 모드로 복귀', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: '그래프' }));
    fireEvent.click(screen.getByRole('radio', { name: '카드' }));
    expect(screen.getByRole('radio', { name: '카드' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '그래프' })).toHaveAttribute('aria-checked', 'false');
  });
});
