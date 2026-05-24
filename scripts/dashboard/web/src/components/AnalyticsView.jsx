import React, { useState, useMemo } from 'react';
import { useSpaces, useMetrics } from '../hooks/useMetrics.js';
import CountUp from './CountUp.jsx';
import StatusChart from './charts/StatusChart.jsx';
import ThroughputChart from './charts/ThroughputChart.jsx';
import TimeDistChart from './charts/TimeDistChart.jsx';
import PerAssigneeTable from './charts/PerAssigneeTable.jsx';
import AgingWipTable from './charts/AgingWipTable.jsx';
import FunnelChart from './charts/FunnelChart.jsx';
import PriorityChart from './charts/PriorityChart.jsx';
import EpicProgressTable from './charts/EpicProgressTable.jsx';
import AgentThroughputTable from './charts/AgentThroughputTable.jsx';

/**
 * Analytics 뷰.
 * - 스페이스 선택기 (GET /spaces)
 * - 선택 스페이스의 status 분포, WIP, 주별 throughput (GET /metrics)
 */
export default function AnalyticsView() {
  const { spaces, loading: spacesLoading, error: spacesError } = useSpaces();
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);

  // 최근 추가된 스페이스가 맨 위로 (addedAt 내림차순)
  const sortedSpaces = useMemo(
    () => spaces.slice().sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')),
    [spaces],
  );

  // 첫 스페이스 자동 선택 (인증 가능한 것 우선)
  React.useEffect(() => {
    if (!selectedSpaceId && sortedSpaces.length > 0) {
      const first = sortedSpaces.find((s) => s.credsOk) ?? sortedSpaces[0];
      setSelectedSpaceId(first.id);
    }
  }, [sortedSpaces, selectedSpaceId]);

  const { data, loading: metricsLoading, error: metricsError, refresh } = useMetrics(selectedSpaceId);

  // ---------- Render ----------

  if (spacesLoading) {
    return (
      <div className="analytics-view analytics-view--loading" role="status" aria-busy="true">
        <div className="analytics-loading">스페이스 목록 로딩 중…</div>
      </div>
    );
  }

  if (spacesError) {
    return (
      <div className="analytics-view analytics-view--error" role="alert">
        <div className="analytics-error">
          <p className="analytics-error__title">스페이스 로드 실패</p>
          <p className="analytics-error__detail">{spacesError}</p>
          <button type="button" className="analytics-error__retry" onClick={refresh}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (spaces.length === 0) {
    return (
      <div className="analytics-view analytics-view--empty" role="status">
        <div className="analytics-empty">
          <p className="analytics-empty__title">등록된 스페이스가 없습니다</p>
          <p className="analytics-empty__hint">
            워크스페이스를 등록하면 여기에 analytics 데이터가 표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-view">
      {/* 헤더: 스페이스 선택기 + WIP */}
      <div className="analytics-header">
      <div className="analytics-spaces">
        <label className="analytics-spaces__label" htmlFor="analytics-space-select">SPACE</label>
        <select
          id="analytics-space-select"
          className="analytics-spaces__select"
          aria-label="스페이스 선택"
          value={selectedSpaceId ?? ''}
          onChange={(e) => setSelectedSpaceId(e.target.value)}
        >
          {sortedSpaces.map((sp) => (
            <option key={sp.id} value={sp.id} disabled={!sp.credsOk}>
              {sp.projectKey} — {sp.site}{!sp.credsOk ? ' (인증 정보 없음)' : ''}
            </option>
          ))}
        </select>
      </div>
      {data && (
        <div className="analytics-wip">
          <span className="analytics-wip__label">WIP</span>
          <span className="analytics-wip__count"><CountUp value={data.wip} /></span>
        </div>
      )}
      </div>

      {/* 메트릭스 패널 (스페이스 전환 시 remount → 애니메이션 재생) */}
      <div className="analytics-metrics" key={selectedSpaceId}>
        {metricsLoading && !data ? (
          <div className="analytics-loading" role="status" aria-busy="true">
            데이터 로딩 중…
          </div>
        ) : metricsError ? (
          <div className="analytics-error" role="alert">
            <p className="analytics-error__title">메트릭스 로드 실패</p>
            <p className="analytics-error__detail">{metricsError}</p>
            <button type="button" className="analytics-error__retry" onClick={refresh}>
              다시 시도
            </button>
          </div>
        ) : data ? (
          <>
            {/* Status 분포 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">Status 분포</h3>
              <div className="analytics-section__body">
                <StatusChart distribution={data.statusDistribution} />
              </div>
            </div>

            {/* Throughput */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">주별 Throughput (완료/주)</h3>
              <div className="analytics-section__body analytics-section__body--throughput">
                <ThroughputChart throughput={data.throughput} />
              </div>
            </div>

            {/* Lead Time 분포 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">Lead Time 분포 (일)</h3>
              <div className="analytics-section__body">
                <TimeDistChart
                  distribution={data.leadTime.distribution}
                  median={data.leadTime.median}
                  p75={data.leadTime.p75}
                  p95={data.leadTime.p95}
                  label="Lead Time"
                />
              </div>
            </div>

            {/* Cycle Time 분포 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">Cycle Time 분포 (일, 근사)</h3>
              <div className="analytics-section__body">
                <TimeDistChart
                  distribution={data.cycleTime.distribution}
                  median={data.cycleTime.median}
                  p75={data.cycleTime.p75}
                  p95={data.cycleTime.p95}
                  label="Cycle Time"
                  note={data.cycleTime.note}
                />
              </div>
            </div>

            {/* 사람별 처리량 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">사람별 처리량</h3>
              <div className="analytics-section__body">
                <PerAssigneeTable perAssignee={data.perAssignee} weeks={8} />
              </div>
            </div>

            {/* Aging WIP */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">Aging WIP (경과일순)</h3>
              <div className="analytics-section__body">
                <AgingWipTable agingWip={data.agingWip} />
              </div>
            </div>

            {/* SDLC 퍼널 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">SDLC 단계 퍼널 (로컬 worktree 기준)</h3>
              <div className="analytics-section__body">
                <FunnelChart funnel={data.sdlcFunnel} />
              </div>
            </div>

            {/* 에이전트 처리량 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">에이전트 처리량 (이슈 단위, 근사)</h3>
              <div className="analytics-section__body">
                <AgentThroughputTable agentThroughput={data.agentThroughput} />
              </div>
            </div>

            {/* Priority 분포 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">Priority 분포</h3>
              <div className="analytics-section__body">
                <PriorityChart distribution={data.priorityDistribution} />
              </div>
            </div>

            {/* Epic별 진행률 */}
            <div className="analytics-section">
              <h3 className="analytics-section__title">Epic별 진행률</h3>
              <div className="analytics-section__body">
                <EpicProgressTable epicProgress={data.epicProgress} />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
