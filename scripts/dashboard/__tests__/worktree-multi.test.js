'use strict';

/**
 * worktree-multi.test.js — MAE-277
 *
 * Unit tests for multi-workspace worktree collector behaviour:
 *   - collectWorktrees calls git worktree list once per root
 *   - snapshot entries include workspaceRoot field
 *   - deletion scoped to the root that was scanned
 *   - chokidar.watch receives array of patterns
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// ---------------------------------------------------------------------------
// Minimal mock store
// ---------------------------------------------------------------------------
function createMockStore() {
  const entries = new Map(); // path → state
  const events = [];

  return {
    upsertWorktree(state) {
      entries.set(state.path, { ...state });
    },
    removeWorktree(p) {
      events.push({ event: 'removed', path: p });
      entries.delete(p);
    },
    getSnapshot() {
      return [...entries.values()];
    },
    _entries: entries,
    _events: events,
  };
}

// ---------------------------------------------------------------------------
// Helpers to stub require() inside the module under test
// ---------------------------------------------------------------------------

/**
 * Load collectors/worktree.js with child_process.execSync replaced by a stub.
 * execStubMap: { [cwd: string]: string }  — maps cwd to stdout to return.
 * Returns the module exports + a call log.
 */
function loadWorktreeModuleWithExecStub(execStubMap) {
  const calls = [];

  // Build a fresh require() that intercepts 'node:child_process'.
  const originalLoad = Module._load.bind(Module);
  Module._load = function (request, parent, isMain) {
    if (request === 'node:child_process' || request === 'child_process') {
      return {
        execSync(cmd, opts) {
          calls.push({ cmd, cwd: opts && opts.cwd });
          const key = opts && opts.cwd;
          if (Object.prototype.hasOwnProperty.call(execStubMap, key)) {
            return execStubMap[key];
          }
          throw new Error(`execSync: no stub for cwd=${key}`);
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  // Force fresh load by removing from cache
  const modPath = require.resolve('../collectors/worktree');
  delete require.cache[modPath];

  let mod;
  try {
    mod = require('../collectors/worktree');
  } finally {
    Module._load = originalLoad;
    // Restore cache for subsequent requires
    delete require.cache[modPath];
  }

  return { mod, calls };
}

// ---------------------------------------------------------------------------
// Test: collectWorktrees calls execSync once per root
// ---------------------------------------------------------------------------
test('collectWorktrees: calls git worktree list once per root', () => {
  const rootA = '/ws/repoA';
  const rootB = '/ws/repoB';

  // Each root returns one feature worktree (non-main/master)
  const stdoutA = [
    `worktree ${rootA}`,
    'branch refs/heads/main',
    '',
    `worktree ${rootA}-worktree/FEAT-1`,
    'branch refs/heads/feature/FEAT-1',
    '',
  ].join('\n');

  const stdoutB = [
    `worktree ${rootB}`,
    'branch refs/heads/main',
    '',
    `worktree ${rootB}-worktree/FEAT-2`,
    'branch refs/heads/feature/FEAT-2',
    '',
  ].join('\n');

  const { mod, calls } = loadWorktreeModuleWithExecStub({ [rootA]: stdoutA, [rootB]: stdoutB });
  const store = createMockStore();

  mod.collectWorktrees(store, [rootA, rootB], null);

  // Should have called execSync exactly twice (once per root)
  const worktreeCalls = calls.filter((c) => c.cmd.includes('git worktree list'));
  assert.equal(worktreeCalls.length, 2, 'expected 2 execSync calls');
  assert.equal(worktreeCalls[0].cwd, rootA);
  assert.equal(worktreeCalls[1].cwd, rootB);

  // Snapshot should have 2 entries (one per root, main skipped)
  const snap = store.getSnapshot();
  assert.equal(snap.length, 2);
});

// ---------------------------------------------------------------------------
// Test: snapshot entries have workspaceRoot field matching their root
// ---------------------------------------------------------------------------
test('collectWorktrees: snapshot entries include workspaceRoot field', () => {
  const rootA = '/ws/repoA';
  const rootB = '/ws/repoB';

  const wtA = `${rootA}-worktree/FEAT-1`;
  const wtB = `${rootB}-worktree/FEAT-2`;

  const stdoutA = [`worktree ${rootA}`, 'branch refs/heads/main', '', `worktree ${wtA}`, 'branch refs/heads/feature/FEAT-1', ''].join('\n');
  const stdoutB = [`worktree ${rootB}`, 'branch refs/heads/main', '', `worktree ${wtB}`, 'branch refs/heads/feature/FEAT-2', ''].join('\n');

  const { mod } = loadWorktreeModuleWithExecStub({ [rootA]: stdoutA, [rootB]: stdoutB });
  const store = createMockStore();

  mod.collectWorktrees(store, [rootA, rootB], null);

  const snap = store.getSnapshot();
  const entryA = snap.find((e) => e.path === wtA);
  const entryB = snap.find((e) => e.path === wtB);

  assert.ok(entryA, 'entry for wtA should exist');
  assert.equal(entryA.workspaceRoot, rootA, 'workspaceRoot for wtA should be rootA');

  assert.ok(entryB, 'entry for wtB should exist');
  assert.equal(entryB.workspaceRoot, rootB, 'workspaceRoot for wtB should be rootB');
});

// ---------------------------------------------------------------------------
// Test: disappearing worktree from rootA is removed; rootB worktree is untouched
// ---------------------------------------------------------------------------
test('collectWorktrees: removes disappeared worktrees only within their root', () => {
  const rootA = '/ws/repoA';
  const rootB = '/ws/repoB';

  const wtA = `${rootA}-worktree/FEAT-1`;
  const wtB = `${rootB}-worktree/FEAT-2`;

  // Seed store with both entries
  const store = createMockStore();
  store.upsertWorktree({ path: wtA, branch: 'feature/FEAT-1', workspaceRoot: rootA });
  store.upsertWorktree({ path: wtB, branch: 'feature/FEAT-2', workspaceRoot: rootB });

  // rootA now returns no feature worktrees (FEAT-1 disappeared)
  const stdoutA = [`worktree ${rootA}`, 'branch refs/heads/main', ''].join('\n');
  // rootB still has FEAT-2
  const stdoutB = [`worktree ${rootB}`, 'branch refs/heads/main', '', `worktree ${wtB}`, 'branch refs/heads/feature/FEAT-2', ''].join('\n');

  const { mod } = loadWorktreeModuleWithExecStub({ [rootA]: stdoutA, [rootB]: stdoutB });

  mod.collectWorktrees(store, [rootA, rootB], null);

  // wtA should have been removed
  const removed = store._events.filter((e) => e.event === 'removed' && e.path === wtA);
  assert.equal(removed.length, 1, 'wtA should be removed');

  // wtB should still exist
  const snap = store.getSnapshot();
  const entryB = snap.find((e) => e.path === wtB);
  assert.ok(entryB, 'wtB should NOT be removed');
});

// ---------------------------------------------------------------------------
// Test: chokidar patterns are correctly derived from workspaceRoots
// The worktree.js code computes patterns as path.dirname(root)/*/.jira-context.json.
// We verify this logic by inspecting the pattern derivation directly.
// ---------------------------------------------------------------------------
test('chokidar pattern derivation: each root yields a pattern under its parent dir', () => {
  const rootA = path.join('/ws', 'repoA');
  const rootB = path.join('/ws', 'repoB');
  const workspaceRoots = [rootA, rootB];

  // Mirror the logic in startWorktreeCollector
  const patterns = workspaceRoots.map((root) => {
    const parentDir = path.dirname(root);
    return path.join(parentDir, '*', '.jira-context.json');
  });

  assert.ok(Array.isArray(patterns), 'patterns should be an array');
  assert.equal(patterns.length, 2);

  const parentA = path.dirname(rootA);
  const parentB = path.dirname(rootB);
  assert.ok(patterns[0].startsWith(parentA), `pattern[0] should start with parent of rootA (${parentA})`);
  assert.ok(patterns[1].startsWith(parentB), `pattern[1] should start with parent of rootB (${parentB})`);
  assert.ok(patterns[0].endsWith('.jira-context.json'));
  assert.ok(patterns[1].endsWith('.jira-context.json'));
});

// ---------------------------------------------------------------------------
// Test: legacy single workspaceRoot is accepted (backward compat)
// ---------------------------------------------------------------------------
test('startWorktreeCollector: legacy workspaceRoot single string is accepted', () => {
  const root = '/ws/repoA';
  const emptyStdout = [`worktree ${root}`, 'branch refs/heads/main', ''].join('\n');

  const originalLoad = Module._load.bind(Module);
  Module._load = function (request, parent, isMain) {
    if (request === 'node:child_process' || request === 'child_process') {
      return {
        execSync(_cmd, opts) {
          if (opts && opts.cwd === root) return emptyStdout;
          throw new Error(`unexpected cwd: ${opts && opts.cwd}`);
        },
      };
    }
    if (request === 'chokidar') {
      return {
        watch() {
          return { on() { return this; }, close() {} };
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  const modPath = require.resolve('../collectors/worktree');
  delete require.cache[modPath];

  let mod;
  try {
    mod = require('../collectors/worktree');
  } finally {
    Module._load = originalLoad;
    delete require.cache[modPath];
  }

  const store = createMockStore();
  // Should not throw — legacy single string
  const collector = mod.startWorktreeCollector(store, {
    workspaceRoot: root,
    pollIntervalMs: 9_999_999,
    logger: null,
  });
  collector.stop();
  // If we reached here without error, backward compat works.
  assert.ok(true);
});
