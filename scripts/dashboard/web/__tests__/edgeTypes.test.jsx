/**
 * edgeTypes 단위 테스트 (MAE-264)
 *
 * BezierEdge를 mock하여 각 edge 컴포넌트가 기대 props를 전달하는지 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MarkerType } from '@xyflow/react';

// BezierEdge mock: 전달받은 props를 캡처
let capturedProps = {};
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    BezierEdge: (props) => {
      capturedProps = props;
      return null;
    },
  };
});

const { BlocksEdge, ParentEdge, EpicEdge } = await import(
  '../src/components/graph/edgeTypes.jsx'
);

/** BezierEdge로 전달되는 props를 렌더 후 반환 */
function renderEdge(Component, extraProps = {}) {
  capturedProps = {};
  render(
    <Component
      id="e1"
      source="n1"
      target="n2"
      sourceX={0}
      sourceY={0}
      targetX={100}
      targetY={100}
      {...extraProps}
    />
  );
  return capturedProps;
}

describe('BlocksEdge (MAE-264)', () => {
  it('stroke 색이 #dc2626 (red-600)이다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.style?.stroke).toBe('#dc2626');
  });

  it('markerEnd.color가 #dc2626이다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.markerEnd?.color).toBe('#dc2626');
  });

  it('markerEnd.type이 MarkerType.ArrowClosed이다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.markerEnd?.type).toBe(MarkerType.ArrowClosed);
  });

  it('label prop이 "blocks"이다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.label).toBe('blocks');
  });

  it('labelBgStyle.fill이 설정된다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.labelBgStyle?.fill).toBeTruthy();
  });
});

describe('ParentEdge (MAE-264)', () => {
  it('stroke 색이 #64748b (slate-500)이다', () => {
    const props = renderEdge(ParentEdge);
    expect(props.style?.stroke).toBe('#64748b');
  });

  it('markerEnd.color가 #64748b이다', () => {
    const props = renderEdge(ParentEdge);
    expect(props.markerEnd?.color).toBe('#64748b');
  });

  it('markerEnd.type이 MarkerType.ArrowClosed이다', () => {
    const props = renderEdge(ParentEdge);
    expect(props.markerEnd?.type).toBe(MarkerType.ArrowClosed);
  });

  it('label prop이 "parent"이다', () => {
    const props = renderEdge(ParentEdge);
    expect(props.label).toBe('parent');
  });
});

describe('EpicEdge (MAE-264)', () => {
  it('stroke 색이 #9333ea (purple-600)이다', () => {
    const props = renderEdge(EpicEdge);
    expect(props.style?.stroke).toBe('#9333ea');
  });

  it('markerEnd.color가 #9333ea이다', () => {
    const props = renderEdge(EpicEdge);
    expect(props.markerEnd?.color).toBe('#9333ea');
  });

  it('markerEnd.type이 MarkerType.ArrowClosed이다', () => {
    const props = renderEdge(EpicEdge);
    expect(props.markerEnd?.type).toBe(MarkerType.ArrowClosed);
  });

  it('label prop이 "epic"이다', () => {
    const props = renderEdge(EpicEdge);
    expect(props.label).toBe('epic');
  });
});

describe('공통 (MAE-264)', () => {
  it('BlocksEdge: 외부에서 전달된 label prop이 있으면 덮어쓴다', () => {
    // label이 하드코딩되어 있으므로 항상 "blocks" — 외부 label은 덮어씌워짐
    const props = renderEdge(BlocksEdge, { label: 'custom' });
    expect(props.label).toBe('blocks');
  });

  it('BlocksEdge: labelStyle.fontSize가 11이다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.labelStyle?.fontSize).toBe(11);
  });

  it('BlocksEdge: labelBgPadding이 [6,3]이다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.labelBgPadding).toEqual([6, 3]);
  });

  it('BlocksEdge: labelBgBorderRadius가 4이다', () => {
    const props = renderEdge(BlocksEdge);
    expect(props.labelBgBorderRadius).toBe(4);
  });
});
