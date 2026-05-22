import React from 'react';

/**
 * 에이전트 처리량 테이블 (이슈 단위, 최근 활동 기준 근사).
 *
 * @param {{ agentThroughput: Array<{taskId:string, toolCallCount:number, completedSteps:string[]}> }} props
 */
export default function AgentThroughputTable({ agentThroughput }) {
  if (!agentThroughput || agentThroughput.length === 0) {
    return <div className="chart-empty">에이전트 활동 데이터 없음 (로컬 worktree 기준 근사)</div>;
  }

  return (
    <table className="analytics-table" aria-label="에이전트 처리량 (이슈 단위)">
      <thead>
        <tr>
          <th className="analytics-table__th">Task</th>
          <th className="analytics-table__th analytics-table__th--num">Tool 호출 수</th>
          <th className="analytics-table__th">완료 단계</th>
        </tr>
      </thead>
      <tbody>
        {agentThroughput.map((row) => (
          <tr key={row.taskId} className="analytics-table__row">
            <td className="analytics-table__td analytics-table__td--label">{row.taskId}</td>
            <td className="analytics-table__td analytics-table__td--num">{row.toolCallCount}</td>
            <td className="analytics-table__td">
              {row.completedSteps.length > 0 ? row.completedSteps.join(' → ') : '—'}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="analytics-table__td analytics-table__note" colSpan={3}>
            * 최근 활동 기준 근사값 (세션/재기동 시 초기화)
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
