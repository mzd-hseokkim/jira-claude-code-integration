#!/usr/bin/env node

/**
 * SessionStart Hook: Load Jira task context at session start.
 *
 * Reads .jira-context.json to provide Claude with awareness of the
 * current development context. Also detects worktree-based tasks.
 *
 * Note: MCP server env vars (JIRA_HOST, etc.) are not available in
 * hook scripts. Connection status should be checked via /jira command.
 *
 * Output: JSON with additionalContext for Claude.
 */

const fs = require('fs');
const path = require('path');

function main() {
  const lines = [];

  lines.push('Jira integration plugin active. Use /jira to check connection status.');
  lines.push('Available commands: /jira (status), /jira-task [init|start|plan|design|impl|test|review|pr|done|report|status] <TASK-ID>');

  // Check for active task context
  const contextPath = path.join(process.cwd(), '.jira-context.json');
  if (fs.existsSync(contextPath)) {
    try {
      const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
      if (context.taskId && context.status !== 'Done') {
        lines.push('');
        lines.push(`Active task: ${context.taskId} - ${context.summary || 'No summary'}`);
        lines.push(`Branch: ${context.branch || 'unknown'}`);
        lines.push(`Started: ${context.startedAt || 'unknown'}`);
        lines.push(`Status: ${context.status || 'In Progress'}`);

        // Show workflow progress
        const steps = ['init', 'start', 'plan', 'design', 'impl', 'test', 'review', 'pr', 'done'];
        const completed = context.completedSteps || [];
        const progress = steps.map(s => completed.includes(s) ? `${s} ✓` : s).join(' → ');
        lines.push(`Progress: ${progress}`);
      }
    } catch {
      // Ignore parse errors
    }
  } else {
    // Fallback: detect task from directory name and TASK-README.md
    const dirName = path.basename(process.cwd());
    const taskIdMatch = dirName.match(/^[A-Z]+-\d+$/);
    const readmePath = path.join(process.cwd(), 'TASK-README.md');

    if (taskIdMatch && fs.existsSync(readmePath)) {
      lines.push('');
      lines.push(`Detected task from worktree: ${dirName}`);
      lines.push(`Task README: TASK-README.md (read for details)`);
      lines.push(`Run \`/jira-task start ${dirName}\` to begin work`);
    }
  }

  // Output as JSON for Claude Code to consume
  const output = {
    additionalContext: lines.join('\n')
  };

  process.stdout.write(JSON.stringify(output));
}

main();
