import React from 'react';
import WorktreeCard from '../WorktreeCard.jsx';

/**
 * 그래프 노드 클릭 시 표시되는 사이드 패널.
 *
 * @param {{ worktree: object | null, onClose: () => void }} props
 *   - worktree: 실제 worktree state 객체 (null이면 phantom 노드)
 *   - onClose:  닫기 버튼 콜백
 */
export default function GraphSidePanel({ worktree, onClose }) {
  // worktree === undefined: 선택 없음 (부모에서 렌더하지 않아야 하지만 방어)
  if (worktree === undefined) return null;

  return (
    <aside className="graph-side-panel" aria-label="노드 상세">
      <button
        type="button"
        className="graph-side-panel__close"
        onClick={onClose}
        aria-label="패널 닫기"
      >
        ×
      </button>
      {worktree ? (
        <WorktreeCard worktree={worktree} />
      ) : (
        <div className="graph-side-panel__phantom">
          <p className="graph-side-panel__phantom-title">외부 이슈</p>
          <p className="graph-side-panel__phantom-desc">이 노드에 해당하는 worktree가 없습니다.</p>
        </div>
      )}
    </aside>
  );
}
