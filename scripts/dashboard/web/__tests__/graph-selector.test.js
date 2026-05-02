import { describe, it, expect } from 'vitest';
import {
  buildNodes,
  buildBlocksEdges,
  buildHierarchyEdges,
  addPhantomNodes,
  selectGraphData,
} from '../src/selectors/graph.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorktree(key, overrides = {}) {
  return {
    cachedIssue: {
      key,
      summary: `Summary of ${key}`,
      status: 'In Progress',
      assignee: 'dev',
      issuetype: 'Story',
      links: { blocks: [], blockedBy: [] },
      parent: null,
      epic: null,
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// buildNodes
// ---------------------------------------------------------------------------

describe('buildNodes', () => {
  // U1: N worktrees → N nodes
  it('U1: worktree N개 → node N개', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1'),
      '/b': makeWorktree('MAE-2'),
      '/c': makeWorktree('MAE-3'),
    };
    const nodes = buildNodes(worktrees);
    expect(nodes).toHaveLength(3);
    expect(nodes.map(n => n.id).sort()).toEqual(['MAE-1', 'MAE-2', 'MAE-3']);
  });

  // U2: worktree without cachedIssue is skipped
  it('U2: cachedIssue 없는 worktree skip', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1'),
      '/b': { cachedIssue: null },
    };
    const nodes = buildNodes(worktrees);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('MAE-1');
  });

  it('node label은 key + summary 포함', () => {
    const worktrees = { '/a': makeWorktree('MAE-1') };
    const [node] = buildNodes(worktrees);
    expect(node.label).toContain('MAE-1');
    expect(node.label).toContain('Summary of MAE-1');
  });

  it('node data에 path 포함', () => {
    const worktrees = { '/repo/worktree': makeWorktree('MAE-1') };
    const [node] = buildNodes(worktrees);
    expect(node.data.path).toBe('/repo/worktree');
  });
});

// ---------------------------------------------------------------------------
// buildBlocksEdges
// ---------------------------------------------------------------------------

