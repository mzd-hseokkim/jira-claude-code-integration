---
name: jira
description: |
  Show Jira integration status, available tools, and help for jira-task commands.
  Use when: user types /jira, asks about Jira connection, or wants to see available Jira commands.
user-invocable: true
allowed-tools:
  - Read
  - Bash
  - mcp__jira
---

# /jira - Jira Integration Help & Status

Show the user the following information:

## 1. Connection Status

Check if Jira MCP server is available by trying to use `mcp__jira__get-boards` or reading the `jira://myself` resource. Report:
- Whether the Jira MCP server is connected
- The connected Jira instance URL (from JIRA_HOST env var)
- The authenticated user (from `jira://myself` resource)

If connection fails, guide the user to set up environment variables:
```
JIRA_HOST=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@company.com
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

Briefly list the Jira MCP tool categories:
- **Issues**: create, get, update, search, transition, link
- **Comments**: get, add, batch
- **Attachments**: list, upload
- **Sprints**: boards, sprints, move, create
- **Prompts**: standup-report, sprint-planning, bug-triage, release-notes, epic-status
