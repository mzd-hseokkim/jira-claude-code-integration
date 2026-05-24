import React from 'react';
import { useCountUp } from '../../hooks/useCountUp.js';
import CountUp from '../CountUp.jsx';

/**
 * Status 분포 차트 (half-donut + 범례).
 *
 * @param {{ distribution: Array<{status:string, statusCategory:string, count:number}> }} props
 */
export default function StatusChart({ distribution }) {
  const total = (distribution || []).reduce((a, d) => a + d.count, 0) || 1;
  const animTotal = useCountUp(total);

  if (!distribution || distribution.length === 0) {
    return <div className="chart-empty">status 데이터 없음</div>;
  }

  function colorForCategory(cat) {
    if (cat === 'done') return 'var(--chart-done)';
    if (cat === 'indeterminate') return 'var(--chart-wip)';
    return 'var(--chart-todo)';
  }

  // half-donut: 왼쪽(180°)에서 오른쪽(360°)으로 도는 위쪽 반원
  const CX = 110;
  const CY = 110;
  const R_OUT = 100;
  const R_IN = 62;

  function polar(r, deg) {
    const a = (deg * Math.PI) / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }
  function segPath(a0, a1) {
    const [x0o, y0o] = polar(R_OUT, a0);
    const [x1o, y1o] = polar(R_OUT, a1);
    const [x1i, y1i] = polar(R_IN, a1);
    const [x0i, y0i] = polar(R_IN, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0o} ${y0o} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${x1o} ${y1o} `
      + `L ${x1i} ${y1i} A ${R_IN} ${R_IN} 0 ${large} 0 ${x0i} ${y0i} Z`;
  }

  let angle = 180;
  const segs = distribution.map((d) => {
    const sweep = (d.count / total) * 180;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    return { d, path: segPath(a0, Math.max(a0 + 0.0001, a1)) };
  });

  return (
    <div className="status-donut">
      <svg className="status-donut__svg" viewBox="0 0 220 124" role="img" aria-label="Status 분포">
        {/* 트랙 */}
        <path d={segPath(180, 360)} fill="var(--chart-bg)" />
        {segs.map(({ d, path }) => (
          <path key={d.status} d={path} fill={colorForCategory(d.statusCategory)} opacity={0.92} />
        ))}
        <text x={CX} y={CY - 6} textAnchor="middle" className="status-donut__total">{animTotal}</text>
        <text x={CX} y={CY + 9} textAnchor="middle" className="status-donut__totlabel">합계</text>
      </svg>
      <ul className="status-donut__legend">
        {distribution.map((d) => (
          <li key={d.status} className="status-donut__legend-item">
            <span className="status-donut__swatch" style={{ background: colorForCategory(d.statusCategory) }} />
            <span className="status-donut__name">{d.status || '(없음)'}</span>
            <span className="status-donut__count"><CountUp value={d.count} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
