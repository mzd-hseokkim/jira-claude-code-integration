/**
 * Pure selector functions for deriving display values from a worktree's
 * activity ring buffer.
 *
 * activity: ActivityEvent[]
 *   { ts: ISO8601, type: string, data: { payload, ... } }
 */

/**
 * Returns the most recent UserPromptSubmit event's prompt text, truncated to
 * 80 characters with ellipsis if needed.
 *
 * @param {Array<{ts:string,type:string,data:{payload?:Record<string,unknown>}}>} activity
 * @returns {{ text: string, ts: string } | null}
 */
export function pickLatestPrompt(activity) {
  if (!Array.isArray(activity)) return null;
  // Iterate from end to find latest
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    if (ev?.type !== 'UserPromptSubmit') continue;
    const raw =
      ev.data?.payload?.prompt ??
      ev.data?.payload?.user_prompt ??
      null;
    if (raw == null) continue;
    const normalized = String(raw).replace(/\n/g, ' ');
    const text = normalized.length > 80 ? normalized.slice(0, 79) + '…' : normalized;
    return { text, ts: ev.ts };
  }
  return null;
}

/**
 * Returns the most recent "in-progress" tool (PreToolUse without a matching
 * subsequent PostToolUse for the same tool_name).
 *
 * @param {Array<{ts:string,type:string,data:{payload?:Record<string,unknown>}}>} activity
 * @returns {{ name: string, startedAt: string } | null}
 */
export function pickCurrentTool(activity) {
  if (!Array.isArray(activity)) return null;
  // Walk from newest to oldest. Track whether a PostToolUse closed each tool.
  const closedTools = new Set();
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    if (ev?.type === 'PostToolUse') {
      const name = ev.data?.payload?.tool_name;
      if (name) closedTools.add(name);
    } else if (ev?.type === 'PreToolUse') {
      const name = ev.data?.payload?.tool_name;
      if (name && !closedTools.has(name)) {
        return { name, startedAt: ev.ts };
      }
    }
  }
  return null;
}

/**
 * Returns true if there appears to be an active sub-agent session.
 * Heuristic: if the last Stop-type event is SubagentStop (not plain Stop),
 * a sub-agent may still be running.
 *
 * @param {Array<{ts:string,type:string,data?:unknown}>} activity
 * @returns {boolean}
 */
export function pickActiveSubagent(activity) {
  if (!Array.isArray(activity)) return false;
  for (let i = activity.length - 1; i >= 0; i--) {
    const type = activity[i]?.type;
    if (type === 'Stop') return false;
    if (type === 'SubagentStop') return true;
  }
  return false;
}

/**
 * Returns true if the most recent Notification event's message contains
 * 'permission' or 'blocked'.
 *
 * @param {Array<{ts:string,type:string,data:{payload?:Record<string,unknown>}}>} activity
 * @returns {boolean}
 */
export function pickBlockedFlag(activity) {
  if (!Array.isArray(activity)) return false;
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    if (ev?.type !== 'Notification') continue;
    const msg = String(ev.data?.payload?.message ?? '').toLowerCase();
    return msg.includes('permission') || msg.includes('blocked');
  }
  return false;
}
