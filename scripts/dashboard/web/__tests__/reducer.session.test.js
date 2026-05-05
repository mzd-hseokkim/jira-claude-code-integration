/**
 * MAE-333: SESSION_* reducer 액션 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../src/state/reducer.js';

const makeSession = (sessionId, extras = {}) => ({
  sessionId,
  cwd: null,
  source: null,
  startedAt: null,
  lastActiveAt: null,
  activity: [],
  ...extras,
});

describe('reducer — SESSION actions (MAE-333)', () => {
  // S1: SNAPSHOT sessions 컬렉션 초기화
  it('SNAPSHOT: sessions 컬렉션을 sessionId keyed map으로 초기화', () => {
    const s = makeSession('sess-aaa', { cwd: '/tmp/foo', source: 'startup' });
    const state = reducer(initialState, { type: 'SNAPSHOT', worktrees: [], sessions: [s] });
    expect(state.sessions['sess-aaa']).toBeDefined();
    expect(state.sessions['sess-aaa'].cwd).toBe('/tmp/foo');
    expect(state.sessions['sess-aaa'].source).toBe('startup');
    expect(state.connection).toBe('connected');
  });

  // S2: SNAPSHOT sessions 없으면 빈 map
  it('SNAPSHOT: sessions 필드 없으면 빈 객체', () => {
    const state = reducer(initialState, { type: 'SNAPSHOT', worktrees: [] });
    expect(state.sessions).toEqual({});
  });

  // S3: SESSION_ADDED 신규 세션 추가
  it('SESSION_ADDED: 신규 sessionId 추가, 기존 sessions 보존', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [],
      sessions: [makeSession('sess-aaa')],
    });
    const s2 = reducer(s1, {
      type: 'SESSION_ADDED',
      sessionId: 'sess-bbb',
      state: makeSession('sess-bbb', { cwd: '/tmp/bar' }),
    });
    expect(s2.sessions['sess-bbb']).toBeDefined();
    expect(s2.sessions['sess-bbb'].cwd).toBe('/tmp/bar');
    expect(s2.sessions['sess-aaa']).toBeDefined(); // 기존 유지
  });

  // S4: SESSION_CHANGED 세션 상태 업데이트
  it('SESSION_CHANGED: 해당 sessionId만 업데이트, 다른 세션 불변', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [],
      sessions: [
        makeSession('sess-aaa', { cwd: '/tmp/a' }),
        makeSession('sess-bbb', { cwd: '/tmp/b' }),
      ],
    });
    const updated = makeSession('sess-aaa', { cwd: '/tmp/a', source: 'resume' });
    const s2 = reducer(s1, { type: 'SESSION_CHANGED', sessionId: 'sess-aaa', state: updated });
    expect(s2.sessions['sess-aaa'].source).toBe('resume');
    expect(s2.sessions['sess-bbb']).toEqual(s1.sessions['sess-bbb']); // 불변
  });

  // S5: SESSION_REMOVED 세션 제거
  it('SESSION_REMOVED: 해당 sessionId 삭제, 기존 sessions 보존, 원본 불변', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [],
      sessions: [makeSession('sess-aaa'), makeSession('sess-bbb')],
    });
    const prevSessions = s1.sessions;
    const s2 = reducer(s1, { type: 'SESSION_REMOVED', sessionId: 'sess-aaa' });
    expect(s2.sessions['sess-aaa']).toBeUndefined();
    expect(s2.sessions['sess-bbb']).toBeDefined();
    // 원본 불변
    expect(prevSessions['sess-aaa']).toBeDefined();
  });

  // S6: SESSION_REMOVED 존재하지 않는 ID — 오류 없이 통과
  it('SESSION_REMOVED: 존재하지 않는 sessionId도 안전하게 처리', () => {
    const s1 = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [],
      sessions: [makeSession('sess-aaa')],
    });
    const s2 = reducer(s1, { type: 'SESSION_REMOVED', sessionId: 'nonexistent' });
    expect(s2.sessions['sess-aaa']).toBeDefined();
  });

  // S7: worktrees와 sessions 공존
  it('SNAPSHOT: worktrees와 sessions 동시에 포함 가능', () => {
    const state = reducer(initialState, {
      type: 'SNAPSHOT',
      worktrees: [{ path: '/wt/a', branch: null, taskId: 'X-1', cachedIssue: null, noContext: false, activity: [] }],
      sessions: [makeSession('sess-aaa', { cwd: '/tmp/foo' })],
    });
    expect(Object.keys(state.worktrees)).toHaveLength(1);
    expect(Object.keys(state.sessions)).toHaveLength(1);
  });
});
