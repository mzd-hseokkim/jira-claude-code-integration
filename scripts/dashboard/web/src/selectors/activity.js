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
function _formatPrompt(ev) {
  if (!ev) return null;
  const raw =
    ev.data?.payload?.prompt ??
    ev.data?.payload?.user_prompt ??
    null;
  if (raw == null) return null;
  const normalized = String(raw).replace(/\n/g, ' ');
  const text = normalized.length > 80 ? normalized.slice(0, 79) + '…' : normalized;
  return { text, ts: ev.ts };
}

export function pickLatestPrompt(activity, fallbackEvent) {
  if (Array.isArray(activity)) {
    for (let i = activity.length - 1; i >= 0; i--) {
      const ev = activity[i];
      if (ev?.type !== 'UserPromptSubmit') continue;
      const r = _formatPrompt(ev);
      if (r) return r;
    }
  }
  // ring buffer evict로 사라진 경우 store의 별도 보존 필드 사용.
  return _formatPrompt(fallbackEvent);
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
  // Walk newest→oldest. Track PostToolUse closures.
  // 사용자 인터럽트(UserPromptSubmit) 또는 turn 종료(Stop/SessionEnd)가
  // PreToolUse보다 나중에 일어났다면 그 도구 호출은 취소된 것으로 간주.
  // (취소된 호출엔 PostToolUse 훅이 안 떨어져 영원히 in-flight로 보이는 문제 방지)
  const closedTools = new Set();
  let sawTerminator = false;
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    const t = ev?.type;
    if (t === 'PostToolUse') {
      const name = ev.data?.payload?.tool_name;
      if (name) closedTools.add(name);
    } else if (t === 'UserPromptSubmit' || t === 'Stop' || t === 'SessionEnd') {
      sawTerminator = true;
    } else if (t === 'PreToolUse') {
      const name = ev.data?.payload?.tool_name;
      if (name && !closedTools.has(name) && !sawTerminator) {
        return { name, startedAt: ev.ts };
      }
    }
  }
  return null;
}

/**
 * Returns true if there appears to be an active sub-agent session.
 * Heuristic: if the last terminator-type event is SubagentStop (not plain
 * Stop or SessionEnd), a sub-agent may still be running. SessionEnd counts
 * as a terminator because Claude Code may end a session without emitting a
 * top-level Stop hook after a SubagentStop.
 *
 * @param {Array<{ts:string,type:string,data?:unknown}>} activity
 * @returns {boolean}
 */
export function pickActiveSubagent(activity) {
  if (!Array.isArray(activity)) return false;
  for (let i = activity.length - 1; i >= 0; i--) {
    const type = activity[i]?.type;
    if (type === 'Stop' || type === 'SessionEnd') return false;
    if (type === 'SubagentStop') return true;
  }
  return false;
}

/**
 * Event types that may carry an assistant text preview in
 * `data.payload.lastAssistantText`. Stop is the canonical end-of-turn signal;
 * PostToolUse fires mid-turn so its preview shows intermediate text as the
 * assistant pauses between tool calls.
 */
const RESPONSE_EVENT_TYPES = new Set(['Stop', 'PostToolUse']);

/**
 * Returns the most recent event's lastAssistantText preview, truncated
 * to 120 characters with ellipsis if needed.
 *
 * @param {Array<{ts:string,type:string,data:{payload?:Record<string,unknown>}}>} activity
 * @returns {{ text: string, ts: string, stale?: boolean } | null}
 */
function _formatResponse(ev) {
  if (!ev) return null;
  const raw = ev.data?.payload?.lastAssistantText;
  if (raw == null || typeof raw !== 'string' || !raw.trim()) return null;

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

export function pickLatestResponse(activity, fallbackEvent) {
  if (Array.isArray(activity)) {
    // 마지막 응답 이벤트(Stop/PostToolUse 중 lastAssistantText 보유)를 뒤에서 탐색.
    // 동시에 그 이벤트보다 뒤에 UserPromptSubmit이 있는지(=새 턴 시작) 확인해
    // 응답을 stale로 마킹한다. 새 응답 이벤트가 들어오기 전까지 직전 응답이
    // 그대로 표시되어 "예전 응답이 보인다"는 문제를 보정.
    let sawNewerPrompt = false;
    for (let i = activity.length - 1; i >= 0; i--) {
      const ev = activity[i];
      const type = ev?.type;
      if (type === 'UserPromptSubmit') {
        sawNewerPrompt = true;
        continue;
      }
      if (!RESPONSE_EVENT_TYPES.has(type)) continue;
      const r = _formatResponse(ev);
      if (r) return sawNewerPrompt ? { ...r, stale: true } : r;
    }
  }
  return _formatResponse(fallbackEvent);
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
export function pickIsBusy(activity, fallback) {
  if (Array.isArray(activity)) {
    for (let i = activity.length - 1; i >= 0; i--) {
      const t = activity[i]?.type;
      if (t === 'Stop') return false;
      if (t === 'UserPromptSubmit') return true;
    }
  }
  // ring buffer eviction 보정 — fallback 별도 필드의 timestamp 비교.
  const promptTs = fallback?.lastPromptEvent?.ts;
  const stopTs = fallback?.lastStopEvent?.ts;
  if (!promptTs) return false;
  if (!stopTs) return true;
  return Date.parse(promptTs) > Date.parse(stopTs);
}

/**
 * Awaiting = busy 상태에서 마지막 Notification이 input/permission/waiting을
 * 의미하고, **그 이후 다른 hook이 떨어지지 않은** 경우.
 * 사용자가 권한을 승인하거나 prompt를 보내거나 도구가 다시 실행되면 해제.
 *
 * Notification 훅이 Claude Code가 "사용자 주의 필요"를 알리는 유일한 정확한
 * 신호다. PreToolUse 시간 기반 추정은 "실행 중 도구"와 "권한 대기"를 구분할
 * 수 없어 (둘 다 PreToolUse + PostToolUse 부재) 도입하지 않는다.
 *
 * @param {Array<{ts:string,type:string,data?:{payload?:Record<string,unknown>}}>} activity
 * @returns {boolean}
 */
export function pickIsAwaitingUser(activity, fallback) {
  if (!pickIsBusy(activity, fallback)) return false;
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
