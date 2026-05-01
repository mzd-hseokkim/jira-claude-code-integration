import React from 'react';
import { DashboardProvider, useDashboard } from './state/DashboardContext.jsx';
import { useDashboardStream } from './hooks/useDashboardStream.js';
import { useIdle } from './hooks/useIdle.js';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import LiveIndicator from './components/LiveIndicator.jsx';
import WorktreeCard from './components/WorktreeCard.jsx';

/**
 * 마지막 activity ts (없으면 null).
 * @param {import('./state/reducer.js').WorktreeState} wt
 */
function lastActivityMs(wt) {
  const a = wt.activity;
  if (!Array.isArray(a) || a.length === 0) return 0;
  const ts = a[a.length - 1]?.ts;
  if (!ts) return 0;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 카드 정렬: 최근 활동 DESC → taskId ASC → path ASC.
 *
 * @param {import('./state/reducer.js').WorktreeState} a
 * @param {import('./state/reducer.js').WorktreeState} b
 */
function sortWorktrees(a, b) {
  const ta = lastActivityMs(a);
  const tb = lastActivityMs(b);
  if (ta !== tb) return tb - ta;
  if (a.taskId && b.taskId) return a.taskId.localeCompare(b.taskId);
  if (a.taskId) return -1;
  if (b.taskId) return 1;
  return a.path.localeCompare(b.path);
}

/**
 * Inner component that consumes context after Provider is mounted.
 */
function Dashboard() {
  const { state, dispatch } = useDashboard();
  useDashboardStream(dispatch);

  const isIdle = useIdle(state.lastEventAt);
  const sorted = Object.values(state.worktrees).sort(sortWorktrees);

  return (
    <>
      <ConnectionBanner connection={state.connection} />
      <header className="dashboard-header">
        <h1>Claude Code Dashboard</h1>
        <span className="dashboard-header__count">{sorted.length} worktrees</span>
        <LiveIndicator lastEventAt={state.lastEventAt} isIdle={isIdle} />
      </header>
      <main className={`dashboard-grid${isIdle ? ' is-idle' : ''}`}>
        {sorted.length === 0 ? (
          <p className="dashboard-empty">
            {state.connection === 'connected'
              ? 'Worktree가 없습니다.'
              : '연결을 기다리는 중…'}
          </p>
        ) : (
          sorted.map((wt) => <WorktreeCard key={wt.path} worktree={wt} />)
        )}
      </main>
    </>
  );
}

export default function App() {
  return (
    <DashboardProvider>
      <Dashboard />
    </DashboardProvider>
  );
}
