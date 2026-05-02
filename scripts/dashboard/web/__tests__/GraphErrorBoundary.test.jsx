import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GraphErrorBoundary from '../src/components/GraphErrorBoundary.jsx';

function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error('boom');
  return <div data-testid="bomb-ok">ok</div>;
}

describe('GraphErrorBoundary (MAE-266)', () => {
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // React 18 prints the caught error to console.error — silence it for clean output.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('자식이 정상이면 그대로 렌더', () => {
    render(
      <GraphErrorBoundary>
        <Bomb shouldThrow={false} />
      </GraphErrorBoundary>
    );
    expect(screen.getByTestId('bomb-ok')).toBeInTheDocument();
  });

  it('자식 렌더 오류를 잡아 fallback UI를 표시한다', () => {
    render(
      <GraphErrorBoundary>
        <Bomb shouldThrow={true} />
      </GraphErrorBoundary>
    );
    expect(screen.getByTestId('graph-error-fallback')).toBeInTheDocument();
    expect(screen.getByText('그래프를 표시할 수 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '카드뷰로 전환' })).toBeInTheDocument();
  });

  it('오류 발생 시 console.warn에 기록한다 (dashboard 로깅)', () => {
    render(
      <GraphErrorBoundary>
        <Bomb shouldThrow={true} />
      </GraphErrorBoundary>
    );
    expect(warnSpy).toHaveBeenCalled();
    const [tag, payload] = warnSpy.mock.calls[0];
    expect(tag).toBe('[GraphCanvas] render error');
    expect(payload).toMatchObject({ message: 'boom' });
    expect(typeof payload.componentStack).toBe('string');
  });

  it('"카드뷰로 전환" 버튼 클릭 시 onFallback이 호출된다', () => {
    const onFallback = vi.fn();
    render(
      <GraphErrorBoundary onFallback={onFallback}>
        <Bomb shouldThrow={true} />
      </GraphErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: '카드뷰로 전환' }));
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it('fallback에 role="alert"와 aria-live가 설정되어 있어 스크린리더에 알림된다', () => {
    render(
      <GraphErrorBoundary>
        <Bomb shouldThrow={true} />
      </GraphErrorBoundary>
    );
    const fb = screen.getByTestId('graph-error-fallback');
    expect(fb).toHaveAttribute('role', 'alert');
    expect(fb).toHaveAttribute('aria-live', 'assertive');
  });
});
