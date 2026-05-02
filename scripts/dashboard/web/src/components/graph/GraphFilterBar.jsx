import React from 'react';

/**
 * 그래프 뷰 status / assignee 필터 바 (MAE-265).
 *
 * - 다중 선택(Set). 같은 칩 다시 클릭하면 해제.
 * - "전체" 버튼은 그 그룹의 선택을 모두 해제.
 * - 옵션은 worktrees 빈도 기반으로 미리 계산되어 props로 들어옴.
 */
export default function GraphFilterBar({
  options,
  statusSet,
  assigneeSet,
  onToggleStatus,
  onToggleAssignee,
  onClearStatus,
  onClearAssignee,
  matchedCount,
  totalCount,
}) {
  const { statuses, assignees } = options;
  const hasActive =
    (statusSet?.size ?? 0) > 0 || (assigneeSet?.size ?? 0) > 0;

  return (
    <div className="graph-filter-bar" role="toolbar" aria-label="그래프 필터">
      <div className="graph-filter-bar__group">
        <span className="graph-filter-bar__label">STATUS</span>
        <button
          type="button"
          className={`graph-filter-chip${statusSet.size === 0 ? ' graph-filter-chip--active' : ''}`}
          onClick={onClearStatus}
          aria-pressed={statusSet.size === 0}
        >
          전체
        </button>
        {statuses.map(({ value, count }) => {
          const active = statusSet.has(value);
          return (
            <button
              key={value}
              type="button"
              className={`graph-filter-chip${active ? ' graph-filter-chip--active' : ''}`}
              onClick={() => onToggleStatus(value)}
              aria-pressed={active}
            >
              {value}
              <span className="graph-filter-chip__count">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="graph-filter-bar__group">
        <span className="graph-filter-bar__label">ASSIGNEE</span>
        <button
          type="button"
          className={`graph-filter-chip${assigneeSet.size === 0 ? ' graph-filter-chip--active' : ''}`}
          onClick={onClearAssignee}
          aria-pressed={assigneeSet.size === 0}
        >
          전체
        </button>
        {assignees.map(({ value, count }) => {
          const active = assigneeSet.has(value);
          return (
            <button
              key={value}
              type="button"
              className={`graph-filter-chip${active ? ' graph-filter-chip--active' : ''}`}
              onClick={() => onToggleAssignee(value)}
              aria-pressed={active}
            >
              {value}
              <span className="graph-filter-chip__count">{count}</span>
            </button>
          );
        })}
      </div>
      {hasActive && (
        <span className="graph-filter-bar__count" aria-live="polite">
          {matchedCount}/{totalCount} 매치
        </span>
      )}
    </div>
  );
}
