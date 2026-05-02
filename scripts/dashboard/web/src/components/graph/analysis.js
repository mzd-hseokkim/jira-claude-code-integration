/**
 * 그래프 분석 유틸 (MAE-267).
 *
 * - findIsolatedNodes: 어떤 엣지에도 등장하지 않는 노드 id 집합.
 * - findCycleEdges: blocks 엣지 중 사이클(SCC 내부)에 속한 엣지 id 집합.
 *   호출자가 type === 'blocks' 엣지만 사전 필터해서 넘겨야 한다 (parent/epic은 계층 관계로 cycle 판정 제외).
 */

/**
 * @param {Array<{id:string}>} nodes
 * @param {Array<{source:string, target:string}>} edges
 * @returns {Set<string>}
 */
export function findIsolatedNodes(nodes, edges) {
  const connected = new Set();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const isolated = new Set();
  for (const n of nodes) {
    if (!connected.has(n.id)) isolated.add(n.id);
  }
  return isolated;
}

/**
 * blocks 엣지 그래프에서 사이클에 속한 엣지 id를 모두 찾는다.
 *
 * Tarjan SCC 기반: 크기 ≥ 2인 SCC 또는 self-loop를 가진 SCC를 찾고,
 * 그 SCC 내부에서 출발/도착이 모두 같은 SCC인 엣지(트리/포워드/백/크로스 모두)를 cycle로 마킹.
 * 이 방식은 chord/forward 엣지도 정확히 포함한다 (DFS gray-back-edge 방식의 한계 해결).
 *
 * 자기 참조 엣지(source === target)는 selectors가 거르지만 방어적으로 무시.
 *
 * @param {Array<{id:string}>} nodes
 * @param {Array<{id:string, source:string, target:string}>} blocksEdges
 * @returns {Set<string>}
 */
export function findCycleEdges(nodes, blocksEdges) {
  // 인접 리스트
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  const safeEdges = [];
  for (const e of blocksEdges) {
    if (e.source === e.target) continue;
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e.target);
    safeEdges.push(e);
  }

  // Tarjan iterative SCC
  // index/lowlink는 노드별. onStack으로 현재 SCC 후보에 있는지 추적.
  const indexOf = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const sccStack = [];
  const sccId = new Map(); // node -> scc id
  let nextIndex = 0;
  let nextSccId = 0;

  for (const start of adj.keys()) {
    if (indexOf.has(start)) continue;

    // iterative DFS frame: { node, neighbors, idx }
    const work = [{ node: start, neighbors: adj.get(start), idx: 0 }];
    indexOf.set(start, nextIndex);
    lowlink.set(start, nextIndex);
    nextIndex++;
    sccStack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame.idx < frame.neighbors.length) {
        const w = frame.neighbors[frame.idx++];
        if (!indexOf.has(w)) {
          indexOf.set(w, nextIndex);
          lowlink.set(w, nextIndex);
          nextIndex++;
          sccStack.push(w);
          onStack.add(w);
          work.push({ node: w, neighbors: adj.get(w), idx: 0 });
        } else if (onStack.has(w)) {
          // back-edge or cross to current SCC candidate
          lowlink.set(frame.node, Math.min(lowlink.get(frame.node), indexOf.get(w)));
        }
        // else: 이미 다른 SCC로 정착 → 무시
      } else {
        // 모든 이웃 처리 완료 → root 검사
        if (lowlink.get(frame.node) === indexOf.get(frame.node)) {
          // SCC 추출
          const id = nextSccId++;
          while (true) {
            const w = sccStack.pop();
            onStack.delete(w);
            sccId.set(w, id);
            if (w === frame.node) break;
          }
        }
        work.pop();
        // 부모 lowlink 갱신 (재귀의 후처리)
        if (work.length > 0) {
          const parent = work[work.length - 1];
          parent && lowlink.set(
            parent.node,
            Math.min(lowlink.get(parent.node), lowlink.get(frame.node))
          );
        }
      }
    }
  }

  // SCC 멤버 수 집계 (크기 ≥ 2면 cycle)
  const sccSize = new Map();
  for (const id of sccId.values()) {
    sccSize.set(id, (sccSize.get(id) ?? 0) + 1);
  }

  // 같은 SCC 내부 엣지(크기 ≥ 2)는 cycle 멤버
  const cycle = new Set();
  for (const e of safeEdges) {
    const sId = sccId.get(e.source);
    const tId = sccId.get(e.target);
    if (sId !== undefined && sId === tId && (sccSize.get(sId) ?? 0) >= 2) {
      cycle.add(e.id);
    }
  }

  return cycle;
}
