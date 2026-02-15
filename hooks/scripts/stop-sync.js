#!/usr/bin/env node

/**
 * Stop Hook: Notify about active Jira task context on session end.
 *
 * Reads .jira-context.json and reminds the user/Claude about any
 * active task that should be synced to Jira.
 *
 * This hook does NOT make Jira API calls directly (hooks run outside MCP context).
 * Instead, it outputs a reminder that Claude can act on.
 */

const fs = require('fs');
const path = require('path');

function main() {
  // Read hook input from stdin
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch {
    // No stdin available
  }

  // Check for active task context
  const contextPath = path.join(process.cwd(), '.jira-context.json');
  if (!fs.existsSync(contextPath)) {
    // No active task, nothing to do
    process.exit(0);
    return;
  }

  try {
    const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));

    if (context.taskId && context.status !== 'Done') {
      // Output reminder as JSON
      const output = {
        additionalContext: `Reminder: Active Jira task ${context.taskId} (${context.summary || ''}) is still in progress on branch ${context.branch || 'unknown'}. Consider posting a progress update to Jira before ending the session.`
      };
      process.stdout.write(JSON.stringify(output));
    }
  } catch {
    // Ignore parse errors
  }
}

main();
