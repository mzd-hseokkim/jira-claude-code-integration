import React from 'react';
import ActivityPanel from './ActivityPanel.jsx';

const EMPTY = '—';

/**
 * path의 마지막 segment 반환.
 * @param {string|null|undefined} cwd
 * @returns {string}
 */
function cwdBasename(cwd) {
  if (!cwd) return '(no cwd)';
  return cwd.replace(/\/$/, '').split('/').pop() || cwd;
}

/**
 * sessionId 앞 8자만 반환.
 * @param {string} sessionId
 * @returns {string}
 */
function shortId(sessionId) {
  return sessionId ? sessionId.slice(0, 8) : EMPTY;
}

/**
 * worktree-무관 Claude 세션 카드.
 * Stepper 없음. ActivityPanel 재사용.
 *
 * @param {{ session: {
 *   sessionId: string,
 *   cwd: string|null,
 *   source: 'startup'|'resume'|'continue'|null,
 *   startedAt: string|null,
 *   lastActiveAt: string|null,
 *   activity: Array<{ts:string,type:string,data:unknown}>
 * } }} props
 */
export default function SessionCard({ session }) {
  const { sessionId, cwd, source, activity = [] } = session;

  return (
    <div className="session-card">
      <div className="session-card__header">
        <span className="session-card__cwd" title={cwd ?? '(no cwd)'}>
          {cwdBasename(cwd)}
        </span>
        {source && (
          <span className={`session-card__source-badge session-card__source-badge--${source}`}>
            {source}
          </span>
        )}
        <span className="session-card__sid" title={sessionId}>
          {shortId(sessionId)}
        </span>
      </div>
      <ActivityPanel activity={activity} />
    </div>
  );
}