describe('buildBlocksEdges', () => {
  // U3: A.blocks=[B], both in worktrees → 1 edge
  it('U3: A.blocks=[B] → blocks edge 1개', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1', { links: { blocks: ['MAE-2'], blockedBy: [] } }),
      '/b': makeWorktree('MAE-2'),
    };
    const edges = buildBlocksEdges(worktrees);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'MAE-1', target: 'MAE-2', type: 'blocks' });
  });

  // U4: blockedBy is ignored → dedup is automatic
  it('U4: B.blockedBy=[A] 무시 → blocks edge 1개 (A.blocks=[B]에서만 추출)', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1', { links: { blocks: ['MAE-2'], blockedBy: [] } }),
      '/b': makeWorktree('MAE-2', { links: { blocks: [], blockedBy: ['MAE-1'] } }),
    };
    const edges = buildBlocksEdges(worktrees);
    expect(edges).toHaveLength(1);
  });

  it('self-loop guard: A.blocks=[A] → edge 없음', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1', { links: { blocks: ['MAE-1'], blockedBy: [] } }),
    };
    expect(buildBlocksEdges(worktrees)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildHierarchyEdges
// ---------------------------------------------------------------------------

describe('buildHierarchyEdges', () => {
  // U5: Subtask → parent=Story, epic=null → type 'parent'
  it('U5: Subtask parent=Story, epic=null → edge type parent', () => {
    const worktrees = {
      '/sub': makeWorktree('MAE-10', {
        issuetype: 'Subtask',
        parent: { key: 'MAE-5', summary: 'Story', status: 'In Progress', statusCategory: 'In Progress' },
        epic: null,
      }),
    };
    const edges = buildHierarchyEdges(worktrees);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'MAE-10', target: 'MAE-5', type: 'parent' });
  });

  // U6: Story.epic === Story.parent.key → type 'epic'
  it('U6: Story parent=Epic, epic === parent.key → edge type epic', () => {
    const worktrees = {
      '/story': makeWorktree('MAE-20', {
        issuetype: 'Story',
        parent: { key: 'MAE-249', summary: 'Epic', status: 'In Progress', statusCategory: 'In Progress' },
        epic: 'MAE-249',
      }),
    };
    const edges = buildHierarchyEdges(worktrees);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'MAE-20', target: 'MAE-249', type: 'epic' });
  });

  // U7: epic=null, parent.key exists → type 'parent'
  it('U7: epic=null, parent.key 존재 → edge type parent', () => {
    const worktrees = {
      '/story': makeWorktree('MAE-20', {
        parent: { key: 'MAE-100', summary: 'X', status: 'Open', statusCategory: 'To Do' },
        epic: null,
      }),
    };
    const edges = buildHierarchyEdges(worktrees);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe('parent');
  });

  // U10: self-loop guard: parent.key === self
  it('U10: parent.key === self → edge 생성 안 함', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1', {
        parent: { key: 'MAE-1', summary: 'Self', status: 'Open', statusCategory: 'To Do' },
      }),
    };
    expect(buildHierarchyEdges(worktrees)).toHaveLength(0);
  });

  it('parent 없는 worktree → edge 없음', () => {
    const worktrees = { '/a': makeWorktree('MAE-1') };
    expect(buildHierarchyEdges(worktrees)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addPhantomNodes
// ---------------------------------------------------------------------------

describe('addPhantomNodes', () => {
  // U8: A.blocks=[X], X not in nodes → X added as phantom
  it('U8: blocks edge target 없는 worktree → phantom node 추가', () => {
    const nodes = [{ id: 'MAE-1', label: 'MAE-1', data: {} }];
    const edges = [{ id: 'blocks:MAE-1->MAE-99', source: 'MAE-1', target: 'MAE-99', type: 'blocks' }];
    const result = addPhantomNodes(nodes, edges);
    expect(result).toHaveLength(2);
    const phantom = result.find(n => n.id === 'MAE-99');
    expect(phantom).toBeDefined();
    expect(phantom.data.phantom).toBe(true);
  });

  // U9: parent worktree not in nodes → phantom
  it('U9: hierarchy edge target 없는 worktree → phantom node 추가', () => {
    const nodes = [{ id: 'MAE-10', label: 'MAE-10', data: {} }];
    const edges = [{ id: 'parent:MAE-10->MAE-5', source: 'MAE-10', target: 'MAE-5', type: 'parent' }];
    const result = addPhantomNodes(nodes, edges);
    expect(result).toHaveLength(2);
    expect(result.find(n => n.id === 'MAE-5')?.data.phantom).toBe(true);
  });

  it('모든 endpoint가 이미 존재하면 phantom 추가 없음', () => {
    const nodes = [
      { id: 'MAE-1', label: 'MAE-1', data: {} },
      { id: 'MAE-2', label: 'MAE-2', data: {} },
    ];
    const edges = [{ id: 'blocks:MAE-1->MAE-2', source: 'MAE-1', target: 'MAE-2', type: 'blocks' }];
    expect(addPhantomNodes(nodes, edges)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// selectGraphData (integration)
// ---------------------------------------------------------------------------

describe('selectGraphData', () => {
  // U13: null/undefined guard
  it('U13: null → empty result', () => {
    expect(selectGraphData(null)).toEqual({ nodes: [], edges: [] });
    expect(selectGraphData(undefined)).toEqual({ nodes: [], edges: [] });
  });

  it('빈 객체 → empty result', () => {
    expect(selectGraphData({})).toEqual({ nodes: [], edges: [] });
  });

  // U11: idempotency
  it('U11: 동일 입력 두 번 → deep equal', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1', { links: { blocks: ['MAE-2'], blockedBy: [] } }),
      '/b': makeWorktree('MAE-2', {
        parent: { key: 'MAE-3', summary: 'Epic', status: 'Open', statusCategory: 'To Do' },
        epic: 'MAE-3',
      }),
      '/c': makeWorktree('MAE-3'),
      '/d': makeWorktree('MAE-4', { links: { blocks: ['MAE-99'], blockedBy: [] } }),
      '/e': makeWorktree('MAE-5'),
    };
    const r1 = selectGraphData(worktrees);
    const r2 = selectGraphData(worktrees);
    expect(r1).toEqual(r2);
  });

  // U12: deterministic sort regardless of input key order
  it('U12: 입력 순서 달라도 출력 동일 (id 사전순 정렬)', () => {
    const wt1 = makeWorktree('MAE-1', { links: { blocks: ['MAE-2'], blockedBy: [] } });
    const wt2 = makeWorktree('MAE-2');
    const wt3 = makeWorktree('MAE-3');

    const resultA = selectGraphData({ '/a': wt1, '/b': wt2, '/c': wt3 });
    const resultB = selectGraphData({ '/c': wt3, '/a': wt1, '/b': wt2 });

    expect(resultA.nodes.map(n => n.id)).toEqual(resultB.nodes.map(n => n.id));
    expect(resultA.edges.map(e => e.id)).toEqual(resultB.edges.map(e => e.id));
  });

  it('nodes는 id 오름차순 정렬', () => {
    const worktrees = {
      '/c': makeWorktree('MAE-30'),
      '/a': makeWorktree('MAE-10'),
      '/b': makeWorktree('MAE-20'),
    };
    const { nodes } = selectGraphData(worktrees);
    expect(nodes.map(n => n.id)).toEqual(['MAE-10', 'MAE-20', 'MAE-30']);
  });

  it('phantom node는 data.phantom === true', () => {
    const worktrees = {
      '/a': makeWorktree('MAE-1', { links: { blocks: ['MAE-999'], blockedBy: [] } }),
    };
    const { nodes } = selectGraphData(worktrees);
    const phantom = nodes.find(n => n.id === 'MAE-999');
    expect(phantom?.data?.phantom).toBe(true);
  });

  it('real node에는 phantom 플래그 없음', () => {
    const worktrees = { '/a': makeWorktree('MAE-1') };
    const { nodes } = selectGraphData(worktrees);
    expect(nodes[0].data.phantom).toBeUndefined();
  });
});
