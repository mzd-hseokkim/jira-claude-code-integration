/**
 * selectGraphData 결과를 React Flow Node/Edge 배열로 변환.
 *
 * @param {{ nodes: Array, edges: Array }} graphData
 * @returns {{ flowNodes: import('@xyflow/react').Node[], flowEdges: import('@xyflow/react').Edge[] }}
 */
export function mapToFlow({ nodes, edges }) {
  const flowNodes = nodes.map((n, i) => ({
    id: n.id,
    type: 'graphNode',
    // 초기 위치를 약간 분산시켜 simulation이 겹친 노드에서 시작하지 않게 함.
    position: {
      x: (i % 5) * 80 - 160,
      y: Math.floor(i / 5) * 80 - 100,
    },
    data: {
      label: n.label,
      ...n.data,
    },
  }));

  const flowEdges = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    className: 'marching-ants',
    data: e.data ?? {},
  }));

  return { flowNodes, flowEdges };
}
