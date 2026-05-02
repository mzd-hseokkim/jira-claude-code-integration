import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force';

/**
 * d3-force 기반 force-directed 레이아웃 훅.
 *
 * - 입력 nodes/edges가 변경되면 simulation을 재초기화한다.
 * - tick마다 RAF throttle을 통해 한 frame당 1회만 setNodes 호출.
 * - unmount 시 simulation.stop() + RAF cancel.
 *
 * @param {import('@xyflow/react').Node[]} initialNodes  - React Flow Node 배열 (position 포함)
 * @param {import('@xyflow/react').Edge[]} edges         - React Flow Edge 배열
 * @param {(updater: (prev: import('@xyflow/react').Node[]) => import('@xyflow/react').Node[]) => void} setNodes
 */
export function useForceLayout(initialNodes, edges, setNodes) {
  // d3 simulation은 nodes를 mutate하므로 ref에 보관.
  const simRef = useRef(null);
  const rafRef = useRef(null);
  // 현재 simulation에 사용 중인 d3 노드 배열 ref (좌표 값 읽기 용도).
  const d3NodesRef = useRef([]);

  // deps 변화 감지용 key: 노드 id 목록 + 엣지 id 목록
  const nodeIdsKey = initialNodes.map(n => n.id).join(',');
  const edgeIdsKey = edges.map(e => e.id).join(',');

  useEffect(() => {
    if (initialNodes.length === 0) return;

    // d3가 mutate할 복사본 생성 (id, x, y만 필요)
    const d3Nodes = initialNodes.map(n => ({
      id: n.id,
      x: n.position?.x ?? 0,
      y: n.position?.y ?? 0,
    }));
    d3NodesRef.current = d3Nodes;

    const d3Links = edges.map(e => ({
      source: e.source,
      target: e.target,
    }));

    const simulation = forceSimulation(d3Nodes)
      .force('link', forceLink(d3Links).id(d => d.id).distance(120))
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(0, 0))
      .alphaDecay(0.028);

    simRef.current = simulation;

    let pending = false;

    simulation.on('tick', () => {
      if (pending) return; // 이미 RAF 예약됨
      pending = true;
      rafRef.current = requestAnimationFrame(() => {
        pending = false;
        const positions = {};
        for (const n of d3NodesRef.current) {
          positions[n.id] = { x: n.x, y: n.y };
        }
        setNodes(prev =>
          prev.map(node => {
            const pos = positions[node.id];
            if (!pos) return node;
            return { ...node, position: pos };
          })
        );
      });
    });

    return () => {
      simulation.stop();
      simRef.current = null;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIdsKey, edgeIdsKey]);
}
