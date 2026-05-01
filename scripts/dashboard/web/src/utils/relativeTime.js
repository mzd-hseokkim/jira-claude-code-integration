/**
 * "방금 / 12초 전 / 3분 전 / 2시간 전 / 5일 전" 형태의 한국어 상대시간.
 *
 * @param {string|null|undefined} iso
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatRelative(iso, nowMs = Date.now()) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 5) return '방금';
  if (diffSec < 60) return `${diffSec}초 전`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}
