/**
 * Pure selector functions for deriving graph data from worktrees state.
 *
 * selectGraphData(worktrees) → { nodes: GraphNode[], edges: GraphEdge[] }
 *
 * GraphNode = { id, label, data: { status, assignee, issuetype, path, phantom? } }
 * GraphEdge = { id, source, target, type: 'blocks' | 'parent' | 'epic' }
 */

/**
 * Build real nodes from worktrees.
 * Skips worktrees without a cachedIssue.
 *
 * @param {Record<string, object>} worktrees
 * @returns {Array<{id:string, label:string, data:object}>}
 */
export function buildNodes(worktrees) {
  const nodes = [];
  for (const [path, wt] of Object.entries(worktrees)) {
    const issue = wt?.cachedIssue;
    if (!issue?.key) continue;
    nodes.push({
      id: issue.key,
      label: `${issue.key} ${issue.summary ?? ''}`.trim(),
      data: {
        status: issue.status,
        assignee: issue.assignee,
        issuetype: issue.issuetype,
        path,
      },
    });
  }
  return nodes;
}

/**
 * Build blocks edges from worktrees.
 * Uses only links.blocks (not blockedBy) to avoid duplicates.
 * Skips self-loops.
 *
 * @param {Record<string, object>} worktrees
 * @returns {Array<{id:string, source:string, target:string, type:'blocks'}>}
 */
export function buildBlocksEdges(worktrees) {
  const seen = new Set();
  const edges = [];
  for (const wt of Object.values(worktrees)) {
    const issue = wt?.cachedIssue;
    if (!issue?.key) continue;
    const blocks = issue.links?.blocks ?? [];
    for (const targetKey of blocks) {
      if (targetKey === issue.key) continue; // self-loop guard
      const id = `blocks:${issue.key}->${targetKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({ id, source: issue.key, target: targetKey, type: 'blocks' });
    }
  }
  return edges;
}

/**
 * Build parent/epic hierarchy edges from worktrees.
 * - If cachedIssue.epic is truthy and equals cachedIssue.parent.key → type 'epic'.
 * - Otherwise if cachedIssue.parent.key exists → type 'parent'.
 * Skips self-loops (parent.key === self.key).
 *
 * @param {Record<string, object>} worktrees
 * @returns {Array<{id:string, source:string, target:string, type:'parent'|'epic'}>}
 */
export function buildHierarchyEdges(worktrees) {
  const seen = new Set();
  const edges = [];
  for (const wt of Object.values(worktrees)) {
    const issue = wt?.cachedIssue;
    if (!issue?.key) continue;
    const parentKey = issue.parent?.key;
    if (!parentKey) continue;
    if (parentKey === issue.key) continue; // self-loop guard

    const type =
      issue.epic && issue.epic === parentKey ? 'epic' : 'parent';
    const id = `${type}:${issue.key}->${parentKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ id, source: issue.key, target: parentKey, type });
  }
  return edges;
}

/**
 * Add phantom nodes for any edge endpoint not already in nodes.
 * Returns a new nodes array (does not mutate input).
 *
 * @param {Array<{id:string}>} nodes
 * @param {Array<{source:string, target:string}>} edges
 * @returns {Array<{id:string, label:string, data:object}>}
 */
export function addPhantomNodes(nodes, edges) {
  const known = new Set(nodes.map(n => n.id));
  const phantoms = [];
  for (const edge of edges) {
    for (const key of [edge.source, edge.target]) {
      if (!known.has(key)) {
        known.add(key);
        phantoms.push({
          id: key,
          label: key,
          data: { phantom: true },
        });
      }
    }
  }
  return phantoms.length > 0 ? nodes.concat(phantoms) : nodes;
}

/**
 * Main selector: converts worktrees state to { nodes, edges } graph model.
 * Result is deterministically sorted by id.
 *
 * @param {Record<string, object> | null | undefined} worktrees
 * @returns {{ nodes: Array, edges: Array }}
 */
export function selectGraphData(worktrees) {
  if (!worktrees || typeof worktrees !== 'object') {
    return { nodes: [], edges: [] };
  }

  const realNodes = buildNodes(worktrees);
  const blocksEdges = buildBlocksEdges(worktrees);
  const hierarchyEdges = buildHierarchyEdges(worktrees);
  const allEdges = blocksEdges.concat(hierarchyEdges);
  const allNodes = addPhantomNodes(realNodes, allEdges);

  // Deterministic sort
  allNodes.sort((a, b) => a.id.localeCompare(b.id));
  allEdges.sort((a, b) => {
    const bySource = a.source.localeCompare(b.source);
    if (bySource !== 0) return bySource;
    const byTarget = a.target.localeCompare(b.target);
    if (byTarget !== 0) return byTarget;
    return a.type.localeCompare(b.type);
  });

  return { nodes: allNodes, edges: allEdges };
}
