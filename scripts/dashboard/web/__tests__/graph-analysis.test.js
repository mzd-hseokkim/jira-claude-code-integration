/**
 * MAE-267: 그래프 분석 유틸 단위 테스트.
 */
import { describe, it, expect } from 'vitest';
import { findIsolatedNodes, findCycleEdges } from '../src/components/graph/analysis.js';

const n = (id) => ({ id });
const e = (id, source, target) => ({ id, source, target });

describe('findIsolatedNodes', () => {
  it('U1: 모든 노드가 엣지로 연결됨 → 빈 Set', () => {
    const nodes = [n('A'), n('B'), n('C')];
    const edges = [e('e1', 'A', 'B'), e('e2', 'B', 'C')];
    expect(Array.from(findIsolatedNodes(nodes, edges)).sort()).toEqual([]);
  });

  it('U2: 한 노드가 어떤 엣지에도 없음 → 그 노드만 반환', () => {
    const nodes = [n('A'), n('B'), n('C')];
    const edges = [e('e1', 'A', 'B')];
    expect(Array.from(findIsolatedNodes(nodes, edges))).toEqual(['C']);
  });

  it('U3: 모든 노드 isolated → 모두 반환', () => {
    const nodes = [n('A'), n('B')];
    expect(Array.from(findIsolatedNodes(nodes, [])).sort()).toEqual(['A', 'B']);
  });

  it('빈 nodes 입력 → 빈 Set', () => {
    expect(findIsolatedNodes([], []).size).toBe(0);
  });
});

describe('findCycleEdges', () => {
  it('U4: 단순 2-cycle (A↔B)', () => {
    const nodes = [n('A'), n('B')];
    const edges = [e('e1', 'A', 'B'), e('e2', 'B', 'A')];
    expect(Array.from(findCycleEdges(nodes, edges)).sort()).toEqual(['e1', 'e2']);
  });

  it('U5: 3-cycle (A→B→C→A)', () => {
    const nodes = [n('A'), n('B'), n('C')];
    const edges = [e('e1', 'A', 'B'), e('e2', 'B', 'C'), e('e3', 'C', 'A')];
    expect(Array.from(findCycleEdges(nodes, edges)).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('U6: 사이클 없음 (DAG) → 빈 Set', () => {
    const nodes = [n('A'), n('B'), n('C')];
    const edges = [e('e1', 'A', 'B'), e('e2', 'B', 'C'), e('e3', 'A', 'C')];
    expect(findCycleEdges(nodes, edges).size).toBe(0);
  });

  it('U7: 두 개의 분리된 사이클 (A↔B, C↔D)', () => {
    const nodes = [n('A'), n('B'), n('C'), n('D')];
    const edges = [
      e('e1', 'A', 'B'), e('e2', 'B', 'A'),
      e('e3', 'C', 'D'), e('e4', 'D', 'C'),
    ];
    expect(Array.from(findCycleEdges(nodes, edges)).sort()).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('U8: 사이클 + DAG 혼재 → 사이클 엣지만', () => {
    const nodes = [n('A'), n('B'), n('C')];
    const edges = [e('e1', 'A', 'B'), e('e2', 'B', 'A'), e('e3', 'A', 'C')];
    expect(Array.from(findCycleEdges(nodes, edges)).sort()).toEqual(['e1', 'e2']);
  });

  it('U9: 자기 참조 엣지(source===target)는 무시', () => {
    const nodes = [n('A')];
    const edges = [e('e1', 'A', 'A')];
    expect(findCycleEdges(nodes, edges).size).toBe(0);
  });

  it('빈 입력 → 빈 Set', () => {
    expect(findCycleEdges([], []).size).toBe(0);
  });

  it('U10: SCC 내부 chord 엣지도 cycle로 마킹 (Tarjan SCC 정확성)', () => {
    // 4-cycle A→B→C→D→A에 chord A→C 추가 → 5개 모두 단일 SCC.
    // Gray-back-edge DFS 방식으로는 A→C 누락. SCC 방식은 모두 포함.
    const nodes = [n('A'), n('B'), n('C'), n('D')];
    const edges = [
      e('AB', 'A', 'B'),
      e('BC', 'B', 'C'),
      e('CD', 'C', 'D'),
      e('DA', 'D', 'A'),
      e('AC', 'A', 'C'),
    ];
    expect(Array.from(findCycleEdges(nodes, edges)).sort())
      .toEqual(['AB', 'AC', 'BC', 'CD', 'DA']);
  });

  it('U11: SCC와 SCC 외부로 나가는 엣지는 cycle 아님', () => {
    // A↔B (SCC) + A→C (SCC 외부)
    const nodes = [n('A'), n('B'), n('C')];
    const edges = [
      e('AB', 'A', 'B'),
      e('BA', 'B', 'A'),
      e('AC', 'A', 'C'),
    ];
    expect(Array.from(findCycleEdges(nodes, edges)).sort()).toEqual(['AB', 'BA']);
  });
});
