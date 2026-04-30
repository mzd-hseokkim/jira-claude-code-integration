import React from 'react';
import {
  pickLatestPrompt,
  pickCurrentTool,
  pickActiveSubagent,
  pickBlockedFlag,
} from '../selectors/activity.js';

const EMPTY = '—';

/**
 * 카드 하단의 Agent 활동 패널.
 * activity 배열에서 4개 파생 뷰를 표시.
 *
 * @param {{ activity: Array<{ts:string,type:string,data:unknown}> }} props
 */
export default function ActivityPanel({ activity = [] }) {
  const latestPrompt = pickLatestPrompt(activity);
  const currentTool = pickCurrentTool(activity);
  const hasSubagent = pickActiveSubagent(activity);
  const isBlocked = pickBlockedFlag(activity);

  return (
    <div className="activity-panel">
      <div className="activity-panel__title">Activity</div>
      <dl className="activity-panel__rows">
        <div className="activity-panel__row">
          <dt>Last prompt</dt>
          <dd
            className="activity-panel__prompt"
            title={latestPrompt?.text ?? EMPTY}
          >
            {latestPrompt?.text ?? EMPTY}
          </dd>
        </div>
        <div className="activity-panel__row">
          <dt>Current tool</dt>
          <dd>{currentTool?.name ?? EMPTY}</dd>
        </div>
        <div className="activity-panel__row">
          <dt>Sub-agent</dt>
          <dd>{hasSubagent ? 'active' : EMPTY}</dd>
        </div>
        <div className="activity-panel__row">
          <dt>Blocked</dt>
          <dd>{isBlocked ? '⚠ blocked' : EMPTY}</dd>
        </div>
      </dl>
    </div>
  );
}
