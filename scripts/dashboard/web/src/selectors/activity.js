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
 * Returns the most recent Stop event's lastAssistantText preview, truncated
 * to 120 characters with ellipsis if needed.
 *
 * @param {Array<{ts:string,type:string,data:{payload?:Record<string,unknown>}}>} activity
 * @returns {{ text: string, ts: string } | null}
 */
export function pickLatestResponse(activity) {
  if (!Array.isArray(activity)) return null;
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    if (ev?.type !== 'Stop') continue;
    const raw = ev.data?.payload?.lastAssistantText;
    if (raw == null || typeof raw !== 'string' || !raw.trim()) continue;

    // 의미 있는 "마지막 줄" 추출. 빈 줄/코드펜스/구분선(HR + 박스 그리기 문자) 제외.
    const SEPARATOR_RE = /^[\s\-=*_~─━═─-╿]+$/;
    const rows = raw.split('\n').map(s => s.trim());
    let lastLine = '';
    for (let j = rows.length - 1; j >= 0; j--) {
      const r = rows[j];
      if (!r) continue;
      if (/^`{3,}/.test(r)) continue;
      if (SEPARATOR_RE.test(r)) continue;
      lastLine = r;
      break;
    }
    if (!lastLine) lastLine = raw.trim();

    const text = lastLine.length > 120 ? lastLine.slice(0, 119) + '…' : lastLine;
    return { text, ts: ev.ts };
  }
  return null;
}

/**
 * 마지막 Notification 이벤트가 'permission' 또는 'blocked'를 포함하고,
 * **그 이후에 다른 활동이 전혀 없을 때** true.
 * 사용자가 권한을 승인하거나 다른 도구가 실행되면(=후속 이벤트가 발생하면)
 * 차단 상태가 해제된 것으로 본다.
 *
 * @param {Array<{ts:string,type:string,data:{payload?:Record<string,unknown>}}>} activity
 * @returns {boolean}
 */
export function pickBlockedFlag(activity) {
  if (!Array.isArray(activity)) return false;
  let lastNotifIdx = -1;
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i]?.type === 'Notification') { lastNotifIdx = i; break; }
  }
  if (lastNotifIdx === -1) return false;
  // Notification 이후 어떤 hook이라도 떨어지면 차단 해제로 간주.
  for (let i = lastNotifIdx + 1; i < activity.length; i++) {
    if (activity[i]?.type) return false;
  }
  const msg = String(activity[lastNotifIdx].data?.payload?.message ?? '').toLowerCase();
  return msg.includes('permission') || msg.includes('blocked');
}

/**
 * Busy = 가장 최근 UserPromptSubmit 이후 매칭되는 Stop이 아직 안 옴.
 * 시간 임계값 없음. Claude가 응답을 만들고 있는 상태를 정확히 식별.
 *
 * @param {Array<{ts:string,type:string}>} activity
 * @returns {boolean}
 */
export function pickIsBusy(activity) {
  if (!Array.isArray(activity)) return false;
  for (let i = activity.length - 1; i >= 0; i--) {
    const t = activity[i]?.type;
    if (t === 'Stop') return false;
    if (t === 'UserPromptSubmit') return true;
  }
  return false;
}

/**
 * Awaiting = busy 상태에서 마지막 Notification이 input/permission/waiting을
 * 의미하고, **그 이후 다른 hook이 떨어지지 않은** 경우.
 * 사용자가 권한을 승인하거나 prompt를 보내거나 도구가 다시 실행되면 해제.
 *
 * @param {Array<{ts:string,type:string,data?:{payload?:Record<string,unknown>}}>} activity
 * @returns {boolean}
 */
export function pickIsAwaitingUser(activity) {
  if (!pickIsBusy(activity)) return false;
  if (!Array.isArray(activity)) return false;
  let lastNotifIdx = -1;
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i]?.type === 'Notification') { lastNotifIdx = i; break; }
  }
  if (lastNotifIdx === -1) return false;
  for (let i = lastNotifIdx + 1; i < activity.length; i++) {
    if (activity[i]?.type) return false;
  }
  const msg = String(activity[lastNotifIdx].data?.payload?.message ?? '').toLowerCase();
  return msg.includes('permission') || msg.includes('input') || msg.includes('waiting');
}

/**
 * 가장 최근 활동(어떤 hook이든)의 timestamp.
 *
 * @param {Array<{ts:string}>} activity
 * @returns {string|null}
 */
export function pickLastActivityTs(activity) {
  if (!Array.isArray(activity) || activity.length === 0) return null;
  return activity[activity.length - 1]?.ts ?? null;
}

/**
 * 누적 PreToolUse 카운트 (현재 ring buffer 안에서).
 *
 * @param {Array<{type:string}>} activity
 * @returns {number}
 */
export function pickToolCallCount(activity) {
  if (!Array.isArray(activity)) return 0;
  let n = 0;
  for (const ev of activity) if (ev?.type === 'PreToolUse') n++;
  return n;
}
