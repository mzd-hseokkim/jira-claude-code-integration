import React from 'react';

/**
 * SSE 연결 상태 배너.
 * connected일 때는 아무것도 표시하지 않음.
 *
 * @param {{ connection: 'never-connected' | 'connected' | 'disconnected' }} props
 */
export default function ConnectionBanner({ connection }) {
  if (connection === 'connected') return null;

  const message =
    connection === 'never-connected'
      ? '백엔드(127.0.0.1:4173)에 연결할 수 없습니다. `node scripts/dashboard/server.js`로 서버를 먼저 띄워주세요.'
      : '백엔드 연결이 끊어졌습니다. 자동으로 재연결을 시도합니다…';

  return (
    <div className="conn-banner" role="alert">
      {message}
    </div>
  );
}
