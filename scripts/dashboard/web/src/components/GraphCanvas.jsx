import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { selectGraphData } from '../selectors/graph.js';
import { mapToFlow } from './graph/mapToFlow.js';
import { useForceLayout } from './graph/useForceLayout.js';
import { edgeTypes } from './graph/edgeTypes.jsx';
import GraphNode from './graph/GraphNode.jsx';
import GraphSidePanel from './graph/GraphSidePanel.jsx';
import GraphFilterBar from './graph/GraphFilterBar.jsx';
import {
  buildFilterOptions,
  computeMatchedKeys,
  isFilterActive,
} from './graph/filter.js';
import { findIsolatedNodes, findCycleEdges } from './graph/analysis.js';

const nodeTypes = { graphNode: GraphNode };

/**
 * id 기반 노드 merge: 기존 노드의 position을 보존하고 data만 교체한다.
 *
 * - 기존 id: position 유지, data는 next의 값으로 교체 (dimmed/isolated 등 즉시 반영)
 * - 신규 id: next 노드 그대로 추가 (mapToFlow 초기 좌표, simulation이 정착)
 * - 사라진 id: 결과에서 제거
 *
 * @param {import('@xyflow/react').Node[]} prev
 * @param {import('@xyflow/react').Node[]} next
 * @returns {import('@xyflow/react').Node[]}
 */
export function mergeNodesById(prev, next) {
  const prevMap = new Map(prev.map(n => [n.id, n]));
  return next.map(nextNode => {
    const prevNode = prevMap.get(nextNode.id);
    if (!prevNode) return nextNode; // 신규 id → mapToFlow 초기 좌표 사용
    // 기존 id → position 유지, data는 신규 값으로 교체
    return { ...nextNode, position: prevNode.position };
  });
}

/**
 * React Flow 기반 그래프 캔버스.
 * worktrees: Record<path, WorktreeState> 객체를 받아 노드/엣지를 자동 배치한다.
 *
 * @param {{ worktrees: Record<string, object> }} props
 */
export default function GraphCanvas({ worktrees }) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner worktrees={worktrees} />
    </ReactFlowProvider>
  );
}

