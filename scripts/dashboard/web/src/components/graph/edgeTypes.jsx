import React from 'react';
import { BezierEdge } from '@xyflow/react';

/** 관계 타입별 시각 스타일 (MAE-264) */
const RELATION_STYLES = {
  blocks: {
    stroke: '#dc2626',      // red-600
    strokeWidth: 2,
    labelBg: '#fef2f2',     // red-50
    labelColor: '#991b1b',  // red-800
  },
  parent: {
    stroke: '#64748b',      // slate-500
    strokeWidth: 1.5,
    labelBg: '#f1f5f9',     // slate-100
    labelColor: '#334155',  // slate-700
  },
  epic: {
    stroke: '#9333ea',      // purple-600
    strokeWidth: 1.5,
    labelBg: '#faf5ff',     // purple-50
    labelColor: '#6b21a8',  // purple-800
  },
};

export function BlocksEdge(props) {
  const isCycle = Boolean(props?.data?.cycle);
  const base = RELATION_STYLES.blocks;
  // 사이클 멤버 엣지: 짙은 빨강 + 점선 + 굵게 + 'blocks ⟲' 라벨 (MAE-267).
  const stroke = isCycle ? '#7f1d1d' : base.stroke;
  const strokeWidth = isCycle ? 2.5 : base.strokeWidth;
  const labelBg = isCycle ? '#fee2e2' : base.labelBg;
  const labelColor = isCycle ? '#7f1d1d' : base.labelColor;
  const label = isCycle ? 'blocks ⟲' : 'blocks';
  // dash 패턴 '8 4' — marching-ants 흐름(.react-flow__edge-path 애니메이션)과 시각적으로 분리되도록 길게.
  const style = isCycle
    ? { stroke, strokeWidth, strokeDasharray: '8 4' }
    : { stroke, strokeWidth };
  return (
    <BezierEdge
      {...props}
      label={label}
      style={style}
      labelBgStyle={{ fill: labelBg }}
      labelStyle={{ fill: labelColor, fontSize: 11, fontWeight: isCycle ? 600 : 400 }}
      labelBgPadding={[6, 3]}
      labelBgBorderRadius={4}
    />
  );
}

export function ParentEdge(props) {
  const { stroke, strokeWidth, labelBg, labelColor } = RELATION_STYLES.parent;
  return (
    <BezierEdge
      {...props}
      label="parent"
      style={{ stroke, strokeWidth }}
      labelBgStyle={{ fill: labelBg }}
      labelStyle={{ fill: labelColor, fontSize: 11 }}
      labelBgPadding={[6, 3]}
      labelBgBorderRadius={4}
    />
  );
}

export function EpicEdge(props) {
  const { stroke, strokeWidth, labelBg, labelColor } = RELATION_STYLES.epic;
  return (
    <BezierEdge
      {...props}
      label="epic"
      style={{ stroke, strokeWidth }}
      labelBgStyle={{ fill: labelBg }}
      labelStyle={{ fill: labelColor, fontSize: 11 }}
      labelBgPadding={[6, 3]}
      labelBgBorderRadius={4}
    />
  );
}

/** React Flow에 등록할 edgeTypes 객체 */
export const edgeTypes = {
  blocks: BlocksEdge,
  parent: ParentEdge,
  epic: EpicEdge,
};
