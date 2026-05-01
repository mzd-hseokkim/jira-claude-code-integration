import React from 'react';
import ActivityPanel from './ActivityPanel.jsx';

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
 * 카드 한 장. WorktreeState를 prop으로 받아 7개 필드 + ActivityPanel을 표시.
 *
 * @param {{ worktree: import('../state/reducer.js').WorktreeState }} props
 */
export default function WorktreeCard({ worktree }) {
  const { path, branch, taskId, noContext, cachedIssue, activity = [] } = worktree;

  // 폴백 우선순위: cachedIssue (Jira live) → top-level (worktree collector가 .jira-context.json에서 직접 직렬화한 값).
  // cold-start 시 cachedIssue=null 동안에도 .jira-context.json의 메타로 카드를 그릴 수 있게 함.
  const summary = cachedIssue?.summary ?? worktree.summary ?? null;
  const status = cachedIssue?.status ?? worktree.status ?? null;
  const priority = cachedIssue?.priority ?? worktree.priority ?? null;
  const assignee = cachedIssue?.assignee ?? null; // top-level에는 assignee 없음
  const issueType = cachedIssue?.issuetype ?? null;

  return (
    <div className="wt-card">
      <div className="wt-card__header">
        <span className="wt-card__task-id">{fmt(taskId)}</span>
        {noContext && <span className="wt-card__no-context-badge">no context</span>}
        {issueType && <span className="wt-card__issue-type">{issueType}</span>}
      </div>

      <div className="wt-card__summary" title={summary ?? EMPTY}>
        {fmt(summary)}
      </div>

      <dl className="wt-card__fields">
        <div className="wt-card__field">
          <dt>Branch</dt>
          <dd>{fmt(branch)}</dd>
        </div>
        <div className="wt-card__field">
          <dt>Path</dt>
          <dd className="wt-card__path" title={path}>{path}</dd>
        </div>
        <div className="wt-card__field">
          <dt>Status</dt>
          <dd>{noContext ? EMPTY : fmt(status)}</dd>
        </div>
        <div className="wt-card__field">
          <dt>Priority</dt>
          <dd>{noContext ? EMPTY : fmt(priority)}</dd>
        </div>
        <div className="wt-card__field">
          <dt>Assignee</dt>
          <dd>{noContext ? EMPTY : fmt(assignee)}</dd>
        </div>
      </dl>

      <ActivityPanel activity={activity} />
    </div>
  );
}
