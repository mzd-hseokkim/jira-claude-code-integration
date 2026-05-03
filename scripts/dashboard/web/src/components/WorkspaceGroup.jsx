import React from 'react';
import { formatRelative } from '../utils/relativeTime.js';

/**
 * health 값을 CSS 클래스 suffix로 변환.
 * 알 수 없는 값은 'unknown'으로 fallback.
 * @param {string|undefined} health
 * @returns {string}
 */
function healthBadgeClass(health) {
  switch (health) {
    case 'healthy':
    case 'creds-missing':
    case 'no-worktrees':
    case 'unknown':
      return health;
    default:
      return 'unknown';
  }
}

/**
 * Workspace 그룹 헤더 + children slot.
 *
 * @param {object} props
 * @param {object} props.workspace   WorkspaceEntry (GET /workspaces 항목) 또는 null (fallback 그룹)
 * @param {string} props.label       헤더에 표시할 레이블 (basename 또는 "(no workspace)")
 * @param {number} props.count       필터 적용 후 카드 수
 * @param {React.ReactNode} props.children
 */
export default function WorkspaceGroup({ workspace, label, count, children }) {
  const health = workspace?.health;
  const badgeSuffix = healthBadgeClass(health);
  const lastSeenAt = workspace?.lastSeenAt ?? null;
  const relTime = formatRelative(lastSeenAt);

  return (
    <section className="workspace-group">
      <header
        className="workspace-group__header"
        title={workspace?.path ?? ''}
      >
        <span className={`health-badge health-badge--${badgeSuffix}`} aria-label={`health: ${badgeSuffix}`} />
        <span className="workspace-group__name">{label}</span>
        <span className="workspace-group__meta">
          <span className="workspace-group__count">{count}개</span>
          <span className="workspace-group__sep">·</span>
          <span className="workspace-group__time">{relTime}</span>
        </span>
      </header>
      <div className="workspace-group__cards">
        {children}
      </div>
    </section>
  );
}
