import React from 'react';

/**
 * 화면 최상단의 KITT 스타일 라이트 바.
 * SSE 연결됐으면 파란 점이 좌→우→좌로 스캔, 끊겼으면 정적 dim 라인.
 *
 * @param {{ connection: 'never-connected' | 'connected' | 'disconnected' }} props
 */
export default function KittBar({ connection }) {
  const isLive = connection === 'connected';
  return (
    <div className={`kitt-bar${isLive ? ' kitt-bar--live' : ''}`} aria-hidden="true">
      <div className="kitt-bar__track" />
      {isLive && <div className="kitt-bar__scanner" />}
    </div>
  );
}
