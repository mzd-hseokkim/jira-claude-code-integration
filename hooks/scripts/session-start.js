#!/usr/bin/env node

/**
 * SessionStart Hook: Load Jira sprint context at session start.
 *
 * Checks for Jira environment variables and .jira-context.json to provide
 * Claude with awareness of the current development context.
 *
 * Output: JSON with systemPrompt additions for Claude.
 */

const fs = require('fs');
const path = require('path');

function main() {
  const lines = [];

  // Check Jira configuration
  const jiraHost = process.env.JIRA_HOST;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;

  if (!jiraHost || !jiraEmail || !jiraToken) {
    lines.push('Jira integration: Not configured. Set JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN to enable.');
  } else {
    lines.push(`Jira integration: Connected to ${jiraHost} as ${jiraEmail}`);
    lines.push('Available commands: /jira (status), /jira-task [start|plan|design|review|done|report] <TASK-ID>');
  }

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
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Output as JSON for Claude Code to consume
  const output = {
    hookSpecificOutput: {
      systemPrompt: lines.join('\n')
    }
  };

  process.stdout.write(JSON.stringify(output));
}

main();
