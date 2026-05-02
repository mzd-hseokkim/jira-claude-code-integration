/**
 * mapToFlow의 matchedKeys 기반 dimmed 처리 테스트 (MAE-265).
 */
import { describe, it, expect } from 'vitest';
import { mapToFlow } from '../src/components/graph/mapToFlow.js';

const graphData = {
  nodes: [
    { id: 'A-1', label: 'A-1', data: { status: '진행 중' } },
    { id: 'A-2', label: 'A-2', data: { status: '할 일' } },
    { id: 'A-3', label: 'A-3', data: { phantom: true } },
  ],
  edges: [
    { id: 'e1', source: 'A-1', target: 'A-2', type: 'blocks', data: {} },
    { id: 'e2', source: 'A-2', target: 'A-3', type: 'parent', data: {} },
  ],
};

describe('mapToFlow + matchedKeys', () => {
  it('U1: matchedKeys=null → 모든 노드 dimmed=false', () => {
    const { flowNodes, flowEdges } = mapToFlow(graphData, { matchedKeys: null });
    expect(flowNodes.every(n => n.data.dimmed === false)).toBe(true);
    expect(flowEdges.every(e => e.className === 'marching-ants')).toBe(true);
  });

  it('U2: matchedKeys 미지정 → null과 동일 동작', () => {
    const { flowNodes } = mapToFlow(graphData);
    expect(flowNodes.every(n => n.data.dimmed === false)).toBe(true);
  });

  it('U3: matchedKeys=Set(["A-1"]) → A-1만 살아있고 나머지 dimmed', () => {
    const { flowNodes, flowEdges } = mapToFlow(graphData, {
      matchedKeys: new Set(['A-1']),
    });
    const dimmedById = Object.fromEntries(flowNodes.map(n => [n.id, n.data.dimmed]));
    expect(dimmedById).toEqual({ 'A-1': false, 'A-2': true, 'A-3': true });

    // 양쪽 endpoint 모두 매치되어야 엣지가 살아있음.
    const e1 = flowEdges.find(e => e.id === 'e1');
    expect(e1.data.dimmed).toBe(true); // A-2 비매치
    expect(e1.className).toContain('graph-edge--dimmed');
  });

  it('U4: 양쪽 endpoint 모두 매치 → 엣지 살아있음', () => {
    const { flowEdges } = mapToFlow(graphData, {
      matchedKeys: new Set(['A-1', 'A-2']),
    });
    const e1 = flowEdges.find(e => e.id === 'e1');
    expect(e1.data.dimmed).toBe(false);
    expect(e1.className).toBe('marching-ants');
  });

  it('U5: phantom 노드(A-3)는 matchedKeys에 없으면 dimmed', () => {
    const { flowNodes } = mapToFlow(graphData, {
      matchedKeys: new Set(['A-1', 'A-2']),
    });
    const phantom = flowNodes.find(n => n.id === 'A-3');
    expect(phantom.data.dimmed).toBe(true);
    expect(phantom.data.phantom).toBe(true);
  });
});
