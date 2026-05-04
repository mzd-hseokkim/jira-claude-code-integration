/**
 * graph-stability.test.js — MAE-328 회귀 방지 단위 테스트
 *
 * 검증 항목:
 *  (a) selectGraphData 1-슬롯 캐시: 동일 콘텐츠 입력 시 동일 참조 반환 (U1, U2, U3)
 *  (b) mapToFlow 1-슬롯 캐시: 동일 입력 시 동일 참조 반환 (U4, U5)
 *  (c) mergeNodesById: position 보존 + 신규 id 추가 + 사라진 id 제거 (U8, U9)
 *  (d) selectGraphData → mapToFlow 파이프라인: 동일 worktrees 입력 시 flowNodes 참조 안정 (통합)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectGraphData,
  __resetGraphCache,
} from '../src/selectors/graph.js';
import {
  mapToFlow,
  __resetMapToFlowCache,
} from '../src/components/graph/mapToFlow.js';
import {
  mergeNodesById,
} from '../src/components/GraphCanvas.jsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorktree(key, overrides = {}) {
  return {
    cachedIssue: {
      key,
      summary: `Summary of ${key}`,
      status: 'In Progress',
      assignee: 'dev',
      issuetype: 'Story',
      links: { blocks: [], blockedBy: [] },
      parent: null,
      epic: null,
      ...overrides,
    },
  };
}

function makeRFNode(id, x = 0, y = 0, extraData = {}) {
  return {
    id,
    type: 'graphNode',
    position: { x, y },
    data: { label: id, ...extraData },
  };
}

// ---------------------------------------------------------------------------
// (a) selectGraphData 1-슬롯 캐시 (U1, U2, U3)
// ---------------------------------------------------------------------------

describe('selectGraphData — 1-슬롯 캐시 (MAE-328)', () => {
  beforeEach(() => {
    __resetGraphCache();
  });

  // U1: 동일 콘텐츠 입력 2회 → 동일 참조
  it('U1: 동일 콘텐츠 worktrees 2회 호출 시 동일 참조 반환', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1'),
      '/b': makeWorktree('MAE-2'),
    };
    const r1 = selectGraphData(worktrees);
    const r2 = selectGraphData(worktrees);
    expect(r1).toBe(r2); // 참조 동등성 (===)
  });

  // U1 변형: 콘텐츠 동일한 새 객체 (같은 내용, 다른 참조)
  it('U1b: 콘텐츠 동일한 새 worktrees 객체로 호출해도 동일 참조 반환', () => {
    const wt1a = { '/a': makeWorktree('MAE-1') };
    const r1 = selectGraphData(wt1a);
    // 콘텐츠 동일한 새 객체
    const wt1b = { '/a': makeWorktree('MAE-1') };
    const r2 = selectGraphData(wt1b);
    expect(r1).toBe(r2);
  });

  // U2: 표시 필드(status/summary)가 변경되면 새 참조 반환
  it('U2: status 변경 시 새 참조 반환 (stale 방지)', () => {
    const wt1 = { '/a': makeWorktree('MAE-1', { status: 'In Progress' }) };
    const r1 = selectGraphData(wt1);

    __resetGraphCache();

    const wt2 = { '/a': makeWorktree('MAE-1', { status: 'Done' }) };
    const r2 = selectGraphData(wt2);
    expect(r1).not.toBe(r2);
    expect(r2.nodes[0].data.status).toBe('Done');
  });

  // U3: 노드 id 추가 시 새 참조 + 추가된 노드 포함
  it('U3: 노드 추가 후 호출 시 새 참조 반환 + 새 노드 포함', () => {
    const wt1 = { '/a': makeWorktree('MAE-1') };
    const r1 = selectGraphData(wt1);

    __resetGraphCache();

    const wt2 = { '/a': makeWorktree('MAE-1'), '/b': makeWorktree('MAE-2') };
    const r2 = selectGraphData(wt2);
    expect(r1).not.toBe(r2);
    expect(r2.nodes.map(n => n.id)).toContain('MAE-2');
  });
});

// ---------------------------------------------------------------------------
// (b) mapToFlow 1-슬롯 캐시 (U4, U5)
// ---------------------------------------------------------------------------

describe('mapToFlow — 1-슬롯 캐시 (MAE-328)', () => {
  beforeEach(() => {
    __resetGraphCache();
    __resetMapToFlowCache();
  });

  // U4: 동일 graphData 참조 + 동일 옵션 2회 → 동일 참조
  it('U4: 동일 graphData + 동일 옵션 2회 호출 시 동일 참조 반환', () => {
    const graphData = selectGraphData({ '/a': makeWorktree('MAE-1') });
    const r1 = mapToFlow(graphData);
    const r2 = mapToFlow(graphData);
    expect(r1).toBe(r2);
  });

  // U5: matchedKeys 변경 시 새 참조 반환 + dimmed 플래그 갱신
  it('U5: matchedKeys 변경 시 새 참조 반환', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1'),
      '/b': makeWorktree('MAE-2'),
    };
    const graphData = selectGraphData(worktrees);

    const r1 = mapToFlow(graphData, { matchedKeys: null });
    const matchedSet = new Set(['MAE-1']);
    const r2 = mapToFlow(graphData, { matchedKeys: matchedSet });

    expect(r1).not.toBe(r2);
    // MAE-2 노드는 dimmed
    const mae2 = r2.flowNodes.find(n => n.id === 'MAE-2');
    expect(mae2.data.dimmed).toBe(true);
    // MAE-1 노드는 dimmed 아님
    const mae1 = r2.flowNodes.find(n => n.id === 'MAE-1');
    expect(mae1.data.dimmed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (c) mergeNodesById (U8, U9)
// ---------------------------------------------------------------------------

describe('mergeNodesById (MAE-328)', () => {
  // U8: 기존 id → position 보존, data는 신규 값으로 교체
  it('U8: 기존 id의 position이 보존되고 data는 신규 값으로 교체된다', () => {
    const prev = [makeRFNode('A', 100, 200, { label: 'old' })];
    const next = [makeRFNode('A', 0, 0, { label: 'new' })];

    const result = mergeNodesById(prev, next);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A');
    // position은 prev 값 보존
    expect(result[0].position).toEqual({ x: 100, y: 200 });
    // data는 next 값 (label: 'new')
    expect(result[0].data.label).toBe('new');
  });

  // U9a: 신규 id 추가 — 기존 A 보존 + 신규 B 추가 (next pos 사용)
  it('U9a: 신규 id 추가 시 기존 id position 보존 + 신규 id는 next position 그대로', () => {
    const prev = [makeRFNode('A', 100, 200)];
    const next = [makeRFNode('A', 0, 0), makeRFNode('B', 50, 60)];

    const result = mergeNodesById(prev, next);

    expect(result).toHaveLength(2);
    // A: position 유지
    const a = result.find(n => n.id === 'A');
    expect(a.position).toEqual({ x: 100, y: 200 });
    // B: next position 그대로
    const b = result.find(n => n.id === 'B');
    expect(b.position).toEqual({ x: 50, y: 60 });
  });

  // U9b: 사라진 id 제거 — prev=[A,B], next=[B] → result=[B]
  it('U9b: 사라진 id는 결과에서 제거된다', () => {
    const prev = [makeRFNode('A', 100, 200), makeRFNode('B', 300, 400)];
    const next = [makeRFNode('B', 0, 0)];

    const result = mergeNodesById(prev, next);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('B');
    // B의 position은 prev 값 보존
    expect(result[0].position).toEqual({ x: 300, y: 400 });
  });

  // U9c: 첫 마운트 (prev 비어 있음) → 모두 신규, next position 사용
  it('U9c: 첫 마운트 시 prev가 비어 있으면 모두 신규로 next position 사용', () => {
    const prev = [];
    const next = [makeRFNode('A', 10, 20), makeRFNode('B', 30, 40)];

    const result = mergeNodesById(prev, next);

    expect(result).toHaveLength(2);
    expect(result.find(n => n.id === 'A').position).toEqual({ x: 10, y: 20 });
    expect(result.find(n => n.id === 'B').position).toEqual({ x: 30, y: 40 });
  });
});

// ---------------------------------------------------------------------------
// (d) 통합: selectGraphData → mapToFlow 파이프라인 참조 안정성
// ---------------------------------------------------------------------------

describe('selectGraphData → mapToFlow 파이프라인 참조 안정성 (MAE-328)', () => {
  beforeEach(() => {
    __resetGraphCache();
    __resetMapToFlowCache();
  });

  it('동일 worktrees 객체 반복 입력 시 flowNodes/flowEdges 참조 불변', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1'),
      '/b': makeWorktree('MAE-2'),
    };

    const g1 = selectGraphData(worktrees);
    const m1 = mapToFlow(g1);

    const g2 = selectGraphData(worktrees);
    const m2 = mapToFlow(g2);

    // 참조 안정성
    expect(g1).toBe(g2);
    expect(m1).toBe(m2);
  });

  it('콘텐츠 변경 시 selectGraphData 새 참조 → mapToFlow도 새 참조', () => {
    const worktrees1 = { '/a': makeWorktree('MAE-1', { status: 'In Progress' }) };
    const g1 = selectGraphData(worktrees1);
    const m1 = mapToFlow(g1);

    __resetGraphCache();
    __resetMapToFlowCache();

    const worktrees2 = { '/a': makeWorktree('MAE-1', { status: 'Done' }) };
    const g2 = selectGraphData(worktrees2);
    const m2 = mapToFlow(g2);

    expect(g1).not.toBe(g2);
    expect(m1).not.toBe(m2);
  });
});
