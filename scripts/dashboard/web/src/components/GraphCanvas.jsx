import React from 'react';

export default function GraphCanvas({ worktrees }) {
  const count = Array.isArray(worktrees) ? worktrees.length : 0;
  return (
    <main className="graph-canvas" data-testid="graph-canvas" aria-label="그래프 뷰">
      <div className="graph-canvas__placeholder">
        <p className="graph-canvas__title">그래프 뷰 (준비 중)</p>
        <p className="graph-canvas__hint">
          {count > 0
            ? `${count}개의 worktree를 그래프로 시각화할 예정입니다.`
            : '시각화할 worktree가 없습니다.'}
        </p>
      </div>
    </main>
  );
}
