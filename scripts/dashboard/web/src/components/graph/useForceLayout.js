import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceY } from 'd3-force';

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

    // edge type을 보존해서 link 강도/거리를 분리.
    const d3Links = edges.map(e => ({
      source: e.source,
      target: e.target,
      relType: e.type,  // 'blocks' | 'parent' | 'epic'
    }));

    // parent/epic 엣지를 따라 BFS로 depth 계산 (target=부모 → 작은 y, source=자식 → 큰 y).
    // 부모-자식 계층이 위→아래로 자연스럽게 흐르도록 forceY로 끌어당기기.
    const targetY = computeHierarchyTargetY(d3Nodes, edges);

    const simulation = forceSimulation(d3Nodes)
      .force('link', forceLink(d3Links).id(d => d.id)
        // parent/epic은 짧고 강하게 (계층 응집), blocks는 길고 약하게 (느슨).
        .distance(l => (l.relType === 'parent' || l.relType === 'epic') ? 140 : 220)
        .strength(l => (l.relType === 'parent' || l.relType === 'epic') ? 0.9 : 0.3))
      .force('charge', forceManyBody().strength(-900).distanceMax(600))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(80))
      // 계층 y-pinning: depth가 정의된 노드는 그 y로 끌림. 미정의는 0.
      .force('y', forceY().y(d => targetY[d.id] ?? 0).strength(d => targetY[d.id] != null ? 0.18 : 0))
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

/**
 * parent/epic 엣지를 따라 노드의 계층 depth를 계산하고 target y 좌표를 부여.
 *
 * 규칙:
 * - parent/epic edge에서 source = 자식, target = 부모 (selectGraphData 계약).
 * - 부모는 자식보다 y가 작아야 함(위쪽). 즉 target.depth = source.depth - 1.
 * - 루트(자식 없거나 부모 없는 노드)는 depth 0에 가깝게 둔다.
 *
 * 알고리즘:
 *   1. parent/epic edge로 부모→자식 그래프 구성.
 *   2. 부모로 들어오는 엣지가 없는 노드(=루트)를 찾아 depth 0에서 시작.
 *   3. BFS로 자식 depth = 부모 depth + 1 부여.
 *   4. y = depth * 200.
 *
 * @param {Array<{id:string}>} d3Nodes
 * @param {Array<{source:string, target:string, type:string}>} edges
 * @returns {Record<string, number>} id → target y (없으면 미정의)
 */
function computeHierarchyTargetY(d3Nodes, edges) {
  // hierarchy edges만 추출. source=자식, target=부모.
  const hier = edges.filter(e => e.type === 'parent' || e.type === 'epic');
  if (hier.length === 0) return {};

  // 부모 → 자식들 map (BFS는 부모에서 자식으로 내려감).
  const childrenOf = new Map();
  // 부모로 들어오는 엣지 카운트(자식인지 판별 — 즉 본인이 다른 노드의 자식이면 카운트).
  const isChild = new Set();
  for (const e of hier) {
    isChild.add(e.source);  // source = 자식
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target).push(e.source);
  }

  const allIds = d3Nodes.map(n => n.id);
  // 루트 후보: 부모(target) 위치에는 등장하는데 자식(source)으로는 등장 안 하는 노드.
  // 또는 hierarchy edge에 전혀 등장 안 하는 노드도 그냥 depth 0에서 시작.
  const targets = new Set(hier.map(e => e.target));
  const roots = allIds.filter(id => targets.has(id) && !isChild.has(id));

  const depth = {};
  const queue = [];
  for (const r of roots) { depth[r] = 0; queue.push(r); }

  while (queue.length) {
    const cur = queue.shift();
    const kids = childrenOf.get(cur) ?? [];
    for (const k of kids) {
      if (k in depth) continue; // 이미 더 가까운 부모로 부여됨
      depth[k] = depth[cur] + 1;
      queue.push(k);
    }
  }

  // y 좌표로 변환 (depth 0 = y -200 정도 위, depth 1 = 0, 2 = +200, ...).
  // 평균 depth를 0에 맞춰 캔버스 중앙에 펼치도록 조정.
  const depths = Object.values(depth);
  if (depths.length === 0) return {};
  const avg = depths.reduce((a,b) => a+b, 0) / depths.length;
  const out = {};
  for (const [id, d] of Object.entries(depth)) {
    out[id] = (d - avg) * 200;
  }
  return out;
}
