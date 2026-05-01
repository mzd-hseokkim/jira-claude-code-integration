import React from 'react';
import ActivityPanel from './ActivityPanel.jsx';
import Stepper from './Stepper.jsx';

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

  return (
    <div className={`wt-card wt-card--prio-${pSlug}`}>
      {/* === 1단: 헤더 (taskId + type + status badge) === */}
      <header className="wt-card__header">
        <span className="wt-card__task-id">{fmt(taskId)}</span>
        {issueType && <span className="wt-card__issue-type">{issueType}</span>}
        {noContext && <span className="wt-card__no-context-badge">no context</span>}
        <span className="wt-card__header-spacer" />
        {showStatusBadge && (
          <span
            key={status}
            className={`wt-badge wt-badge--status-${sSlug} wt-badge--status-flip`}
          >
            {status}
          </span>
        )}
      </header>

      {/* === 2단: summary === */}
      <div className="wt-card__summary">
        {summary != null
          ? <span title={summary}>{summary}</span>
          : <span className="wt-card__summary--empty" title="no Jira summary cached">(no summary)</span>}
      </div>

      {/* === 3단: SDLC stepper (lifecycle flow) === */}
      <Stepper completedSteps={completedSteps} />

      {/* === 4단: 메타 한 줄 (branch · path · priority · assignee) === */}
      <dl className="wt-card__meta">
        <div className="wt-card__meta-item">
          <dt className="wt-card__meta-label">branch</dt>
          <dd className="wt-card__meta-value wt-card__meta-value--mono" title={branch}>{fmt(branch)}</dd>
        </div>
        <div className="wt-card__meta-item">
          <dt className="wt-card__meta-label">path</dt>
          <dd className="wt-card__meta-value wt-card__meta-value--mono" title={path}>{lastPathSegment(path)}</dd>
        </div>
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
