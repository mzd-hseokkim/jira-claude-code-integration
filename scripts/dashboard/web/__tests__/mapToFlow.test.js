import { describe, it, expect } from 'vitest';
import { MarkerType } from '@xyflow/react';
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

  it('U3: edge 레벨 markerEnd가 관계 타입별 stroke 색으로 부여된다', () => {
    const graphData = makeGraphData([
      { id: 'e1', source: 'MAE-1', target: 'MAE-2', type: 'blocks', data: {} },
      { id: 'e2', source: 'MAE-1', target: 'MAE-3', type: 'parent', data: {} },
      { id: 'e3', source: 'MAE-1', target: 'MAE-4', type: 'epic',   data: {} },
    ]);
    const { flowEdges } = mapToFlow(graphData);
    const byId = Object.fromEntries(flowEdges.map(e => [e.id, e]));
    expect(byId.e1.markerEnd).toMatchObject({ type: MarkerType.ArrowClosed, color: '#dc2626' });
    expect(byId.e2.markerEnd).toMatchObject({ type: MarkerType.ArrowClosed, color: '#64748b' });
    expect(byId.e3.markerEnd).toMatchObject({ type: MarkerType.ArrowClosed, color: '#9333ea' });
  });
});
