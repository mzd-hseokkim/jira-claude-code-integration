/**
 * 그래프 필터 순수 함수 테스트 (MAE-265).
 */
import { describe, it, expect } from 'vitest';
import {
  buildFilterOptions,
  computeMatchedKeys,
  isFilterActive,
} from '../src/components/graph/filter.js';

function wt(key, status, assignee) {
  return {
    [`/work/${key}`]: {
      path: `/work/${key}`,
      cachedIssue: { key, status, assignee, summary: `${key} sum` },
    },
  };
}
function merge(...objs) {
  return Object.assign({}, ...objs);
}

describe('buildFilterOptions', () => {
  it('U1: 빈도 내림차순 → 알파벳 순으로 status / assignee 옵션 반환', () => {
    const worktrees = merge(
      wt('A-1', '진행 중', 'alice'),
      wt('A-2', '진행 중', 'bob'),
      wt('A-3', '할 일',   'alice'),
    );
    const { statuses, assignees } = buildFilterOptions(worktrees);
    expect(statuses).toEqual([
      { value: '진행 중', count: 2 },
      { value: '할 일',   count: 1 },
    ]);
    expect(assignees).toEqual([
      { value: 'alice', count: 2 },
      { value: 'bob',   count: 1 },
    ]);
  });

  it('U2: assignee 누락 → "Unassigned"로 집계', () => {
    const worktrees = merge(
      wt('A-1', '진행 중', null),
      wt('A-2', '진행 중', undefined),
      wt('A-3', '진행 중', 'alice'),
    );
    const { assignees } = buildFilterOptions(worktrees);
    expect(assignees).toEqual([
      { value: 'Unassigned', count: 2 },
      { value: 'alice',      count: 1 },
    ]);
  });

  it('U3: cachedIssue 없는 worktree는 무시', () => {
    const worktrees = {
      '/work/no-cache': { path: '/work/no-cache' },
      ...wt('A-1', '진행 중', 'alice'),
    };
    const { statuses } = buildFilterOptions(worktrees);
    expect(statuses).toEqual([{ value: '진행 중', count: 1 }]);
  });

  it('U4: null worktrees → 빈 옵션', () => {
    expect(buildFilterOptions(null)).toEqual({ statuses: [], assignees: [] });
  });
});

describe('isFilterActive', () => {
  it('U5: 양쪽 비어 있으면 false', () => {
    expect(isFilterActive(new Set(), new Set())).toBe(false);
  });
  it('U6: 한쪽에라도 값이 있으면 true', () => {
    expect(isFilterActive(new Set(['진행 중']), new Set())).toBe(true);
    expect(isFilterActive(new Set(), new Set(['alice']))).toBe(true);
  });
});

describe('computeMatchedKeys', () => {
  const worktrees = merge(
    wt('A-1', '진행 중', 'alice'),
    wt('A-2', '진행 중', 'bob'),
    wt('A-3', '할 일',   'alice'),
  );

  it('U7: 필터 비활성 → null (전부 매치)', () => {
    expect(computeMatchedKeys(worktrees, new Set(), new Set())).toBeNull();
  });

  it('U8: status 단일 필터', () => {
    const m = computeMatchedKeys(worktrees, new Set(['진행 중']), new Set());
    expect(m).toEqual(new Set(['A-1', 'A-2']));
  });

  it('U9: assignee 단일 필터', () => {
    const m = computeMatchedKeys(worktrees, new Set(), new Set(['alice']));
    expect(m).toEqual(new Set(['A-1', 'A-3']));
  });

  it('U10: status + assignee AND 결합', () => {
    const m = computeMatchedKeys(
      worktrees,
      new Set(['진행 중']),
      new Set(['alice'])
    );
    expect(m).toEqual(new Set(['A-1']));
  });

  it('U11: 다중 status (OR within group)', () => {
    const m = computeMatchedKeys(
      worktrees,
      new Set(['진행 중', '할 일']),
      new Set()
    );
    expect(m).toEqual(new Set(['A-1', 'A-2', 'A-3']));
  });

  it('U12: phantom 키(worktrees에 없음)는 항상 비매치', () => {
    // computeMatchedKeys는 worktrees의 cachedIssue만 본다.
    // phantom 키 'A-99'는 어디에도 없으므로 결과 set에 안 들어옴.
    const m = computeMatchedKeys(worktrees, new Set(['진행 중']), new Set());
    expect(m.has('A-99')).toBe(false);
  });
});
