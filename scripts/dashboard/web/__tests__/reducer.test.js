import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../src/state/reducer.js';

const makeWorktree = (path, extras = {}) => ({
  path,
  branch: null,
  taskId: null,
  cachedIssue: null,
  noContext: false,
  activity: [],
  ...extras,
});

describe('reducer', () => {
  // U1
  it('SNAPSHOT: worktrees map 교체 + connection=connected', () => {
    const wt = makeWorktree('/a', { taskId: 'X-1' });
    const state = reducer(initialState, { type: 'SNAPSHOT', worktrees: [wt] });
    expect(state.worktrees['/a']).toBeDefined();
    expect(state.worktrees['/a'].taskId).toBe('X-1');
    expect(state.connection).toBe('connected');
  });

  // U2
  it('WORKTREE_ADDED: 신규 path 추가 + 기존 유지', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [makeWorktree('/a', { taskId: 'X-1' })],
    });
    const s2 = reducer(s1, {
      type: 'WORKTREE_ADDED',
      path: '/b',
      state: makeWorktree('/b'),
    });
    expect(s2.worktrees['/b']).toBeDefined();
    expect(s2.worktrees['/a']).toBeDefined();
  });

  // U3
  it('WORKTREE_CHANGED: 해당 path만 업데이트', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [
        makeWorktree('/a', { taskId: 'X-1' }),
        makeWorktree('/b'),
      ],
    });
    const newState = makeWorktree('/a', {
      taskId: 'X-1',
      cachedIssue: { key: 'X-1', summary: 'updated' },
    });
    const s2 = reducer(s1, { type: 'WORKTREE_CHANGED', path: '/a', state: newState });
    expect(s2.worktrees['/a'].cachedIssue.summary).toBe('updated');
    expect(s2.worktrees['/b']).toEqual(s1.worktrees['/b']);
  });

  // U4
  it('WORKTREE_REMOVED: path 삭제, 기존 객체 변경 없음(immutable)', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [makeWorktree('/a'), makeWorktree('/b')],
    });
    const prevWorktrees = s1.worktrees;
    const s2 = reducer(s1, { type: 'WORKTREE_REMOVED', path: '/a' });
    expect(s2.worktrees['/a']).toBeUndefined();
    expect(s2.worktrees['/b']).toBeDefined();
    // 원본 state 불변
    expect(prevWorktrees['/a']).toBeDefined();
  });

  // U5
  it('CONNECTION_LOST: disconnected로 전환, worktrees 보존', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [makeWorktree('/a')],
    });
    const s2 = reducer(s1, { type: 'CONNECTION_LOST' });
    expect(s2.connection).toBe('disconnected');
    expect(s2.worktrees['/a']).toBeDefined();
  });

  // U6
  it('CONNECTION_FAILED_INITIAL: never-connected 유지', () => {
    const s2 = reducer(initialState, { type: 'CONNECTION_FAILED_INITIAL' });
    expect(s2.connection).toBe('never-connected');
  });

  // U6 (MAE-239): LIVE_EVENT — lastEventAt만 갱신, 나머지 불변
  it('LIVE_EVENT: lastEventAt 갱신, 나머지 state 불변', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [makeWorktree('/a', { taskId: 'X-1' })],
    });
    const s2 = reducer(s1, { type: 'LIVE_EVENT', at: 123 });
    expect(s2.lastEventAt).toBe(123);
    expect(s2.connection).toBe(s1.connection);
    expect(s2.worktrees).toBe(s1.worktrees); // same reference (no mutation)
  });
});
