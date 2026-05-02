import { MarkerType } from '@xyflow/react';

// 관계 타입별 엣지 색상 (edgeTypes.jsx의 RELATION_STYLES와 일치).
// markerEnd 색을 stroke와 맞추기 위해 mapToFlow에서 부여.
const EDGE_STROKE = {
  blocks: '#dc2626',
  parent: '#64748b',
  epic: '#9333ea',
};

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
      // 초기 위치를 원형으로 분산시켜 simulation 수렴 속도와 결과 안정성 향상.
      position: (() => {
        const total = nodes.length;
        const angle = (i / Math.max(total, 1)) * Math.PI * 2;
        const radius = Math.max(120, total * 30);
        return {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
      })(),
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
    const stroke = EDGE_STROKE[e.type] ?? '#94a3b8';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      className: dimmed ? 'marching-ants graph-edge--dimmed' : 'marching-ants',
      data: { ...(e.data ?? {}), dimmed, cycle },
      // edge 레벨 markerEnd는 react-flow가 자동으로 <marker>를 등록해준다.
      // BezierEdge prop으로 객체를 넘기는 건 SVG marker-end attribute에 [object Object]로 들어가 안 보임.
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
        width: 18,
        height: 18,
      },
    };
  });

  return { flowNodes, flowEdges };
}
