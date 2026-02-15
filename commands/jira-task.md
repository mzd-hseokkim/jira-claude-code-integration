---
name: jira-task
description: |
  Main workflow command for Jira-integrated development.
  Routes to specialized skills based on the action argument.

  Usage: /jira-task [action] [TASK-ID]
  Actions: init, start, plan, design, impl, test, review, pr, done, report, status

  Triggers: jira-task, jira task, init tasks, setup tasks, start task, begin task,
  implement task, test task, review task, create PR, complete task, task report,
  현황 리포트, 작업 환경 세팅, 작업 시작, 구현 시작, 테스트 실행,
  코드 리뷰, PR 만들어, 작업 완료
user-invocable: true
argument-hint: "[init|start|plan|design|impl|test|review|pr|done|report] [TASK-ID]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - Skill
  - mcp__jira
---

# /jira-task - Jira Development Workflow

Parse the user's argument to determine the action and task ID, then execute the corresponding workflow.

## Argument Parsing

The argument format is: `[action] [TASK-ID]`

- **action**: One of `init`, `start`, `plan`, `design`, `impl`, `test`, `review`, `pr`, `done`, `report`, `status`
- **TASK-ID**: Jira issue key (e.g., `PROJ-123`). Optional — if omitted, auto-detect from context. Not required for `init`, `report`, `status`.

If no action is provided, show the help text (same as `/jira` command).

## TASK-ID Auto-Detection

When TASK-ID is not provided, detect it automatically in the following priority order:

1. **Git branch name**: Run `git branch --show-current`. If the branch matches `feature/<TASK-ID>`, extract the TASK-ID.
2. **Current directory name**: Check if the current directory name matches a Jira issue key pattern (`[A-Z]+-\d+`, e.g., `PROJ-123`).
3. **`.jira-context.json`**: Read the file and use the active task ID if present.

If auto-detection succeeds, proceed with the detected TASK-ID. If it fails and the action requires a TASK-ID, ask the user to provide it.

## Action Routing

### `init [count]`
Execute the `jira-task-init` skill workflow:
1. Fetch my assigned high-priority tasks from Jira (default: top 5)
   - JQL: `assignee = currentUser() AND status NOT IN (Done, Closed) ORDER BY priority DESC, created ASC`
   - If active sprint exists, scope to sprint
2. Display task list in a table and ask for confirmation
3. Detect base branch (develop → main → master)
4. Create git worktrees for each task in the **parent directory**:
   - Path: `../<project>_worktree/<TASK-ID>`
   - Branch: `feature/<TASK-ID>`
5. Generate `TASK-README.md` in each worktree with issue details and workflow guide
6. Post initialization comment to each Jira issue
7. Save all task contexts to `.jira-context.json`

### `start <TASK-ID>`
Execute the `jira-task-start` skill workflow:
1. Fetch issue details using `mcp__jira__get-issue` with the given TASK-ID
2. Display issue summary, description, status, priority, and assignee
3. Transition the issue to "In Progress" using `mcp__jira__transition-issue`
4. Detect the base branch (check for `develop`, then `main`, then `master`)
5. Create a git worktree or branch: `feature/<TASK-ID>` (skip if already exists from `init`)
   - Worktree path: `../<project-name>_worktree/<TASK-ID>` (parent directory)
   - If not in a git repo, create a regular branch instead
6. Generate a task context README.md in the worktree/branch with issue details
7. Post a comment to Jira: "Work started on branch `feature/<TASK-ID>`"
8. Save task context to `.jira-context.json`

### `plan <TASK-ID>`
Execute the `jira-task-plan` skill workflow:
1. Fetch issue details and related issues (linked issues, sub-tasks, epic)
2. Search for related issues using JQL
3. Prepare Jira context summary
4. Generate planning document using `templates/plan.template.md` structure
5. Save to `docs/plan/<TASK-ID>.plan.md`
6. Post a summary comment to Jira

