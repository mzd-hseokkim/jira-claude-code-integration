import React from 'react';
import ActivityPanel from './ActivityPanel.jsx';
import { pickIsBusy, pickIsAwaitingUser } from '../selectors/activity.js';

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

  const isBusy = pickIsBusy(activity);
  const isAwaiting = pickIsAwaitingUser(activity);

  // 카드 활성 상태 클래스: awaiting(우선) > busy > idle.
  const stateClass = isAwaiting
    ? 'session-card--awaiting'
    : isBusy
      ? 'session-card--busy'
      : '';
  const cardClass = ['session-card', stateClass].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      <div className="session-card__header">
        <span className="session-card__cwd" title={cwd ?? '(no cwd)'}>
          {cwdBasename(cwd)}
        </span>
        {source && (
          <span className={`session-card__source-badge session-card__source-badge--${source}`}>
            {source}
          </span>
        )}
        {isAwaiting && <span className="session-card__awaiting-badge">⏵ 응답 대기</span>}
        <span className="session-card__sid" title={sessionId}>
          {shortId(sessionId)}
        </span>
      </div>
      <ActivityPanel activity={activity} />
    </div>
  );
}
