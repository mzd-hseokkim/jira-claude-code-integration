import React, { useEffect, useMemo, useState } from 'react';
import { DashboardProvider, useDashboard } from './state/DashboardContext.jsx';
import { useDashboardStream } from './hooks/useDashboardStream.js';
import { useIdle } from './hooks/useIdle.js';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import KittBar from './components/KittBar.jsx';
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

function getSummary(wt) {
  return wt.cachedIssue?.summary ?? wt.summary ?? '';
}

/**
 * 정렬 키와 방향에 따른 비교 함수 생성.
 * @param {'activity'|'taskId'|'summary'} key
 * @param {'asc'|'desc'} dir
 */
function makeSorter(key, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  return (a, b) => {
    let cmp = 0;
    if (key === 'activity') {
      cmp = lastActivityMs(a) - lastActivityMs(b);
    } else if (key === 'taskId') {
      const av = a.taskId ?? '';
      const bv = b.taskId ?? '';
      if (!av && bv) cmp = 1;
      else if (av && !bv) cmp = -1;
      else cmp = av.localeCompare(bv, undefined, { numeric: true });
    } else if (key === 'summary') {
      cmp = getSummary(a).localeCompare(getSummary(b), 'ko');
    }
    if (cmp === 0) cmp = (a.path || '').localeCompare(b.path || '');
    return cmp * sign;
  };
}

/**
 * Inner component that consumes context after Provider is mounted.
 */
const SORT_OPTIONS = [
  { key: 'activity', label: '최근활동', defaultDir: 'desc' },
  { key: 'taskId',   label: '이슈키',   defaultDir: 'asc'  },
  { key: 'summary',  label: 'summary',  defaultDir: 'asc'  },
];

function Dashboard() {
  const { state, dispatch } = useDashboard();
  useDashboardStream(dispatch);

  const isIdle = useIdle(state.lastEventAt);

  const [sortKey, setSortKey] = useState('activity');
  const [sortDir, setSortDir] = useState('desc');
  const [filter, setFilter] = useState('');

  function handleSortClick(key) {
    if (key === sortKey) {
      // 같은 칩 다시 누르면 방향 토글
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 칩이면 그 키의 default 방향으로 전환
      setSortKey(key);
      const opt = SORT_OPTIONS.find(o => o.key === key);
      setSortDir(opt?.defaultDir ?? 'asc');
    }
  }

  const filtered = useMemo(() => {
    const all = Object.values(state.worktrees);
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(wt => {
      const hay = [
        wt.taskId,
        getSummary(wt),
        wt.branch,
        wt.path,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [state.worktrees, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort(makeSorter(sortKey, sortDir));
  }, [filtered, sortKey, sortDir]);

  const totalCount = Object.keys(state.worktrees).length;

  const connState = state.connection;
  const connLabel =
    connState === 'connected' ? 'LIVE' :
    connState === 'disconnected' ? 'RECONNECTING…' :
    'CONNECTING…';
  const connClass =
    connState === 'connected' ? 'conn-chip conn-chip--live' :
    'conn-chip conn-chip--off';

  // 다음 jira-collector polling(60초)까지의 진행률(0~1).
  // 1초마다 갱신되며 100% 도달 시 자동으로 0부터 다시 시작.
  const POLL_CYCLE_MS = 60_000;
  const [cycleProgress, setCycleProgress] = useState(0);
  useEffect(() => {
    if (connState !== 'connected') {
      setCycleProgress(0);
      return undefined;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) % POLL_CYCLE_MS;
      setCycleProgress(elapsed / POLL_CYCLE_MS);
    }, 250);
    return () => clearInterval(id);
  }, [connState]);

  return (
    <>
      <KittBar connection={connState} />
      <ConnectionBanner connection={connState} />
      <header className="dashboard-header">
        <div className="dashboard-header__inner">
          <div className="dashboard-header__title-block">
            <h1 className="dashboard-header__title">Claude Code Worktree Dashboard</h1>
            <p className="dashboard-header__subtitle">실시간 worktree 활동 모니터</p>
          </div>
          <div className="dashboard-header__meta">
            <span className="dashboard-header__count">
              <span className="dashboard-header__count-num">
                {filter ? `${sorted.length}/${totalCount}` : totalCount}
              </span>
              <span className="dashboard-header__count-label">worktrees</span>
            </span>
            <span
              className={connClass}
              aria-live="polite"
              style={
                connState === 'connected'
                  ? { '--cycle-fill': `${(cycleProgress * 100).toFixed(1)}%` }
                  : undefined
              }
            >
              <span className="conn-chip__dot" aria-hidden="true" />
              {connLabel}
            </span>
          </div>
        </div>
        <div className="dashboard-header__controls">
          <div className="sort-chips" role="toolbar" aria-label="정렬 기준">
            <span className="sort-chips__label">SORT</span>
            {SORT_OPTIONS.map(opt => {
              const active = sortKey === opt.key;
              const arrow = active ? (sortDir === 'asc' ? '↑' : '↓') : '';
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`sort-chip${active ? ' sort-chip--active' : ''}`}
                  onClick={() => handleSortClick(opt.key)}
                  aria-pressed={active}
                >
                  {opt.label}
                  {arrow && <span className="sort-chip__arrow">{arrow}</span>}
                </button>
              );
            })}
          </div>
          <div className="filter-input">
            <span className="filter-input__icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              className="filter-input__field"
              placeholder="제목 / 이슈키 / 브랜치 검색"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="제목 필터"
            />
            {filter && (
              <button
                type="button"
                className="filter-input__clear"
                onClick={() => setFilter('')}
                aria-label="필터 지우기"
              >×</button>
            )}
          </div>
        </div>
      </header>
      <main className={`dashboard-grid${isIdle ? ' is-idle' : ''}`}>
        {sorted.length === 0 ? (
          <p className="dashboard-empty">
            {filter
              ? `"${filter}" 에 매치되는 worktree가 없습니다.`
              : connState === 'connected'
                ? 'Worktree가 없습니다.'
                : '연결을 기다리는 중…'}
          </p>
        ) : (
          sorted.map((wt) => <WorktreeCard key={wt.path} worktree={wt} />)
        )}
      </main>
      <footer className="dashboard-footer">
        <span className="dashboard-footer__brand">jira-integration plugin</span>
        <span className="dashboard-footer__sep">·</span>
        <span className="dashboard-footer__bind">127.0.0.1:8765</span>
      </footer>
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
