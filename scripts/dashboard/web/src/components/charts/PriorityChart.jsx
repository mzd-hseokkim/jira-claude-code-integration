import React from 'react';

/**
 * Priority 분포 차트 (경량 SVG horizontal bar).
 *
 * @param {{ distribution: Array<{priority:string, count:number}> }} props
 */
export default function PriorityChart({ distribution }) {
  if (!distribution || distribution.length === 0) {
    return <div className="chart-empty">priority 데이터 없음</div>;
  }

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  const BAR_HEIGHT = 22;
  const BAR_GAP = 6;
  const LABEL_W = 100;
  const CHART_W = 220;
  const COUNT_W = 40;
  const SVG_W = LABEL_W + CHART_W + COUNT_W + 8;
  const SVG_H = distribution.length * (BAR_HEIGHT + BAR_GAP);

  function colorForPriority(p) {
    const lower = (p || '').toLowerCase();
    if (lower === 'highest' || lower === '최고' || lower === 'critical') return 'var(--chart-critical, #f87171)';
    if (lower === 'high' || lower === '높음') return 'var(--chart-high, #fb923c)';
    if (lower === 'medium' || lower === '보통' || lower === '주요') return 'var(--chart-medium, #facc15)';
    if (lower === 'low' || lower === '낮음') return 'var(--chart-low, #4ade80)';
    if (lower === 'lowest' || lower === '최저') return 'var(--chart-lowest, #94a3b8)';
    return 'var(--chart-todo, #94a3b8)';
  }

  return (
    <svg
      className="priority-chart"
      width={SVG_W}
      height={SVG_H}
      role="img"
      aria-label="Priority 분포 차트"
    >
      {distribution.map((d, i) => {
        const y = i * (BAR_HEIGHT + BAR_GAP);
        const barW = Math.max(4, Math.round((d.count / maxCount) * CHART_W));
        return (
          <g key={d.priority} transform={`translate(0,${y})`}>
            <text
              x={LABEL_W - 8}
              y={BAR_HEIGHT / 2 + 4}
              textAnchor="end"
              className="chart-label"
              fontSize={11}
              fill="currentColor"
            >
              {d.priority}
            </text>
            <rect
              x={LABEL_W}
              y={0}
              width={CHART_W}
              height={BAR_HEIGHT}
              rx={3}
              fill="var(--chart-bg, rgba(255,255,255,0.06))"
            />
            <rect
              x={LABEL_W}
              y={0}
              width={barW}
              height={BAR_HEIGHT}
              rx={3}
              fill={colorForPriority(d.priority)}
              opacity={0.85}
            />
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
