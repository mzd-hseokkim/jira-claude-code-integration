# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Jira Integration Plugin

This project is a Claude Code plugin that integrates Jira with the software development workflow.

### Dependencies

- **bkit (Vibecoding Kit)**: PDCA 사이클 전반을 위임.
  - `plan` → bkit `/pdca plan`
  - `design` → bkit `/pdca design`
  - `impl` → bkit `/pdca do`
  - `review` → bkit gap-detector + code-analyzer
  - `done` → bkit `/pdca report`
  - bkit이 설치되어 있어야 위 커맨드들이 정상 동작

### MCP Server: jira (tom28881/mcp-jira-server)

The `jira` MCP server provides Jira tools. Available tools:

**Issue Management:**
- `create-issue` - Create new Jira issue
- `update-issue` - Update issue fields
- `get-issue` - Retrieve issue details by key
- `search-issues` - Search with JQL or filters
- `transition-issue` - Change issue status (by transition name)
- `link-issues` - Link two issues
- `get-link-types` - List available link types
- `get-fields` - List available fields
- `diagnose-fields` - Troubleshoot field configuration
- `create-epic-with-subtasks` - Create epic with sub-tasks
- `create-task-for-epic` - Add task to an epic

**Comments & History:**
- `get-comments` - Read issue comments
- `add-comment` - Post comment to issue
- `batch-comment` - Post comment to multiple issues
- `get-history` - View issue change history

**Attachments:**
- `get-attachments` - List attachments on issue
- `upload-attachment` - Upload file (base64) to issue

**Sprint & Agile:**
- `get-boards` - List Jira boards
- `get-sprints` - List sprints for a board
- `move-issue-to-sprint` - Move issue to sprint
- `create-sprint` - Create new sprint

**Resources:** `jira://projects`, `jira://project/{key}`, `jira://issue/{key}`, `jira://myself`, `jira://search?jql={query}`

**Prompts:** `standup-report`, `sprint-planning`, `bug-triage`, `release-notes`, `epic-status`

### Workflow Commands

- `/jira` - Help and connection status
- `/jira-task init [N]` - Fetch my top N assigned tasks, create worktrees for each
- `/jira-task start <ID>` - Start working on a task (fetch, branch, transition)
- `/jira-task plan <ID>` - Generate planning document
- `/jira-task design <ID>` - Generate design document
- `/jira-task impl <ID>` - Implement based on design document
- `/jira-task test <ID>` - Run tests (Playwright E2E, unit) and report to Jira
- `/jira-task review <ID>` - Code review with Jira reporting
- `/jira-task pr <ID>` - Create pull request and link to Jira
- `/jira-task done <ID>` - Complete task (PR, transition, report)
- `/jira-task report` - Sprint progress report

### Conventions

- When posting comments to Jira, use markdown format.
- Always fetch issue details before transitioning status.
- Use `transition-issue` with the transition **name** (e.g., "In Progress"), not ID.
- Store active task context in `.jira-context.json` (gitignored).
- Git branches follow pattern: `feature/<TASK-ID>`
- Worktrees are created in the parent directory: `../<project>_worktree/<TASK-ID>`

### Environment Variables

Required: `JIRA_HOST`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
Optional: `JIRA_DEFAULT_PROJECT`

Set in `.mcp.json` (project-level) or `~/.claude/settings.local.json` (global).
