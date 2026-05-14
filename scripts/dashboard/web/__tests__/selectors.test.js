import { describe, it, expect } from 'vitest';
import {
  pickLatestPrompt,
  pickLatestResponse,
  pickCurrentTool,
  pickActiveSubagent,
  pickBlockedFlag,
  pickIsAwaitingUser,
} from '../src/selectors/activity.js';

const ts = '2026-04-30T00:00:00.000Z';

// U7
describe('pickLatestPrompt', () => {
  it('UserPromptSubmit 1건: text와 ts 반환', () => {
    const activity = [
      { ts, type: 'UserPromptSubmit', data: { payload: { prompt: 'hello world' } } },
    ];
    const result = pickLatestPrompt(activity);
    expect(result).not.toBeNull();
    expect(result.text).toBe('hello world');
    expect(result.ts).toBe(ts);
  });

  it('user_prompt 필드도 처리', () => {
    const activity = [
      { ts, type: 'UserPromptSubmit', data: { payload: { user_prompt: 'hi there' } } },
    ];
    const result = pickLatestPrompt(activity);
    expect(result?.text).toBe('hi there');
  });

  it('80자 초과 시 truncate + ellipsis', () => {
    const long = 'a'.repeat(85);
    const activity = [
      { ts, type: 'UserPromptSubmit', data: { payload: { prompt: long } } },
    ];
    const result = pickLatestPrompt(activity);
    expect(result?.text.length).toBe(80);
    expect(result?.text.endsWith('…')).toBe(true);
  });

  // U8
  it('UserPromptSubmit 없음: null 반환', () => {
    const activity = [
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    expect(pickLatestPrompt(activity)).toBeNull();
  });

  it('빈 배열: null 반환', () => {
    expect(pickLatestPrompt([])).toBeNull();
  });
});

// U9, U10
describe('pickCurrentTool', () => {
  it('PreToolUse 후 PostToolUse 없음: 진행 중 tool 반환', () => {
    const activity = [
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    const result = pickCurrentTool(activity);
    expect(result).not.toBeNull();
    expect(result.name).toBe('Bash');
  });

  it('PreToolUse + PostToolUse 매칭: null 반환', () => {
    const activity = [
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Bash' } } },
      { ts, type: 'PostToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    expect(pickCurrentTool(activity)).toBeNull();
  });

  it('두 번째 PreToolUse만 진행 중인 경우', () => {
    const activity = [
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Read' } } },
      { ts, type: 'PostToolUse', data: { payload: { tool_name: 'Read' } } },
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    const result = pickCurrentTool(activity);
    expect(result?.name).toBe('Bash');
  });
});

// U11
describe('pickBlockedFlag', () => {
  it('Notification에 "permission" 포함: true', () => {
    const activity = [
      {
        ts,
        type: 'Notification',
        data: { payload: { message: 'permission required' } },
      },
    ];
    expect(pickBlockedFlag(activity)).toBe(true);
  });

  it('Notification에 "blocked" 포함: true', () => {
    const activity = [
      {
        ts,
        type: 'Notification',
        data: { payload: { message: 'action blocked by policy' } },
      },
    ];
    expect(pickBlockedFlag(activity)).toBe(true);
  });

  it('Notification 없음: false', () => {
    const activity = [
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    expect(pickBlockedFlag(activity)).toBe(false);
  });
});

describe('pickActiveSubagent', () => {
  it('SubagentStop이 마지막 stop 이벤트: true', () => {
    const activity = [
      { ts, type: 'SubagentStop', data: {} },
    ];
    expect(pickActiveSubagent(activity)).toBe(true);
  });

  it('Stop이 마지막 stop 이벤트: false', () => {
    const activity = [
      { ts, type: 'SubagentStop', data: {} },
      { ts, type: 'Stop', data: {} },
    ];
    expect(pickActiveSubagent(activity)).toBe(false);
  });

  it('stop 이벤트 없음: false', () => {
    const activity = [
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    expect(pickActiveSubagent(activity)).toBe(false);
  });

  it('SubagentStop 이후 SessionEnd: false (세션 종료가 sub-agent도 종결시킴)', () => {
    const activity = [
      { ts, type: 'SubagentStop', data: {} },
      { ts, type: 'SessionEnd', data: {} },
    ];
    expect(pickActiveSubagent(activity)).toBe(false);
  });
});

describe('pickLatestResponse', () => {
  const mkResp = (type, t, text) => ({
    ts: t,
    type,
    data: { payload: { lastAssistantText: text } },
  });

  it('Stop 이벤트의 lastAssistantText 반환', () => {
    const activity = [mkResp('Stop', ts, 'hello world')];
    const r = pickLatestResponse(activity);
    expect(r?.text).toBe('hello world');
    expect(r?.stale).toBeFalsy();
  });

  it('PostToolUse의 lastAssistantText도 채택 (턴 중간 응답)', () => {
    const activity = [
      mkResp('Stop', '2026-04-30T00:00:00.000Z', 'old turn'),
      { ts: '2026-04-30T00:00:01.000Z', type: 'UserPromptSubmit', data: { payload: { prompt: 'next' } } },
      mkResp('PostToolUse', '2026-04-30T00:00:02.000Z', 'mid-turn text'),
    ];
    const r = pickLatestResponse(activity);
    expect(r?.text).toBe('mid-turn text');
    expect(r?.stale).toBeFalsy();
  });

  it('마지막 응답 이후 UserPromptSubmit: stale=true', () => {
    const activity = [
      mkResp('Stop', '2026-04-30T00:00:00.000Z', 'previous reply'),
      { ts: '2026-04-30T00:00:05.000Z', type: 'UserPromptSubmit', data: { payload: { prompt: 'next q' } } },
    ];
    const r = pickLatestResponse(activity);
    expect(r?.text).toBe('previous reply');
    expect(r?.stale).toBe(true);
  });

  it('응답 이벤트 없음: null', () => {
    const activity = [
      { ts, type: 'PreToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    expect(pickLatestResponse(activity)).toBeNull();
  });

  it('lastAssistantText 없는 PostToolUse는 건너뛰고 더 과거 Stop 채택', () => {
    const activity = [
      mkResp('Stop', '2026-04-30T00:00:00.000Z', 'real reply'),
      { ts: '2026-04-30T00:00:01.000Z', type: 'PostToolUse', data: { payload: { tool_name: 'Bash' } } },
    ];
    const r = pickLatestResponse(activity);
    expect(r?.text).toBe('real reply');
  });
});

describe('pickIsAwaitingUser — PreToolUse 휴리스틱', () => {
  const promptTs = '2026-04-30T00:00:00.000Z';
  const promptMs = Date.parse(promptTs);

  function pre(toolName, offsetMs) {
    return {
      ts: new Date(promptMs + offsetMs).toISOString(),
      type: 'PreToolUse',
      data: { payload: { tool_name: toolName } },
    };
  }
  function post(toolName, offsetMs) {
    return {
      ts: new Date(promptMs + offsetMs).toISOString(),
      type: 'PostToolUse',
      data: { payload: { tool_name: toolName } },
    };
  }

  it('권한 가능 도구 PreToolUse가 3s 이상 매칭 없음 → true', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      pre('Edit', 100),
    ];
    expect(pickIsAwaitingUser(activity, null, promptMs + 3500)).toBe(true);
  });

  it('PreToolUse가 임계값 미만 → false', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      pre('Edit', 100),
    ];
    expect(pickIsAwaitingUser(activity, null, promptMs + 1000)).toBe(false);
  });

  it('PostToolUse가 매칭되면 in-flight 아님 → false', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      pre('Edit', 100),
      post('Edit', 200),
    ];
    expect(pickIsAwaitingUser(activity, null, promptMs + 10_000)).toBe(false);
  });

  it('Read 등 권한 비요구 도구는 무시 → false', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      pre('Read', 100),
    ];
    expect(pickIsAwaitingUser(activity, null, promptMs + 10_000)).toBe(false);
  });

  it('mcp__* 도구는 권한 가능 도구로 처리', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      pre('mcp__atlassian__jira_get_issue', 100),
    ];
    expect(pickIsAwaitingUser(activity, null, promptMs + 4000)).toBe(true);
  });

  it('Stop 이후 PreToolUse는 새 turn 시작 전 → 무시', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      pre('Edit', 100),
      { ts: new Date(promptMs + 200).toISOString(), type: 'Stop', data: {} },
    ];
    expect(pickIsAwaitingUser(activity, null, promptMs + 10_000)).toBe(false);
  });

  it('Notification(permission) 단독 — nowMs 없이도 true (기존 경로)', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      {
        ts: new Date(promptMs + 100).toISOString(),
        type: 'Notification',
        data: { payload: { message: 'Claude needs your permission to use Bash' } },
      },
    ];
    expect(pickIsAwaitingUser(activity, null)).toBe(true);
  });

  it('busy 아님 (Stop이 최종) → 무조건 false', () => {
    const activity = [
      { ts: promptTs, type: 'UserPromptSubmit', data: { payload: { prompt: 'go' } } },
      pre('Edit', 100),
      { ts: new Date(promptMs + 200).toISOString(), type: 'Stop', data: {} },
    ];
    expect(pickIsAwaitingUser(activity, null, promptMs + 10_000)).toBe(false);
  });
});
