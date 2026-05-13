#!/usr/bin/env node

// Register a workspace path to the jira-integration dashboard registry.
// Used by jira-task-init so that worktrees created under <repoRoot>_worktree/
// become visible in the dashboard immediately.
//
// Usage: node register-workspace.js <absolute-path>
// Idempotent — re-registering only refreshes lastSeenAt.

'use strict';

const path = require('node:path');
const workspaces = require(path.join(__dirname, 'dashboard', 'workspaces'));

const target = process.argv[2];
if (!target) {
  console.error('Usage: register-workspace.js <absolute-path>');
  process.exit(2);
}

try {
  workspaces.register(target);
  console.log(`registered: ${path.resolve(target)}`);
} catch (err) {
  console.error(`register failed: ${err.message}`);
  process.exit(1);
}
