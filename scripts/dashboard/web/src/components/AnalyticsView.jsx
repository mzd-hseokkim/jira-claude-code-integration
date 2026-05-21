import React, { useState } from 'react';
import { useSpaces, useMetrics } from '../hooks/useMetrics.js';
import StatusChart from './charts/StatusChart.jsx';
import ThroughputChart from './charts/ThroughputChart.jsx';
import TimeDistChart from './charts/TimeDistChart.jsx';
import PerAssigneeTable from './charts/PerAssigneeTable.jsx';
import AgingWipTable from './charts/AgingWipTable.jsx';

/**
 * Analytics 뷰.
 * - 스페이스 선택기 (GET /spaces)
 * - 선택 스페이스의 status 분포, WIP, 주별 throughput (GET /metrics)
 */
export default function AnalyticsView() {
  const { spaces, loading: spacesLoading, error: spacesError } = useSpaces();
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);

  // 첫 스페이스 자동 선택
  React.useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) {
      setSelectedSpaceId(spaces[0].id);
    }
  }, [spaces, selectedSpaceId]);

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
      {/* 스페이스 선택기 */}
      <div className="analytics-spaces">
        <span className="analytics-spaces__label">SPACE</span>
        <div className="analytics-spaces__list" role="radiogroup" aria-label="스페이스 선택">
          {spaces.map((sp) => (
            <button
              key={sp.id}
              type="button"
              role="radio"
              aria-checked={sp.id === selectedSpaceId}
              className={`analytics-space-btn${sp.id === selectedSpaceId ? ' analytics-space-btn--active' : ''}${!sp.credsOk ? ' analytics-space-btn--no-creds' : ''}`}
              onClick={() => setSelectedSpaceId(sp.id)}
              title={sp.credsOk ? sp.site : `${sp.site} (인증 정보 없음)`}
              disabled={!sp.credsOk}
            >
              {sp.projectKey}
              {!sp.credsOk && <span className="analytics-space-btn__badge">!</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 메트릭스 패널 */}
      <div className="analytics-metrics">
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
            {/* WIP 배지 */}
            <div className="analytics-wip">
              <span className="analytics-wip__label">WIP</span>
              <span className="analytics-wip__count">{data.wip}</span>
            </div>

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
          </>
        ) : null}
      </div>
    </div>
  );
}
