/**
 * GraphCanvas 통합 테스트 (MAE-267) — isolated 노드 / cycle 엣지 시각 처리.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

beforeAll(() => {
  if (!globalThis.EventSource) {
    globalThis.EventSource = class {
      constructor() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
    };
  }
  if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
  }
});

vi.mock('../src/hooks/useDashboardStream.js', () => ({
  useDashboardStream: () => {},
}));
vi.mock('../src/components/graph/useForceLayout.js', () => ({
  useForceLayout: () => {},
}));

// ReactFlow를 spy 가능한 stub으로 대체: nodes/edges prop을 노출시켜 검증.
const reactFlowSpy = vi.fn();
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlow: (props) => {
      reactFlowSpy(props);
      return null; // 실제 SVG 렌더링은 jsdom에서 의미 없음
    },
    Background: () => null,
    Controls: () => null,
  };
});

const GraphCanvas = (await import('../src/components/GraphCanvas.jsx')).default;

function getLatestProps() {
  expect(reactFlowSpy).toHaveBeenCalled();
  return reactFlowSpy.mock.calls[reactFlowSpy.mock.calls.length - 1][0];
}

/**
 * worktrees 픽스처. links.blocks / parent.key를 옵션으로 지정.
 */
function makeWorktrees(entries = []) {
  const result = {};
  for (const { key, path, links, parent } of entries) {
    result[path] = {
      path,
      taskId: key,
      cachedIssue: {
        key,
        summary: `${key} summary`,
        status: '진행 중',
        priority: '주요',
        assignee: 'tester',
        links: links ?? {},
        parent: parent ?? null,
      },
    };
  }
  return result;
}

describe('GraphCanvas — isolated/cycle (MAE-267)', () => {
  it('E2: isolated 노드만 data.isolated=true가 ReactFlow에 전달된다', () => {
    // A↔B는 서로 blocks, C는 어떤 링크에도 등장하지 않음 → C만 isolated
    const worktrees = makeWorktrees([
      { key: 'P-A', path: '/wt/a', links: { blocks: ['P-B'] } },
      { key: 'P-B', path: '/wt/b', links: { blocks: ['P-A'] } },
      { key: 'P-C', path: '/wt/c' },
    ]);
    render(<GraphCanvas worktrees={worktrees} />);
    const { nodes } = getLatestProps();
    const byId = Object.fromEntries(nodes.map(n => [n.id, n.data.isolated]));
    expect(byId).toEqual({ 'P-A': false, 'P-B': false, 'P-C': true });
  });

  it('E1: blocks 사이클 엣지에 data.cycle=true가 전달된다', () => {
    const worktrees = makeWorktrees([
      { key: 'P-A', path: '/wt/a', links: { blocks: ['P-B'] } },
      { key: 'P-B', path: '/wt/b', links: { blocks: ['P-A'] } },
    ]);
    render(<GraphCanvas worktrees={worktrees} />);
    const { edges } = getLatestProps();
    const blocksEdges = edges.filter(e => e.type === 'blocks');
    expect(blocksEdges.length).toBeGreaterThan(0);
    expect(blocksEdges.every(e => e.data.cycle === true)).toBe(true);
  });

  it('AC-5: parent 엣지는 cycle 판정에서 제외된다 (blocks만 검사)', () => {
    // P-A가 P-B의 부모, P-B의 blocks가 P-A를 가리킴.
    // parent까지 cycle 검사했다면 (P-B → P-A blocks) + (P-B → P-A parent)로 보일 수 있으나
    // 같은 방향이라 단일 SCC가 안 만들어짐. 더 명확한 케이스: blocks 단일 엣지 + parent 단일 엣지 → SCC 없음
    const worktrees = makeWorktrees([
      { key: 'P-A', path: '/wt/a' },
      { key: 'P-B', path: '/wt/b', parent: { key: 'P-A' }, links: { blocks: ['P-A'] } },
    ]);
    render(<GraphCanvas worktrees={worktrees} />);
    const { edges } = getLatestProps();
    // 어떤 엣지도 cycle=true가 아니어야 함 (단일 방향 blocks 1개로는 사이클 불가)
    expect(edges.every(e => e.data.cycle === false)).toBe(true);
  });
});