### `design <TASK-ID>`
Execute the `jira-task-design` skill workflow:
1. Check if `docs/plan/<TASK-ID>.plan.md` exists (suggest running `plan` first if not)
2. Fetch issue details from Jira
3. Analyze relevant codebase files (use Glob/Grep to find related code)
4. Generate design document (Architecture, Sequence Diagram, Implementation Plan, Error Handling, Security, Test Plan)
5. Save to `docs/design/<TASK-ID>.design.md`
6. Post a design summary comment to Jira

### `impl <TASK-ID>`
Execute the `jira-task-impl` skill workflow:
1. Load context: `.jira-context.json`, design doc, plan doc
2. Fetch latest issue details from Jira
3. Implement based on design document's Implementation Plan (or Jira issue if no design doc)
4. Post implementation progress to Jira as a comment
5. Suggest next: `/jira-task test <TASK-ID>` or `/jira-task review <TASK-ID>`

### `test <TASK-ID>`
Execute the `jira-task-test` skill workflow:
1. Detect test environment (Playwright, Vitest, Jest, pytest, custom)
2. Run unit tests first, then E2E tests (Playwright)
3. If no tests exist for the feature, offer to generate Playwright tests based on:
   - Acceptance criteria from Jira issue
   - Test plan from design document
4. Parse test results (total, passed, failed, skipped, duration)
5. Generate test report at `docs/test/<TASK-ID>.test-report.md`
6. Post test summary to Jira as a comment
7. Upload failure screenshots (Playwright) to Jira as attachments
8. If failed: list failures and suggest fixes
9. If passed: suggest `/jira-task review <TASK-ID>`

### `review <TASK-ID>`
Execute the `jira-task-review` skill workflow:
1. Identify the feature branch (`feature/<TASK-ID>`) and base branch
2. Run `git diff` to identify changed files
3. Gap analysis: compare design document items against implementation using Glob/Grep
4. Code quality review: security, error handling, naming, complexity
5. Compile findings into a structured review report
6. Post the review as a Jira comment

### `pr <TASK-ID>`
Execute the `jira-task-pr` skill workflow:
1. Verify `gh` CLI is available and authenticated
2. Verify feature branch has commits and is pushed to remote
3. Fetch Jira issue details for PR title and description
4. Generate PR content:
   - Title: `<TASK-ID>: <summary>`
   - Body: issue description, changes summary, acceptance criteria, test plan
   - Link to Jira issue: `<JIRA_HOST>/browse/<TASK-ID>`
5. Create PR using `gh pr create`
6. Post PR link to Jira as a comment
7. Optionally transition issue to "In Review"

### `done <TASK-ID>`
Execute the `jira-task-done` skill workflow:
1. Verify the feature branch exists and has commits
2. Fetch current issue status from Jira
3. Summarize changes (commits, files, diff stats)
4. Create a pull request if not already created (invoke `pr` workflow)
5. Generate completion summary from plan/design docs and git diff/log
6. Post completion report to Jira as a comment
7. Transition issue to "In Review" or "Done"
8. Clean up `.jira-context.json`

### `report`
Execute the `jira-task-report` skill workflow:
1. Check if active sprint exists → sprint-scoped, otherwise project-scoped
2. Search my assigned issues with JQL
3. Categorize issues by status (To Do, In Progress, In Review, Done)
4. Read `templates/report.template.md` for report structure
5. Generate a status report with progress, issue breakdown, blockers
6. Save to `docs/reports/status-<date>.report.md`

### `status`
Quick status check:
1. Read `.jira-context.json` to see if there's an active task
2. If active, fetch current issue status from Jira using `mcp__jira__get-issue`
3. Display: current task, branch, status, time elapsed

## Error Handling

- If TASK-ID is not provided and auto-detection fails, ask the user to provide it
- If Jira MCP server is not connected, guide user to check `/jira` for setup
- If transition fails (e.g., invalid transition name), use `mcp__jira__get-issue` to show current status and available transitions
