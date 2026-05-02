import React from 'react';

/**
 * 그래프 렌더링 오류를 catch하여 카드뷰 fallback 안내를 표시한다 (MAE-266).
 *
 * - render 중 발생한 예외를 잡아 console.warn으로 기록 (dashboard 로깅 채널)
 * - fallback UI: 안내 문구 + "카드뷰로 전환" 버튼
 * - onFallback prop이 있으면 버튼 클릭 시 호출 (App에서 viewMode='cards' 복귀)
 */
export default class GraphErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.warn('[GraphCanvas] render error', {
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
    });
  }

  handleFallback = () => {
    this.setState({ error: null });
    if (typeof this.props.onFallback === 'function') {
      this.props.onFallback();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <main
          className="graph-canvas graph-canvas--error"
          data-testid="graph-error-fallback"
          role="alert"
          aria-live="assertive"
        >
          <div className="graph-canvas__error-box">
            <h2 className="graph-canvas__error-title">그래프를 표시할 수 없습니다</h2>
            <p className="graph-canvas__error-message">
              렌더링 중 오류가 발생했습니다. 카드뷰로 전환해 주세요.
            </p>
            <button
              type="button"
              className="graph-canvas__error-btn"
              onClick={this.handleFallback}
            >
              카드뷰로 전환
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
