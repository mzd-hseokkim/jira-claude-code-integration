import React from 'react';
import {
  pickLatestPrompt,
  pickLatestResponse,
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
  const latestResponse = pickLatestResponse(activity);
  const currentTool = pickCurrentTool(activity);
  const hasSubagent = pickActiveSubagent(activity);
  const isBlocked = pickBlockedFlag(activity);

  const toolName = currentTool?.name ?? EMPTY;
  const promptText = latestPrompt?.text ?? EMPTY;
  const responseText = latestResponse?.text ?? EMPTY;
  const subagentValue = hasSubagent ? 'active' : EMPTY;
  const blockedValue = isBlocked ? '⚠ blocked' : EMPTY;

  return (
    <div className="activity-panel">
      <div className="activity-panel__title">Activity</div>
      <dl className="activity-panel__rows">
        <div className="activity-panel__row">
          <dt>Last prompt</dt>
          <dd
            key={promptText}
            className="activity-panel__prompt"
            title={promptText}
          >
            {promptText}
          </dd>
        </div>
        <div className="activity-panel__row">
          <dt>Last response</dt>
          <dd
            key={responseText}
            className="activity-panel__prompt"
            title={latestResponse?.text ?? ''}
          >
            {responseText}
          </dd>
        </div>
        <div className="activity-panel__row">
          <dt>Current tool</dt>
          <dd key={toolName}>
            {currentTool?.name != null && (
              <span className="activity-panel__spinner" aria-hidden="true" />
            )}
            {toolName}
          </dd>
        </div>
        <div className="activity-panel__row">
          <dt>Sub-agent</dt>
          <dd key={subagentValue}>
            {hasSubagent
              ? <span className="activity-panel__subagent--active">{subagentValue}</span>
              : subagentValue}
          </dd>
        </div>
        <div className="activity-panel__row">
          <dt>Blocked</dt>
          <dd
            key={blockedValue}
            className={isBlocked ? 'activity-panel__value--blocked' : undefined}
          >
            {blockedValue}
          </dd>
        </div>
      </dl>
    </div>
  );
}
