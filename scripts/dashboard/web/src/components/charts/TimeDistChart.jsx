import React from 'react';

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
        <div className="time-dist-chart__stats">
          {median !== null && <span className="time-dist-chart__stat">중앙값 <strong>{median}d</strong></span>}
          {p75 !== null && <span className="time-dist-chart__stat">P75 <strong>{p75}d</strong></span>}
          {p95 !== null && <span className="time-dist-chart__stat">P95 <strong>{p95}d</strong></span>}
          {note && <span className="time-dist-chart__note">({note})</span>}
        </div>
      )}
      <svg
        className="time-dist-chart__svg"
        width={SVG_W}
        height={SVG_H}
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
                <rect x={0} y={barY} width={BAR_W} height={barH} rx={2}
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
