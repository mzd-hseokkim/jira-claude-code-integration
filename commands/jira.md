---
name: jira
description: Show Jira integration status, available tools, and help for jira-task commands. Use when user types /jira, asks about Jira connection, or wants to see available Jira commands.
user-invocable: true
allowed-tools:
  - Read
  - Bash
  - mcp__atlassian
---

# /jira - Jira Integration Help & Status

Show the user the following information:

## 1. Connection Status

Check if Atlassian MCP server is available by calling `mcp__atlassian__jira_search`
with JQL `project is not EMPTY ORDER BY updated DESC` and limit 1.

- If the call succeeds (no exception): report "Connected"
- If the call throws an error: report "Not connected" and guide setup

Do NOT use `echo $JIRA_URL` to check credentials — these are scoped to the MCP server
process and not visible as shell environment variables.

If connection fails, guide the user to set up environment variables:
```
JIRA_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=your-api-token
```

## 2. Available Commands

Display the available workflow commands:

| Command | Description |
|---------|-------------|
| `/jira-task init [N]` | Fetch my top N assigned tasks and create worktrees for each |
| `/jira-task start <TASK-ID>` | Start working on a task (fetch context, create branch, transition to In Progress) |
| `/jira-task plan <TASK-ID>` | Generate a planning document from Jira issue |
| `/jira-task design <TASK-ID>` | Generate a design document |
| `/jira-task impl <TASK-ID>` | Implement based on design document |
| `/jira-task test <TASK-ID>` | Run tests (Playwright E2E, unit) and report to Jira |
| `/jira-task review <TASK-ID>` | Run code review and post results to Jira |
| `/jira-task pr <TASK-ID>` | Create pull request and link to Jira |
| `/jira-task done <TASK-ID>` | Complete task (PR, transition status, post summary) |
| `/jira-task report` | 내 할당 이슈 현황 리포트 |

## 3. Available MCP Tools

Briefly list the Atlassian MCP tool categories:
- **Issues**: get, search (JQL), create, update, delete, transition, batch-create
- **Comments**: add
- **Attachments**: download
- **Sprints & Boards**: get-agile-boards, get-sprints-from-board, get-sprint-issues, create-sprint, update-sprint
- **Development Info**: get-issue-development-info (linked PRs, branches, commits)
- **Projects & Users**: get-all-projects, get-project-issues, get-user-profile
- **Issue Links**: create-issue-link, link-to-epic