function GraphCanvasInner({ worktrees }) {
  // selectGraphData는 순수 함수이므로 useMemo로 메모이제이션.
  const graphData = useMemo(
    () => selectGraphData(worktrees),
    [worktrees]
  );

  const filterOptions = useMemo(
    () => buildFilterOptions(worktrees),
    [worktrees]
  );

  const [statusSet, setStatusSet] = useState(() => new Set());
  const [assigneeSet, setAssigneeSet] = useState(() => new Set());

  const matchedKeys = useMemo(
    () => computeMatchedKeys(worktrees, statusSet, assigneeSet),
    [worktrees, statusSet, assigneeSet]
  );
  const filterActive = isFilterActive(statusSet, assigneeSet);

  const isolatedSet = useMemo(
    () => findIsolatedNodes(graphData.nodes, graphData.edges),
    [graphData]
  );
  const cycleEdgeSet = useMemo(
    () => findCycleEdges(graphData.nodes, graphData.edges.filter(e => e.type === 'blocks')),
    [graphData]
  );

  const { flowNodes: initialNodes, flowEdges: initialEdges } = useMemo(
    () => mapToFlow(graphData, { matchedKeys, isolatedSet, cycleEdgeSet }),
    [graphData, matchedKeys, isolatedSet, cycleEdgeSet]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // initialNodes/initialEdges가 바뀌면 React Flow 상태도 갱신.
  // (useNodesState/useEdgesState는 초기값만 사용하므로 명시적 갱신 필요)
  //
  // setNodes는 id 기반 merge 정책으로 기존 노드의 position을 보존한다:
  //   - 기존 id → position 유지, data는 신규 값으로 교체 (dimmed/isolated 등 즉시 반영)
  //   - 신규 id → mapToFlow 초기 좌표 그대로 추가 (simulation이 이후 정착)
  //   - 사라진 id → 제거
  // setEdges는 좌표가 없으므로 단순 교체 유지.
  const newNodesKey = initialNodes.map(n => `${n.id}:${n.data?.dimmed ? 'd' : 'n'}:${n.data?.isolated ? 'i' : '_'}`).join(',');
  const newEdgesKey = initialEdges.map(e => `${e.id}:${e.data?.dimmed ? 'd' : 'n'}:${e.data?.cycle ? 'c' : '_'}`).join(',');
  useEffect(() => {
    setNodes(prev => mergeNodesById(prev, initialNodes));
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newNodesKey, newEdgesKey]);

  // 사용자가 드래그한 노드를 그 자리에 고정 (pin).
  const pinnedRef = useRef({});

  // force-directed 레이아웃 적용. drag 결과를 simulation에 반영하기 위해 pinNode/unpinNode 받음.
  const { pinNode } = useForceLayout(nodes, edges, setNodes, { pinnedRef });

  const onNodeDragStop = useCallback((_event, node) => {
    // 드래그 끝난 위치를 pin. simulation은 이 자리에 고정.
    pinnedRef.current[node.id] = { x: node.position.x, y: node.position.y };
    pinNode(node.id, node.position.x, node.position.y);
  }, [pinNode]);

  // ReactFlow 인스턴스 (fitView 수동 호출용).
  const rf = useReactFlow();
  // 노드가 처음 들어왔을 때 + simulation이 어느 정도 안정화된 시점에 fitView.
  useEffect(() => {
    if (initialNodes.length === 0) return;
    const t1 = setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 800);
    const t2 = setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [newNodesKey, rf]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선택된 노드 key (이슈 key).
  const [selectedKey, setSelectedKey] = useState(null);

  const onNodeClick = useCallback((_event, node) => {
    setSelectedKey(node.id);
  }, []);

  // 캔버스 빈 공간 클릭 시 패널 닫기.
  const onPaneClick = useCallback(() => setSelectedKey(null), []);

  // ESC 키로도 패널 닫기.
  useEffect(() => {
    if (selectedKey === null) return;
    const handler = (e) => {
      if (e.key === 'Escape') setSelectedKey(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedKey]);

  // selectedKey에 해당하는 worktree 찾기.
  // phantom 노드: worktrees에 path가 없으므로 null이 됨.
  const selectedWorktree = useMemo(() => {
    if (!selectedKey) return undefined;
    if (!worktrees || typeof worktrees !== 'object') return null;
    // path 기준으로 순회하며 cachedIssue.key === selectedKey인 worktree 반환.
    for (const wt of Object.values(worktrees)) {
      if (wt?.cachedIssue?.key === selectedKey) return wt;
    }
    // 해당 키를 가진 worktree가 없으면 phantom → null
    return null;
  }, [selectedKey, worktrees]);

  const toggleInSet = useCallback((setter) => (value) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const onToggleStatus = useMemo(() => toggleInSet(setStatusSet), [toggleInSet]);
  const onToggleAssignee = useMemo(() => toggleInSet(setAssigneeSet), [toggleInSet]);
  const onClearStatus = useCallback(() => setStatusSet(new Set()), []);
  const onClearAssignee = useCallback(() => setAssigneeSet(new Set()), []);

  const matchedCount = filterActive ? matchedKeys.size : graphData.nodes.length;

  return (
    <main className="graph-canvas" data-testid="graph-canvas" aria-label="그래프 뷰">
      <GraphFilterBar
        options={filterOptions}
        statusSet={statusSet}
        assigneeSet={assigneeSet}
        onToggleStatus={onToggleStatus}
        onToggleAssignee={onToggleAssignee}
        onClearStatus={onClearStatus}
        onClearAssignee={onClearAssignee}
        matchedCount={matchedCount}
        totalCount={graphData.nodes.length}
      />
      <div className="graph-canvas__flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          minZoom={0.2}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {selectedKey !== null && (
        <GraphSidePanel
          worktree={selectedWorktree}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </main>
  );
}
