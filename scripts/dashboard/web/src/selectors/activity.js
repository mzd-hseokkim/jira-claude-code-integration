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
 * Claude Code Notification 훅 발화는 system-notification 디바운스 때문에
 * 권한 프롬프트가 뜬 뒤 5~10초 늦게 들어온다. 그 사이 awaiting 표시가
 * 비어 보이는 문제를 줄이기 위해 in-flight PreToolUse 시간 기반 휴리스틱을
 * 병행한다.
 */
const AWAITING_INFLIGHT_THRESHOLD_MS = 3000;
const PERMISSION_PRONE_TOOLS = new Set([
  'Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit',
]);
function _isPermissionProne(name) {
  if (!name) return false;
  if (PERMISSION_PRONE_TOOLS.has(name)) return true;
  if (typeof name === 'string' && name.startsWith('mcp__')) return true;
  return false;
}

/**
 * Awaiting = busy 상태에서 아래 둘 중 하나:
 *   (a) 마지막 Notification이 input/permission/waiting을 의미하고
 *       **그 이후 다른 hook이 떨어지지 않은** 경우.
 *   (b) `nowMs`가 주어졌을 때, 권한 프롬프트 가능성이 있는 도구의
 *       PreToolUse가 매칭 PostToolUse 없이 `AWAITING_INFLIGHT_THRESHOLD_MS`
 *       이상 in-flight인 경우 (Notification 디바운스 우회 신호).
 * 사용자가 권한을 승인하거나 prompt를 보내거나 도구가 다시 실행되면 해제.
 *
 * @param {Array<{ts:string,type:string,data?:{payload?:Record<string,unknown>}}>} activity
 * @param {unknown} fallback
 * @param {number} [nowMs] 현재 시각(ms). 미지정 시 (b) 휴리스틱 비활성.
 * @returns {boolean}
 */
export function pickIsAwaitingUser(activity, fallback, nowMs) {
  if (!pickIsBusy(activity, fallback)) return false;
  if (!Array.isArray(activity)) return false;

  // (a) Notification 기반 — 정확하지만 5~10s 지연.
  let lastNotifIdx = -1;
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i]?.type === 'Notification') { lastNotifIdx = i; break; }
  }
  if (lastNotifIdx !== -1) {
    let dirty = false;
    for (let i = lastNotifIdx + 1; i < activity.length; i++) {
      if (activity[i]?.type) { dirty = true; break; }
    }
    if (!dirty) {
      const msg = String(activity[lastNotifIdx].data?.payload?.message ?? '').toLowerCase();
      if (msg.includes('permission') || msg.includes('input') || msg.includes('waiting')) {
        return true;
      }
    }
  }

  // (b) in-flight PreToolUse 휴리스틱 — Notification보다 빠른 조기 신호.
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return false;
  const closed = new Set();
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    const t = ev?.type;
    if (t === 'UserPromptSubmit' || t === 'Stop' || t === 'SessionEnd') break;
    if (t === 'PostToolUse') {
      const n = ev.data?.payload?.tool_name;
      if (n) closed.add(n);
      continue;
    }
    if (t !== 'PreToolUse') continue;
    const name = ev.data?.payload?.tool_name;
    if (!name || closed.has(name)) continue;
    if (!_isPermissionProne(name)) continue;
    const startedMs = Date.parse(ev.ts);
    if (!Number.isFinite(startedMs)) continue;
    if (nowMs - startedMs >= AWAITING_INFLIGHT_THRESHOLD_MS) return true;
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
