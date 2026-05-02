import { describe, it, expect } from 'vitest';
import { mapToFlow } from '../src/components/graph/mapToFlow.js';

const makeGraphData = (edges = []) => ({
  nodes: [{ id: 'MAE-1', label: 'MAE-1', data: {} }],
  edges,
});

describe('mapToFlow', () => {
  it('U1: 모든 edge에 className marching-ants 부여', () => {
    const graphData = makeGraphData([
      { id: 'e1', source: 'MAE-1', target: 'MAE-2', type: 'blocks',  data: {} },
      { id: 'e2', source: 'MAE-1', target: 'MAE-3', type: 'parent',  data: {} },
      { id: 'e3', source: 'MAE-1', target: 'MAE-4', type: 'epic',    data: {} },
    ]);
    const { flowEdges } = mapToFlow(graphData);
    expect(flowEdges).toHaveLength(3);
    flowEdges.forEach(edge => {
      expect(edge.className).toBe('marching-ants');
    });
  });

  it('U2: edges 배열이 비어 있을 때 빈 배열 반환, 에러 없음', () => {
    const graphData = makeGraphData([]);
    const { flowEdges } = mapToFlow(graphData);
    expect(flowEdges).toEqual([]);
  });
});
