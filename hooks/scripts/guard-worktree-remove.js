#!/usr/bin/env node

/**
 * PreToolUse Hook: block ad-hoc `git worktree remove` in Bash / PowerShell.
 *
 * Why: on Windows `git worktree remove` follows directory junctions and dir
 * symlinks while deleting the worktree (verified 2026-08-26, git 2.53). A
 * worktree whose `node_modules` is a junction to the main repo wipes the main
 * repo's node_modules and — via npm workspace links — its packages/** source.
 * `scripts/clean-worktree.py` unlinks every link before calling git; the LLM
 * running the command by hand does not. So the raw command is denied and the
 * model is pointed at the script (which itself runs git via subprocess, which
 * this hook does not see).
 *
 * Input (stdin): {"tool_name": "Bash"|"PowerShell", "tool_input": {"command": "..."}}
 * Output: PreToolUse deny decision, or nothing (allow).
 */

const fs = require('fs');

const PATTERN = /\bgit\b[^\n;&|]*\bworktree\s+remove\b/i;

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return; // no stdin → allow
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  const tool = input.tool_name || '';
  if (tool !== 'Bash' && tool !== 'PowerShell') return;
  const command = (input.tool_input && input.tool_input.command) || '';
  if (!PATTERN.test(command)) return;

  const reason =
    '`git worktree remove`는 직접 실행 금지 — Windows에서 junction/symlink를 따라 들어가 ' +
    '메인 레포의 node_modules·packages/**를 지운다. 대신 플러그인 스크립트를 쓴다: ' +
    'python3 "<plugin>/scripts/clean-worktree.py" <TASK-ID>  ' +
    '(링크를 먼저 끊고 검증한 뒤에만 git을 호출; /jira-task clean <TASK-ID> 와 동일).';

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

main();
