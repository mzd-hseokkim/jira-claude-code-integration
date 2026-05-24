import React from 'react';

/**
 * 주별 throughput(완료/주) 차트 (꺾은선 + 면적).
 *
 * @param {{ throughput: Array<{week:string, completed:number}> }} props
 */
export default function ThroughputChart({ throughput }) {
  if (!throughput || throughput.length === 0) {
    return <div className="chart-empty">throughput 데이터 없음</div>;
  }

  const W = 300;
  const H = 130;
  const PAD = { l: 10, r: 10, t: 18, b: 22 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const max = Math.max(...throughput.map((d) => d.completed), 1);
  const n = throughput.length;

  const xAt = (i) => (n <= 1 ? PAD.l + innerW / 2 : PAD.l + (i / (n - 1)) * innerW);
  const yAt = (v) => PAD.t + innerH - (v / max) * innerH;

  const pts = throughput.map((d, i) => [xAt(i), yAt(d.completed)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const baseY = PAD.t + innerH;
  const area = `${line} L ${pts[n - 1][0].toFixed(1)} ${baseY} L ${pts[0][0].toFixed(1)} ${baseY} Z`;

  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="주별 throughput 차트" preserveAspectRatio="xMidYMid meet">
      <path d={area} className="line-chart__area" />
      <path d={line} className="line-chart__line" fill="none" />
      {pts.map((p, i) => {
        const d = throughput[i];
        const weekLabel = d.week.includes('-') ? d.week.split('-')[1] : d.week;
        return (
          <g key={d.week}>
            <circle cx={p[0]} cy={p[1]} r={3} className="line-chart__dot" />
            {d.completed > 0 && (
              <text x={p[0]} y={p[1] - 7} textAnchor="middle" className="chart-count" fontSize={10}>{d.completed}</text>
            )}
            <text x={p[0]} y={H - 6} textAnchor="middle" className="chart-label" fontSize={9} opacity={0.7}>W{weekLabel}</text>
          </g>
        );
      })}
    </svg>
  );
}
