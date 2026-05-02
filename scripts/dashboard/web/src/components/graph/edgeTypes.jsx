import React from 'react';
import { BezierEdge } from '@xyflow/react';

/**
 * edgeTypes 셸 — blocks / parent / epic 3종.
 * 이번 task에서는 라벨 텍스트만 다르고 렌더는 BezierEdge 위임.
 * 시각 차별화(색/마커)는 MAE-264에서 처리.
 */

export function BlocksEdge(props) {
  return <BezierEdge {...props} label="blocks" />;
}

export function ParentEdge(props) {
  return <BezierEdge {...props} label="parent" />;
}

export function EpicEdge(props) {
  return <BezierEdge {...props} label="epic" />;
}

/** React Flow에 등록할 edgeTypes 객체 */
export const edgeTypes = {
  blocks: BlocksEdge,
  parent: ParentEdge,
  epic: EpicEdge,
};
