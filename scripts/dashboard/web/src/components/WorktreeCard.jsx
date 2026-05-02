import React, { useState } from 'react';
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

  // ring buffer 외에 별도 보존되는 신호(PreToolUse 폭주 시 evict 방지).
  const fallbackEvents = {
    lastPromptEvent: worktree.lastPromptEvent ?? null,
    lastStopEvent: worktree.lastStopEvent ?? null,
  };

  const isBusy = pickIsBusy(activity, fallbackEvents);
  const isAwaiting = pickIsAwaitingUser(activity, fallbackEvents);
  const lastActivityTs = pickLastActivityTs(activity);
  const toolCount = pickToolCallCount(activity);

  // 폴백 우선순위: cachedIssue (Jira live) → top-level (worktree collector가 .jira-context.json에서 직접 직렬화한 값).
  // cold-start 시 cachedIssue=null 동안에도 .jira-context.json의 메타로 카드를 그릴 수 있게 함.
  const summary = cachedIssue?.summary ?? worktree.summary ?? null;
  const status = cachedIssue?.status ?? worktree.status ?? null;
  const priority = cachedIssue?.priority ?? worktree.priority ?? null;
  const assignee = cachedIssue?.assignee ?? null; // top-level에는 assignee 없음
  const issueType = cachedIssue?.issuetype ?? null;
  const links = cachedIssue?.links ?? null;

  // 미해결 blocker = blockedBy 중 statusCategory가 done이 아닌 것.
  const openBlockers = Array.isArray(links?.blockedBy)
    ? links.blockedBy.filter(b => b.statusCategory !== 'done')
    : [];
  const isBlocked = openBlockers.length > 0;

  const sSlug = noContext ? 'neutral' : statusSlug(status);
  const pSlug = noContext ? 'neutral' : prioritySlug(priority);

  const showStatusBadge = !noContext && status != null;

  // Stale = Jira 상태가 완료인데 worktree가 아직 살아있음 (정리 대상).
  const isStale = !noContext && status === '완료';

  // 정리 버튼 상태.
  const [cleaning, setCleaning] = useState(false);
  const [cleanupError, setCleanupError] = useState(null);

  async function handleCleanup() {
    if (!path) return;
    const ok = window.confirm(
      `worktree와 branch를 제거할까요?\n\n` +
      `- worktree: ${path}\n` +
      `- branch: ${branch ?? '(없음)'}\n\n` +
      `(uncommitted 변경이 있으면 거부됩니다.)`
    );
    if (!ok) return;
    setCleaning(true);
    setCleanupError(null);
    try {
      const res = await fetch('/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCleanupError(json.error ?? `HTTP ${res.status}`);
      }
      // 성공 시: SSE worktree.removed로 카드가 사라지므로 별도 처리 불요.
    } catch (err) {
      setCleanupError(err.message);
    } finally {
      setCleaning(false);
    }
  }

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
    isBlocked ? 'wt-card--blocked' : '',
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
        {isBlocked && (
          <span
            className="wt-card__blocked-badge"
            title={openBlockers.map(b => `${b.key} · ${b.status ?? ''}`).join('\n')}
          >
            ⛔ blocked × {openBlockers.length}
          </span>
        )}
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

      {/* === 5단: 이슈 링크 (blocks/blocked by) === */}
      {(links?.blocks?.length || links?.blockedBy?.length) ? (
        <div className="wt-card__links">
          {links.blockedBy?.length > 0 && (
            <div className="wt-card__link-row">
              <span className="wt-card__link-label">blocked by</span>
              <ul className="wt-card__link-list">
                {links.blockedBy.map(b => (
                  <li
                    key={b.key}
                    className={`wt-card__link-item${b.statusCategory === 'done' ? ' wt-card__link-item--done' : ' wt-card__link-item--open'}`}
                    title={`${b.summary ?? ''} (${b.status ?? '?'})`}
                  >
                    {b.key}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {links.blocks?.length > 0 && (
            <div className="wt-card__link-row">
              <span className="wt-card__link-label">blocks</span>
              <ul className="wt-card__link-list">
                {links.blocks.map(b => (
                  <li
                    key={b.key}
                    className={`wt-card__link-item${b.statusCategory === 'done' ? ' wt-card__link-item--done' : ''}`}
                    title={`${b.summary ?? ''} (${b.status ?? '?'})`}
                  >
                    {b.key}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      <ActivityPanel activity={activity} fallback={fallbackEvents} />

      {isStale && (
        <button
          type="button"
          className="wt-card__cleanup-fab"
          onClick={handleCleanup}
          disabled={cleaning}
          title={cleanupError ?? `${branch ?? path} 제거`}
          aria-label="worktree 및 branch 제거"
        >
          {cleaning ? '정리 중…' : '🗑 정리'}
        </button>
      )}
      {cleanupError && (
        <span className="wt-card__cleanup-error" title={cleanupError}>⚠ {cleanupError}</span>
      )}
    </div>
  );
}
