import React from 'react';
import CountUp from '../CountUp.jsx';

/**
 * 리드타임/사이클타임 분포 차트 (경량 SVG bar chart).
 *
 * @param {{
 *   distribution: Array<{ issueKey: string, days: number }>,
 *   median: number|null,
 *   p75: number|null,
 *   p95: number|null,
 *   label: string,
 *   note?: string,
 * }} props
 */
export default function TimeDistChart({ distribution, median, p75, p95, label, note }) {
  if (!distribution || distribution.length === 0) {
    return <div className="chart-empty">{label} 데이터 없음</div>;
  }

  // bucket by day range (0-2, 3-5, 6-9, 10-14, 15-21, 22-30, 31+)
  const buckets = [
    { key: '0-2', min: 0, max: 2 },
    { key: '3-5', min: 3, max: 5 },
    { key: '6-9', min: 6, max: 9 },
    { key: '10-14', min: 10, max: 14 },
    { key: '15-21', min: 15, max: 21 },
    { key: '22-30', min: 22, max: 30 },
    { key: '31+', min: 31, max: Infinity },
  ];
  const counts = buckets.map((b) => ({
    key: b.key,
    count: distribution.filter((d) => d.days >= b.min && d.days <= b.max).length,
  }));

  const maxVal = Math.max(...counts.map((c) => c.count), 1);
  const BAR_W = 32;
  const BAR_GAP = 6;
  const CHART_H = 100;
  const LABEL_H = 22;
  const SVG_W = counts.length * (BAR_W + BAR_GAP);
  const SVG_H = CHART_H + LABEL_H;

  return (
    <div className="time-dist-chart">
      {(median !== null || p75 !== null || p95 !== null) && (
        <div className="kpi-row">
          {median !== null && (
            <div className="kpi">
              <span className="kpi__label">중앙값</span>
              <span className="kpi__value"><CountUp value={median} /><span className="kpi__unit">d</span></span>
            </div>
          )}
          {p75 !== null && (
            <div className="kpi">
              <span className="kpi__label">P75</span>
              <span className="kpi__value"><CountUp value={p75} /><span className="kpi__unit">d</span></span>
            </div>
          )}
          {p95 !== null && (
            <div className="kpi">
              <span className="kpi__label">P95</span>
              <span className="kpi__value"><CountUp value={p95} /><span className="kpi__unit">d</span></span>
            </div>
          )}
        </div>
      )}
      {note && <p className="time-dist-chart__note">({note})</p>}
      <svg
        className="time-dist-chart__svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        role="img"
        aria-label={`${label} 분포 차트`}
        style={{ overflow: 'visible' }}
      >
        {counts.map((d, i) => {
          const x = i * (BAR_W + BAR_GAP);
          const barH = Math.max(4, Math.round((d.count / maxVal) * (CHART_H - 8)));
          const barY = CHART_H - barH;

          return (
            <g key={d.key} transform={`translate(${x},0)`}>
              <rect x={0} y={0} width={BAR_W} height={CHART_H} rx={2}
                fill="var(--chart-bg, rgba(255,255,255,0.06))" />
              {d.count > 0 && (
                <rect x={0} y={barY} width={BAR_W} height={barH} rx={2} className="ax-bar-v"
                  style={{ animationDelay: `${i * 60}ms` }}
                  fill="var(--chart-lead, #34d399)" opacity={0.85} />
              )}
              {d.count > 0 && (
                <text x={BAR_W / 2} y={barY - 3} textAnchor="middle" fontSize={10}
                  fill="currentColor" className="chart-count">
                  {d.count}
                </text>
              )}
              <text x={BAR_W / 2} y={CHART_H + 14} textAnchor="middle" fontSize={8}
                fill="currentColor" className="chart-label" opacity={0.7}>
                {d.key}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
