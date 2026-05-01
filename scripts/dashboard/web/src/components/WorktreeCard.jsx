import React from 'react';
import ActivityPanel from './ActivityPanel.jsx';
import Stepper from './Stepper.jsx';
import {
  pickIsBusy,
  pickIsAwaitingUser,
  pickLastActivityTs,
  pickToolCallCount,
} from '../selectors/activity.js';
import { formatRelative } from '../utils/relativeTime.js';
import { useNowTick } from '../hooks/useNowTick.js';

/** 표시할 필드가 없을 때 사용하는 placeholder */
const EMPTY = '—';

/**
 * @param {string|null|undefined} val
 * @returns {string}
 */
function fmt(val) {
  return val ?? EMPTY;
}

/**
 * path의 마지막 segment만 반환. trailing slash 방어 처리.
 * @param {string|null|undefined} path
 * @returns {string}
 */
function lastPathSegment(path) {
  if (!path) return EMPTY;
  return path.replace(/\/$/, '').split('/').pop() || path;
}

/**
 * 절대경로를 home(~) 기반으로 단축. macOS/Linux only.
 * @param {string|null|undefined} path
 * @returns {string}
 */
function tildify(path) {
  if (!path) return EMPTY;
  // 클라이언트는 사용자 home을 모르니, 흔한 패턴(/Users/<u>/, /home/<u>/)을 제거.
  return path
    .replace(/^\/Users\/[^/]+/, '~')
    .replace(/^\/home\/[^/]+/, '~');
}

/**
 * 한국어 Jira status 값을 CSS class slug로 변환.
 * 매핑 실패 또는 null/undefined → 'neutral'
 * @param {string|null|undefined} value
 * @returns {'todo'|'in-progress'|'in-review'|'done'|'blocked'|'neutral'}
 */
function statusSlug(value) {
  const v = String(value ?? '').trim();
  switch (v) {
    case '할 일':   return 'todo';
    case '진행 중': return 'in-progress';
    case '검토 중': return 'in-review';  // 실제 Jira 한국어 값은 "검토 중" (스페이스 포함)
    case '검토':    return 'in-review';  // 변형 보존 (혹시 다른 인스턴스에서 쓸 수 있음)
    case '완료':    return 'done';
    case '차단됨':  return 'blocked';
    default:        return 'neutral';
  }
}

/**
 * 한국어 Jira priority 값을 CSS class slug로 변환.
 * 매핑 실패 또는 null/undefined → 'neutral'
 * @param {string|null|undefined} value
 * @returns {'highest'|'high'|'major'|'medium'|'low'|'lowest'|'neutral'}
 */
function prioritySlug(value) {
  const v = String(value ?? '').trim();
  switch (v) {
    case '매우 높음': return 'highest';
    case '높음':      return 'high';
    case '주요':      return 'major';
    case '보통':      return 'medium';
    case '낮음':      return 'low';
    case '매우 낮음': return 'lowest';
    default:          return 'neutral';
  }
}

/**
 * 카드 한 장. WorktreeState를 prop으로 받아 7개 필드 + ActivityPanel을 표시.
 *
 * @param {{ worktree: import('../state/reducer.js').WorktreeState }} props
 */
