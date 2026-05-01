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

    // 의미 있는 "마지막 줄" 추출 (hook 측에서 이미 처리되어 있을 수 있지만,
    // 구버전 데이터 호환을 위해 selector에서도 한번 더 수행).
    const rows = raw.split('\n').map(s => s.trim());
    let lastLine = '';
    for (let j = rows.length - 1; j >= 0; j--) {
      const r = rows[j];
      if (!r) continue;
      if (/^`{3,}/.test(r)) continue;
      if (/^[-=*_]{3,}$/.test(r)) continue;
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
 * Awaiting = busy인 동시에 마지막 Notification이 input/permission 신호.
 * "Claude가 사용자 응답을 기다리는 중".
 *
 * @param {Array<{ts:string,type:string,data?:{payload?:Record<string,unknown>}}>} activity
 * @returns {boolean}
 */
export function pickIsAwaitingUser(activity) {
  if (!pickIsBusy(activity)) return false;
  // 가장 최근 Notification이 input/permission 키워드를 담고 있는가
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    const t = ev?.type;
    if (t === 'UserPromptSubmit') return false; // Notification보다 prompt가 더 최근이면 입력 받은 것
    if (t !== 'Notification') continue;
    const msg = String(ev.data?.payload?.message ?? '').toLowerCase();
    return msg.includes('permission') || msg.includes('input') || msg.includes('waiting');
  }
  return false;
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
