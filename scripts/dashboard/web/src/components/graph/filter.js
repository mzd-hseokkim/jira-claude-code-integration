/**
 * status / assignee 필터 모델 (MAE-265).
 *
 * 빈 Set = "필터 비활성" → 모든 노드 매치.
 * Set에 항목이 들어있으면 해당 값과 일치하는 cachedIssue만 매치.
 *
 * Phantom 노드(workspace에 worktree가 없는 외부 이슈)는 status/assignee 메타데이터가
 * 없으므로 어느 한쪽이라도 필터가 활성화되면 비매치로 판정한다.
 */

/**
 * worktrees에서 가능한 status / assignee 값을 모아 빈도 순 옵션 리스트로 반환.
 *
 * @param {Record<string, object>} worktrees
 * @returns {{ statuses: Array<{value:string, count:number}>, assignees: Array<{value:string, count:number}> }}
 */
export function buildFilterOptions(worktrees) {
  const statusCount = new Map();
  const assigneeCount = new Map();
  if (worktrees && typeof worktrees === 'object') {
    for (const wt of Object.values(worktrees)) {
      const issue = wt?.cachedIssue;
      if (!issue?.key) continue;
      if (issue.status) {
        statusCount.set(issue.status, (statusCount.get(issue.status) ?? 0) + 1);
      }
      const assignee = issue.assignee || 'Unassigned';
      assigneeCount.set(assignee, (assigneeCount.get(assignee) ?? 0) + 1);
    }
  }
  const toSorted = (m) =>
    Array.from(m, ([value, count]) => ({ value, count })).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.value.localeCompare(b.value);
    });
  return { statuses: toSorted(statusCount), assignees: toSorted(assigneeCount) };
}

/**
 * 필터가 활성 상태인지 (어느 한쪽이라도 선택값이 있으면 true).
 *
 * @param {Set<string>} statusSet
 * @param {Set<string>} assigneeSet
 */
export function isFilterActive(statusSet, assigneeSet) {
  return (statusSet?.size ?? 0) > 0 || (assigneeSet?.size ?? 0) > 0;
}

/**
 * worktrees + 필터 상태로부터 매칭되는 이슈 key Set 계산.
 * 필터 비활성이면 null 반환 (호출 측에서 "전부 매치"로 해석).
 * Phantom 키(worktrees에 없는 키)는 결과에 포함되지 않으므로 자동 비매치.
 *
 * @param {Record<string, object>} worktrees
 * @param {Set<string>} statusSet
 * @param {Set<string>} assigneeSet
 * @returns {Set<string> | null}
 */
export function computeMatchedKeys(worktrees, statusSet, assigneeSet) {
  if (!isFilterActive(statusSet, assigneeSet)) return null;
  const matched = new Set();
  if (!worktrees || typeof worktrees !== 'object') return matched;
  for (const wt of Object.values(worktrees)) {
    const issue = wt?.cachedIssue;
    if (!issue?.key) continue;
    if (statusSet.size > 0 && !statusSet.has(issue.status)) continue;
    const assignee = issue.assignee || 'Unassigned';
    if (assigneeSet.size > 0 && !assigneeSet.has(assignee)) continue;
    matched.add(issue.key);
  }
  return matched;
}
