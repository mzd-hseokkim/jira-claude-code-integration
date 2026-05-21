import React from 'react';

/**
 * 사람별 처리량 테이블.
 *
 * @param {{
 *   perAssignee: Array<{ assignee: string, completed: number, wip: number }>,
 *   weeks: number,
 * }} props
 */
export default function PerAssigneeTable({ perAssignee, weeks = 8 }) {
  if (!perAssignee || perAssignee.length === 0) {
    return <div className="chart-empty">사람별 처리량 데이터 없음</div>;
  }

  return (
    <table className="per-assignee-table" aria-label="사람별 처리량">
      <thead>
        <tr>
          <th className="per-assignee-table__th">담당자</th>
          <th className="per-assignee-table__th per-assignee-table__th--num">완료 ({weeks}주)</th>
          <th className="per-assignee-table__th per-assignee-table__th--num">현재 WIP</th>
        </tr>
      </thead>
      <tbody>
        {perAssignee.map((row) => (
          <tr key={row.assignee} className="per-assignee-table__row">
            <td className="per-assignee-table__td">
              {row.assignee === '__unassigned__'
                ? <span className="per-assignee-table__unassigned">무할당</span>
                : row.assignee}
            </td>
            <td className="per-assignee-table__td per-assignee-table__td--num">{row.completed}</td>
            <td className="per-assignee-table__td per-assignee-table__td--num">{row.wip}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
