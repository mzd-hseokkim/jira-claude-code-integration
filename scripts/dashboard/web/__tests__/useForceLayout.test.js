/**
 * useForceLayout 단위 테스트 (MAE-262)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

beforeEach(() => {
  if (typeof global.requestAnimationFrame === 'undefined') {
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
  }
});

/** 테스트용 간단한 노드/엣지 생성 */
function makeNodes(ids) {
  return ids.map((id, i) => ({
    id,
    position: { x: i * 10, y: 0 },
    data: { label: id },
  }));
}

function makeEdges(pairs) {
  return pairs.map(([source, target]) => ({
    id: `${source}->${target}`,
    source,
    target,
    type: 'blocks',
  }));
}

describe('useForceLayout', () => {
  it('U2: unmount 후에는 setNodes가 더 이상 호출되지 않는다', async () => {
    const { useForceLayout } = await import('../src/components/graph/useForceLayout.js');
    const nodes = makeNodes(['A', 'B', 'C']);
    const edges = makeEdges([['A', 'B']]);
    const setNodes = vi.fn();

    const { unmount } = renderHook(() =>
      useForceLayout(nodes, edges, setNodes)
    );

    // simulation이 시작될 시간을 줌
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    unmount();

    // unmount 후 setNodes 호출 횟수 기록
    const callCountAfterUnmount = setNodes.mock.calls.length;

    // unmount 후 추가 time 경과
    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    // unmount 이후에는 새로운 호출이 없어야 함 (simulation.stop + RAF cancel)
    expect(setNodes.mock.calls.length).toBe(callCountAfterUnmount);
  });

  it('U4: mapToFlow — edge type 보존 + 노드/엣지 1:1 매핑', async () => {
    const { mapToFlow } = await import('../src/components/graph/mapToFlow.js');
    const graphData = {
      nodes: [
        { id: 'MAE-1', label: 'MAE-1 task', data: { status: '진행 중' } },
        { id: 'MAE-2', label: 'MAE-2 task', data: { phantom: true } },
      ],
      edges: [
        { id: 'blocks:MAE-1->MAE-2', source: 'MAE-1', target: 'MAE-2', type: 'blocks' },
      ],
    };

    const { flowNodes, flowEdges } = mapToFlow(graphData);

    expect(flowNodes).toHaveLength(2);
    expect(flowEdges).toHaveLength(1);
    expect(flowNodes[0].id).toBe('MAE-1');
    expect(flowNodes[1].id).toBe('MAE-2');
    expect(flowEdges[0].type).toBe('blocks');
    expect(flowEdges[0].source).toBe('MAE-1');
    expect(flowEdges[0].target).toBe('MAE-2');
  });

  it('U4b: mapToFlow — 노드 position이 초기화됨', async () => {
    const { mapToFlow } = await import('../src/components/graph/mapToFlow.js');
    const { flowNodes } = mapToFlow({
      nodes: [{ id: 'X', label: 'X', data: {} }],
      edges: [],
    });
    expect(flowNodes[0].position).toBeDefined();
    expect(typeof flowNodes[0].position.x).toBe('number');
    expect(typeof flowNodes[0].position.y).toBe('number');
  });

  it('빈 nodes 입력 시 setNodes가 호출되지 않는다', async () => {
    const { useForceLayout } = await import('../src/components/graph/useForceLayout.js');
    const setNodes = vi.fn();

    renderHook(() => useForceLayout([], [], setNodes));

    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });

    expect(setNodes).not.toHaveBeenCalled();
  });
});
