import React from 'react';

const STEP_LABELS = {
  start: 'Start',
  approach: 'Approach',
  impl: 'Impl',
  test: 'Test',
  review: 'Review',
  pr: 'PR',
  done: 'Done',
};

/**
 * SDLC 퍼널 차트 (경량 SVG horizontal bar).
 *
 * @param {{ funnel: Array<{step:string, count:number}> }} props
 */
export default function FunnelChart({ funnel }) {
  if (!funnel || funnel.length === 0) {
    return <div className="chart-empty">퍼널 데이터 없음</div>;
  }

  const maxCount = Math.max(...funnel.map((d) => d.count), 1);
  const BAR_HEIGHT = 22;
  const BAR_GAP = 6;
  const LABEL_W = 80;
  const CHART_W = 220;
  const COUNT_W = 40;
  const SVG_W = LABEL_W + CHART_W + COUNT_W + 8;
  const SVG_H = funnel.length * (BAR_HEIGHT + BAR_GAP);

  return (
    <svg
      className="funnel-chart"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      role="img"
      aria-label="SDLC 퍼널 차트"
    >
      {funnel.map((d, i) => {
        const y = i * (BAR_HEIGHT + BAR_GAP);
        const barW = Math.max(d.count > 0 ? 4 : 0, Math.round((d.count / maxCount) * CHART_W));
        return (
          <g key={d.step} transform={`translate(0,${y})`}>
            <text
              x={LABEL_W - 8}
              y={BAR_HEIGHT / 2 + 4}
              textAnchor="end"
              className="chart-label"
              fontSize={11}
              fill="currentColor"
            >
              {STEP_LABELS[d.step] || d.step}
            </text>
            <rect
              x={LABEL_W}
              y={0}
              width={CHART_W}
              height={BAR_HEIGHT}
              rx={3}
              fill="var(--chart-bg, rgba(255,255,255,0.06))"
            />
            {barW > 0 && (
              <rect
                x={LABEL_W}
                y={0}
                width={barW}
                height={BAR_HEIGHT}
                rx={3}
                className="ax-bar-h"
                style={{ animationDelay: `${i * 50}ms` }}
                fill="var(--chart-wip, #60a5fa)"
                opacity={0.85}
              />
            )}
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
