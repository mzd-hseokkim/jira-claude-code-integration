import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

/**
 * d3-force 기반 force-directed 레이아웃 훅.
 *
 * - 입력 nodes/edges가 변경되면 simulation을 재초기화한다.
 * - tick마다 RAF throttle을 통해 한 frame당 1회만 setNodes 호출.
 * - unmount 시 simulation.stop() + RAF cancel.
 * - pinnedRef.current[id] = {x, y} 가 있으면 그 노드는 그 좌표에 고정 (fx/fy).
 *   사용자가 드래그한 노드를 잡아두는 용도. 반환된 stop()으로 외부에서도 simulation 정지 가능.
 *
 * @param {import('@xyflow/react').Node[]} initialNodes  - React Flow Node 배열 (position 포함)
 * @param {import('@xyflow/react').Edge[]} edges         - React Flow Edge 배열
 * @param {(updater: (prev: import('@xyflow/react').Node[]) => import('@xyflow/react').Node[]) => void} setNodes
 * @param {{ pinnedRef?: React.MutableRefObject<Record<string, {x:number,y:number}>> }} [opts]
 */
export function useForceLayout(initialNodes, edges, setNodes, opts = {}) {
  const { pinnedRef } = opts;
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

    // d3가 mutate할 복사본 생성. pinnedRef에 좌표가 있으면 fx/fy로 고정.
    const pinned = pinnedRef?.current ?? {};
    const d3Nodes = initialNodes.map(n => {
      const pin = pinned[n.id];
      const base = {
        id: n.id,
        x: n.position?.x ?? 0,
        y: n.position?.y ?? 0,
      };
      if (pin) {
        base.fx = pin.x;
        base.fy = pin.y;
      }
      return base;
    });
    d3NodesRef.current = d3Nodes;

    const d3Links = edges.map(e => ({
      source: e.source,
      target: e.target,
    }));

    const simulation = forceSimulation(d3Nodes)
      .force('link', forceLink(d3Links).id(d => d.id).distance(180).strength(0.6))
      .force('charge', forceManyBody().strength(-900).distanceMax(600))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(80))
      .alphaDecay(0.04)
      .alphaMin(0.02);

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
            // 사용자가 직접 드래그 중인 노드(dragging=true)는 RF가 좌표를
            // 직접 갱신하므로 simulation이 덮어쓰지 않게 한다.
            if (node.dragging) return node;
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

  // 외부에서 노드를 pin/unpin 할 때 사용. simulation에 즉시 반영하고 살짝 재가열.
  return {
    pinNode: (id, x, y) => {
      const sim = simRef.current;
      if (!sim) return;
      const node = d3NodesRef.current.find(n => n.id === id);
      if (!node) return;
      node.fx = x;
      node.fy = y;
      sim.alpha(0.3).restart();
    },
    unpinNode: (id) => {
      const sim = simRef.current;
      if (!sim) return;
      const node = d3NodesRef.current.find(n => n.id === id);
      if (!node) return;
      delete node.fx;
      delete node.fy;
      sim.alpha(0.3).restart();
    },
  };
}
