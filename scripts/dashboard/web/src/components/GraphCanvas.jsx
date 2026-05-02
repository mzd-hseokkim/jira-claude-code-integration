import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { selectGraphData } from '../selectors/graph.js';
import { mapToFlow } from './graph/mapToFlow.js';
import { useForceLayout } from './graph/useForceLayout.js';
import { edgeTypes } from './graph/edgeTypes.jsx';
import GraphNode from './graph/GraphNode.jsx';
import GraphSidePanel from './graph/GraphSidePanel.jsx';

const nodeTypes = { graphNode: GraphNode };

/**
 * React Flow 기반 그래프 캔버스.
 * worktrees: Record<path, WorktreeState> 객체를 받아 노드/엣지를 자동 배치한다.
 *
 * @param {{ worktrees: Record<string, object> }} props
 */
export default function GraphCanvas({ worktrees }) {
  // selectGraphData는 순수 함수이므로 useMemo로 메모이제이션.
  const graphData = useMemo(
    () => selectGraphData(worktrees),
    [worktrees]
  );

  const { flowNodes: initialNodes, flowEdges: initialEdges } = useMemo(
    () => mapToFlow(graphData),
    [graphData]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // initialNodes/initialEdges가 바뀌면 React Flow 상태도 reset.
  // (useNodesState/useEdgesState는 초기값만 사용하므로 명시적 reset 필요)
  const newNodesKey = initialNodes.map(n => n.id).join(',');
  const newEdgesKey = initialEdges.map(e => e.id).join(',');
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newNodesKey, newEdgesKey]);

  // force-directed 레이아웃 적용.
  useForceLayout(nodes, edges, setNodes);

  // 선택된 노드 key (이슈 key).
  const [selectedKey, setSelectedKey] = useState(null);

  const onNodeClick = useCallback((_event, node) => {
    setSelectedKey(node.id);
  }, []);

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

  return (
    <main className="graph-canvas" data-testid="graph-canvas" aria-label="그래프 뷰">
      <div className="graph-canvas__flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
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
