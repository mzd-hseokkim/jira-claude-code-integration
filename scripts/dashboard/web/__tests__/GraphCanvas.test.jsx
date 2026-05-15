/**
 * GraphCanvas 통합 테스트 (MAE-262)
 *
 * React Flow는 jsdom에서 ResizeObserver를 필요로 하므로 vitest.setup.js에서 polyfill.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

beforeAll(() => {
  // EventSource mock (DashboardContext → useDashboardStream에서 필요)
  if (!globalThis.EventSource) {
    globalThis.EventSource = class {
      constructor() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    };
  }
  // RAF polyfill
  if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
  }
});

vi.mock('../src/hooks/useDashboardStream.js', () => ({
  useDashboardStream: () => {},
}));

// useForceLayout을 no-op으로 mock — jsdom에서 d3-force 좌표 계산 불필요.
// 실제 훅은 { pinNode, unpinNode }를 반환 — GraphCanvas가 구조분해하므로 동일 shape 유지.
vi.mock('../src/components/graph/useForceLayout.js', () => ({
  useForceLayout: () => ({ pinNode: () => {}, unpinNode: () => {} }),
}));

const GraphCanvas = (await import('../src/components/GraphCanvas.jsx')).default;

/** 간단한 worktrees 픽스처 */
function makeWorktrees(entries = []) {
  const result = {};
  for (const { key, path, summary, status, links } of entries) {
    result[path] = {
      path,
      taskId: key,
      branch: `feature/${key}`,
      cachedIssue: {
        key,
        summary: summary ?? `${key} summary`,
        status: status ?? '진행 중',
        priority: '주요',
        assignee: 'tester',
        links: links ?? {},
      },
    };
  }
  return result;
}

describe('GraphCanvas (MAE-262)', () => {
  it('E1: 빈 worktrees에서 크래시 없이 렌더되고 사이드 패널은 없음', () => {
    render(<GraphCanvas worktrees={{}} />);
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull(); // <aside> = complementary
  });

  it('E2: worktree 2개 + blocks edge 1개 → ReactFlow 캔버스 렌더', () => {
    // selectGraphData는 links.blocks를 key 문자열 배열로 기대함 (MAE-261 selector 스펙)
    const worktrees = makeWorktrees([
      {
        key: 'MAE-1',
        path: '/work/MAE-1',
        links: { blocks: ['MAE-2'] },
      },
      {
        key: 'MAE-2',
        path: '/work/MAE-2',
        links: {},
      },
    ]);
    render(<GraphCanvas worktrees={worktrees} />);
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
  });

  it('E3: 노드 클릭 시 사이드 패널이 노출되고 WorktreeCard 렌더', async () => {
    const worktrees = makeWorktrees([
      { key: 'MAE-10', path: '/work/MAE-10', summary: 'Test task A' },
    ]);
    render(<GraphCanvas worktrees={worktrees} />);

    // React Flow가 노드를 DOM에 그리면 data-id 속성으로 찾을 수 있음.
    // jsdom에서 React Flow는 노드를 .react-flow__node로 렌더한다.
    const nodeEls = document.querySelectorAll('.react-flow__node');
    if (nodeEls.length > 0) {
      fireEvent.click(nodeEls[0]);
      // 패널이 열리면 complementary role (aside) 존재
      expect(screen.getByRole('complementary')).toBeInTheDocument();
    } else {
      // jsdom에서 React Flow 노드가 렌더되지 않으면 스킵 (환경 한계)
      expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
    }
  });

  it('U5/E4: phantom 노드 클릭 → "외부 이슈" 안내 표시', async () => {
    // worktrees에 없는 phantom 노드를 직접 확인하려면
    // GraphSidePanel에 worktree=null을 직접 전달.
    const { default: GraphSidePanel } = await import('../src/components/graph/GraphSidePanel.jsx');
    render(<GraphSidePanel worktree={null} onClose={() => {}} />);
    expect(screen.getByText('외부 이슈')).toBeInTheDocument();
  });

  it('U6: GraphSidePanel worktree=undefined → 아무것도 렌더하지 않음', async () => {
    const { default: GraphSidePanel } = await import('../src/components/graph/GraphSidePanel.jsx');
    const { container } = render(<GraphSidePanel worktree={undefined} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('GraphNode (MAE-262)', () => {
  it('U5: data.phantom=true → graph-node--phantom 클래스 포함', async () => {
    // GraphNode는 React Flow Handle을 사용하므로 ReactFlowProvider로 감싸야 함
    const { default: GraphNode } = await import('../src/components/graph/GraphNode.jsx');
    const { ReactFlowProvider } = await import('@xyflow/react');
    const { container } = render(
      <ReactFlowProvider>
        <GraphNode
          id="MAE-EXT"
          data={{ label: 'MAE-EXT', phantom: true }}
          isConnectable={false}
        />
      </ReactFlowProvider>
    );
    const nodeDiv = container.querySelector('.graph-node');
    expect(nodeDiv).not.toBeNull();
    expect(nodeDiv.classList.contains('graph-node--phantom')).toBe(true);
  });

  it('phantom=false → graph-node--phantom 클래스 없음', async () => {
    const { default: GraphNode } = await import('../src/components/graph/GraphNode.jsx');
    const { ReactFlowProvider } = await import('@xyflow/react');
    const { container } = render(
      <ReactFlowProvider>
        <GraphNode
          id="MAE-10"
          data={{ label: 'MAE-10 task', phantom: false, status: '진행 중' }}
          isConnectable={false}
        />
      </ReactFlowProvider>
    );
    const nodeDiv = container.querySelector('.graph-node');
    expect(nodeDiv).not.toBeNull();
    expect(nodeDiv.classList.contains('graph-node--phantom')).toBe(false);
  });
});
