import React from 'react';
import { Handle, Position } from '@xyflow/react';

/**
 * 기본 그래프 노드.
 * data.phantom === true 이면 .graph-node--phantom 클래스를 적용하여 시각 구분.
 */
export default function GraphNode({ data }) {
  const isPhantom = Boolean(data?.phantom);
  const isDimmed = Boolean(data?.dimmed);
  const isIsolated = Boolean(data?.isolated);
  const className = [
    'graph-node',
    isPhantom ? 'graph-node--phantom' : '',
    isDimmed ? 'graph-node--dimmed' : '',
    isIsolated ? 'graph-node--isolated' : '',
  ].filter(Boolean).join(' ');
  // issue key만 추출 (예: "MAE-263 [graph-view][4.1] marching ants..." → "MAE-263")
  const fullLabel = data?.label ?? data?.id ?? '?';
  const compactKey = (data?.id) ?? String(fullLabel).split(/\s+/)[0];
  return (
    <div className={className} title={fullLabel}>
      {/* 위쪽 핸들: parent/epic 엣지가 사용 (자식 → 부모 방향, 위로 나감/위로 들어옴) */}
      <Handle id="t-top" type="target" position={Position.Top} />
      <Handle id="s-top" type="source" position={Position.Top} />
      <div className="graph-node__label">
        {compactKey}
      </div>
      {data?.status && !isPhantom && (
        <div className="graph-node__status">{data.status}</div>
      )}
      {/* 아래쪽 핸들: blocks 엣지가 사용 (blocker → blocked 방향, 아래로 나감/아래로 들어옴) */}
      <Handle id="s-bottom" type="source" position={Position.Bottom} />
      <Handle id="t-bottom" type="target" position={Position.Bottom} />
    </div>
  );
}
