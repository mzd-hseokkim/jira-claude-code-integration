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
  return (
    <div className={className}>
      <Handle type="target" position={Position.Top} />
      <div className="graph-node__label" title={data?.label}>
        {data?.label ?? data?.id ?? '?'}
      </div>
      {data?.status && !isPhantom && (
        <div className="graph-node__status">{data.status}</div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
