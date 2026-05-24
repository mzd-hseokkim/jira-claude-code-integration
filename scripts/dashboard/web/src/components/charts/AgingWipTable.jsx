import React from 'react';

/**
 * Aging WIP 테이블 (In Progress 경과일 내림차순).
 *
 * @param {{
 *   agingWip: Array<{ issueKey: string, summary: string, assignee: string|null, created: string, ageDays: number }>,
 * }} props
 */
export default function AgingWipTable({ agingWip }) {
  if (!agingWip || agingWip.length === 0) {
    return <div className="chart-empty">Aging WIP 없음</div>;
  }

  function ageBadgeClass(days) {
    if (days >= 30) return 'aging-wip-table__age--critical';
    if (days >= 14) return 'aging-wip-table__age--warn';
    return 'aging-wip-table__age--ok';
  }

  return (
    <table className="aging-wip-table" aria-label="Aging WIP">
      <thead>
        <tr>
          <th className="aging-wip-table__th">이슈</th>
          <th className="aging-wip-table__th">제목</th>
          <th className="aging-wip-table__th">담당자</th>
          <th className="aging-wip-table__th aging-wip-table__th--num">경과일</th>
        </tr>
      </thead>
      <tbody>
        {agingWip.map((row, i) => (
          <tr key={row.issueKey} className="aging-wip-table__row" style={{ animationDelay: `${i * 40}ms` }}>
            <td className="aging-wip-table__td aging-wip-table__td--key">{row.issueKey}</td>
            <td className="aging-wip-table__td aging-wip-table__td--summary" title={row.summary}>
              {row.summary || '—'}
            </td>
            <td className="aging-wip-table__td">
              {row.assignee
                ? row.assignee
                : <span className="aging-wip-table__unassigned">무할당</span>}
            </td>
            <td className={`aging-wip-table__td aging-wip-table__td--num ${ageBadgeClass(row.ageDays)}`}>
              {row.ageDays}d
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