export default function WorktreeCard({ worktree }) {
  const { path, branch, taskId, noContext, cachedIssue, activity = [], completedSteps } = worktree;

  // 1초 tick으로 상대시간 자동 갱신.
  const now = useNowTick(1000);

  const isBusy = pickIsBusy(activity);
  const isAwaiting = pickIsAwaitingUser(activity);
  const lastActivityTs = pickLastActivityTs(activity);
  const toolCount = pickToolCallCount(activity);

  // 폴백 우선순위: cachedIssue (Jira live) → top-level (worktree collector가 .jira-context.json에서 직접 직렬화한 값).
  // cold-start 시 cachedIssue=null 동안에도 .jira-context.json의 메타로 카드를 그릴 수 있게 함.
  const summary = cachedIssue?.summary ?? worktree.summary ?? null;
  const status = cachedIssue?.status ?? worktree.status ?? null;
  const priority = cachedIssue?.priority ?? worktree.priority ?? null;
  const assignee = cachedIssue?.assignee ?? null; // top-level에는 assignee 없음
  const issueType = cachedIssue?.issuetype ?? null;

  const sSlug = noContext ? 'neutral' : statusSlug(status);
  const pSlug = noContext ? 'neutral' : prioritySlug(priority);

  const showStatusBadge = !noContext && status != null;

  // Stale = Jira 상태가 완료인데 worktree가 아직 살아있음 (정리 대상).
  const isStale = !noContext && status === '완료';

  // 카드 활성 상태 클래스: awaiting(우선) > busy > idle.
  const stateClass = isAwaiting
    ? 'wt-card--awaiting'
    : isBusy
      ? 'wt-card--busy'
      : '';

  const cardClass = [
    'wt-card',
    `wt-card--prio-${pSlug}`,
    stateClass,
    isStale ? 'wt-card--stale' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      {/* === 1단: 헤더 (taskId + type + meta + status badge) === */}
      <header className="wt-card__header">
        <span className="wt-card__task-id">
          {taskId ?? lastPathSegment(path)}
        </span>
        {issueType && <span className="wt-card__issue-type">{issueType}</span>}
        {noContext && <span className="wt-card__no-context-badge" title={path}>no jira</span>}
        {isAwaiting && <span className="wt-card__awaiting-badge">⏵ 응답 대기</span>}
        {isStale && <span className="wt-card__stale-badge">stale</span>}
        <span className="wt-card__header-spacer" />
        {toolCount > 0 && (
          <span className="wt-card__tool-count" title={`이번 세션 도구 호출 ${toolCount}회`}>
            ⚙ {toolCount}
          </span>
        )}
        {lastActivityTs && (
          <span className="wt-card__last-activity" title={lastActivityTs}>
            {formatRelative(lastActivityTs, now)}
          </span>
        )}
        {showStatusBadge && (
          <span
            key={status}
            className={`wt-badge wt-badge--status-${sSlug} wt-badge--status-flip wt-badge--jira-status`}
            title="Jira workflow status"
          >
            <span className="wt-badge__jira-dot" aria-hidden="true" />
            {status}
          </span>
        )}
      </header>

      {/* === 2단: summary (noContext면 path 한 줄로 대체) === */}
      <div className="wt-card__summary">
        {summary != null ? (
          <span title={summary}>{summary}</span>
        ) : noContext ? (
          <span className="wt-card__summary--empty wt-card__summary--path" title={path}>
            {tildify(path)}
          </span>
        ) : (
          <span className="wt-card__summary--empty" title="no Jira summary cached">(no summary)</span>
        )}
      </div>

      {/* === 3단: SDLC stepper (lifecycle flow) — noContext면 의미 없으니 숨김 === */}
      {!noContext && <Stepper completedSteps={completedSteps} />}

      {/* === 4단: 메타 한 줄 === */}
      <dl className="wt-card__meta">
        {branch && (
          <div className="wt-card__meta-item">
            <dt className="wt-card__meta-label">branch</dt>
            <dd className="wt-card__meta-value wt-card__meta-value--mono" title={branch}>{branch}</dd>
          </div>
        )}
        {!noContext && (
          <div className="wt-card__meta-item">
            <dt className="wt-card__meta-label">path</dt>
            <dd className="wt-card__meta-value wt-card__meta-value--mono" title={path}>{lastPathSegment(path)}</dd>
          </div>
        )}
        {!noContext && priority != null && (
          <div className="wt-card__meta-item">
            <dt className="wt-card__meta-label">prio</dt>
            <dd className={`wt-card__meta-value wt-card__meta-value--prio-${pSlug}`}>{priority}</dd>
          </div>
        )}
        {!noContext && (
          <div className="wt-card__meta-item">
            <dt className="wt-card__meta-label">@</dt>
            <dd className="wt-card__meta-value">{fmt(assignee)}</dd>
          </div>
        )}
      </dl>

      <ActivityPanel activity={activity} />
    </div>
  );
}
