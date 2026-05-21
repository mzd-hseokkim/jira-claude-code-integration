import React from 'react';

/**
 * Status 분포 차트 (경량 SVG bar chart).
 *
 * @param {{ distribution: Array<{status:string, statusCategory:string, count:number}> }} props
 */
export default function StatusChart({ distribution }) {
  if (!distribution || distribution.length === 0) {
    return <div className="chart-empty">status 데이터 없음</div>;
  }

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  const BAR_HEIGHT = 22;
  const BAR_GAP = 6;
  const LABEL_W = 110;
  const CHART_W = 240;
  const COUNT_W = 40;
  const SVG_W = LABEL_W + CHART_W + COUNT_W + 8;
  const SVG_H = distribution.length * (BAR_HEIGHT + BAR_GAP);

  function colorForCategory(cat) {
    if (cat === 'done') return 'var(--chart-done, #4ade80)';
    if (cat === 'indeterminate') return 'var(--chart-wip, #60a5fa)';
    return 'var(--chart-todo, #94a3b8)';
  }

  return (
    <svg
      className="status-chart"
      width={SVG_W}
      height={SVG_H}
      role="img"
      aria-label="Status 분포 차트"
    >
      {distribution.map((d, i) => {
        const y = i * (BAR_HEIGHT + BAR_GAP);
        const barW = Math.max(4, Math.round((d.count / maxCount) * CHART_W));
        return (
          <g key={d.status} transform={`translate(0,${y})`}>
            {/* 레이블 */}
            <text
              x={LABEL_W - 8}
              y={BAR_HEIGHT / 2 + 4}
              textAnchor="end"
              className="chart-label"
              fontSize={11}
              fill="currentColor"
            >
              {d.status || '(없음)'}
            </text>
            {/* 배경 */}
            <rect
              x={LABEL_W}
              y={0}
              width={CHART_W}
              height={BAR_HEIGHT}
              rx={3}
              className="chart-bg"
              fill="var(--chart-bg, rgba(255,255,255,0.06))"
            />
            {/* 바 */}
            <rect
              x={LABEL_W}
              y={0}
              width={barW}
              height={BAR_HEIGHT}
              rx={3}
              fill={colorForCategory(d.statusCategory)}
              opacity={0.85}
            />
            {/* 카운트 */}
            <text
              x={LABEL_W + CHART_W + 6}
              y={BAR_HEIGHT / 2 + 4}
              className="chart-count"
              fontSize={11}
              fill="currentColor"
            >
              {d.count}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
