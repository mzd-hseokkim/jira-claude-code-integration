/**
 * selectGraphData 결과를 React Flow Node/Edge 배열로 변환.
 *
 * @param {{ nodes: Array, edges: Array }} graphData
 * @param {{ matchedKeys?: Set<string> | null, isolatedSet?: Set<string> | null, cycleEdgeSet?: Set<string> | null }} [options]
 *   matchedKeys === null  → 필터 비활성, 모두 매치
 *   matchedKeys instanceof Set → 그 안에 있는 key만 매치, 외부는 dimmed
 *   isolatedSet → 해당 노드 id에 data.isolated = true (MAE-267)
 *   cycleEdgeSet → 해당 엣지 id에 data.cycle = true (MAE-267)
 * @returns {{ flowNodes: import('@xyflow/react').Node[], flowEdges: import('@xyflow/react').Edge[] }}
 */
export function mapToFlow({ nodes, edges }, options = {}) {
  const { matchedKeys = null, isolatedSet = null, cycleEdgeSet = null } = options;
  const isMatched = (key) => matchedKeys === null || matchedKeys.has(key);
  const isIsolated = (key) => isolatedSet !== null && isolatedSet.has(key);
  const isCycle = (id) => cycleEdgeSet !== null && cycleEdgeSet.has(id);

  const flowNodes = nodes.map((n, i) => {
    const dimmed = !isMatched(n.id);
    const isolated = isIsolated(n.id);
    return {
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
        dimmed,
        isolated,
      },
    };
  });

  const flowEdges = edges.map(e => {
    const dimmed = !isMatched(e.source) || !isMatched(e.target);
    const cycle = isCycle(e.id);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      className: dimmed ? 'marching-ants graph-edge--dimmed' : 'marching-ants',
      data: { ...(e.data ?? {}), dimmed, cycle },
    };
  });

  return { flowNodes, flowEdges };
}
