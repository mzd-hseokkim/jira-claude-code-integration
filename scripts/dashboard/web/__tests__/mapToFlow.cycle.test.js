/**
 * MAE-267: mapToFlow의 isolated / cycle 플래그 부착 테스트.
 */
import { describe, it, expect } from 'vitest';
import { mapToFlow } from '../src/components/graph/mapToFlow.js';

const graphData = {
  nodes: [
    { id: 'A', label: 'A', data: {} },
    { id: 'B', label: 'B', data: {} },
    { id: 'C', label: 'C', data: {} },
  ],
  edges: [
    { id: 'e1', source: 'A', target: 'B', type: 'blocks', data: {} },
    { id: 'e2', source: 'B', target: 'A', type: 'blocks', data: {} },
  ],
};

describe('mapToFlow + isolated/cycle', () => {
  it('U10: isolatedSet 전달 시 해당 노드만 data.isolated=true', () => {
    const { flowNodes } = mapToFlow(graphData, { isolatedSet: new Set(['C']) });
    const byId = Object.fromEntries(flowNodes.map(n => [n.id, n.data.isolated]));
    expect(byId).toEqual({ A: false, B: false, C: true });
  });

  it('U11: cycleEdgeSet 전달 시 해당 엣지만 data.cycle=true', () => {
    const { flowEdges } = mapToFlow(graphData, { cycleEdgeSet: new Set(['e1']) });
    const byId = Object.fromEntries(flowEdges.map(e => [e.id, e.data.cycle]));
    expect(byId).toEqual({ e1: true, e2: false });
  });

  it('U12: options 미전달 시 isolated/cycle 모두 false (기존 동작 유지)', () => {
    const { flowNodes, flowEdges } = mapToFlow(graphData);
    expect(flowNodes.every(n => n.data.isolated === false)).toBe(true);
    expect(flowEdges.every(e => e.data.cycle === false)).toBe(true);
    // dimmed 동작도 깨지지 않아야 함
    expect(flowNodes.every(n => n.data.dimmed === false)).toBe(true);
  });

  it('isolated와 dimmed가 독립적으로 누적', () => {
    const { flowNodes } = mapToFlow(graphData, {
      matchedKeys: new Set(['A']),
      isolatedSet: new Set(['C']),
    });
    const c = flowNodes.find(n => n.id === 'C');
    expect(c.data.dimmed).toBe(true);
    expect(c.data.isolated).toBe(true);
  });
});
