import React from 'react';

/**
 * 주별 throughput(완료/주) 차트 (경량 SVG bar chart).
 *
 * @param {{ throughput: Array<{week:string, completed:number}> }} props
 */
export default function ThroughputChart({ throughput }) {
  if (!throughput || throughput.length === 0) {
    return <div className="chart-empty">throughput 데이터 없음</div>;
  }

  const maxVal = Math.max(...throughput.map((d) => d.completed), 1);
  const BAR_W = 28;
  const BAR_GAP = 6;
  const CHART_H = 120;
  const LABEL_H = 22;
  const SVG_W = throughput.length * (BAR_W + BAR_GAP);
  const SVG_H = CHART_H + LABEL_H;

  return (
    <svg
      className="throughput-chart"
      width={SVG_W}
      height={SVG_H}
      role="img"
      aria-label="주별 throughput 차트"
      style={{ overflow: 'visible' }}
    >
      {throughput.map((d, i) => {
        const x = i * (BAR_W + BAR_GAP);
        const barH = Math.max(4, Math.round((d.completed / maxVal) * (CHART_H - 8)));
        const barY = CHART_H - barH;
        // 주 레이블: YYYY-WW → WW
        const weekLabel = d.week.includes('-') ? d.week.split('-')[1] : d.week;

        return (
          <g key={d.week} transform={`translate(${x},0)`}>
            {/* 배경 */}
            <rect
              x={0}
              y={0}
              width={BAR_W}
              height={CHART_H}
              rx={2}
              fill="var(--chart-bg, rgba(255,255,255,0.06))"
            />
            {/* 바 */}
            <rect
              x={0}
              y={barY}
              width={BAR_W}
              height={barH}
              rx={2}
              fill="var(--chart-throughput, #818cf8)"
              opacity={0.9}
            />
            {/* 완료 수 */}
            {d.completed > 0 && (
              <text
                x={BAR_W / 2}
                y={barY - 3}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
                className="chart-count"
              >
                {d.completed}
              </text>
            )}
            {/* 주 레이블 */}
            <text
              x={BAR_W / 2}
              y={CHART_H + 14}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              className="chart-label"
              opacity={0.7}
            >
              W{weekLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
