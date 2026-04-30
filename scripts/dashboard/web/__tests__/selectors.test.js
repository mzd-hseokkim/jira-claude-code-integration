import { describe, it, expect } from 'vitest';
import {
  pickLatestPrompt,
  pickCurrentTool,
  pickActiveSubagent,
  pickBlockedFlag,
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
});
