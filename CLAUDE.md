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

### PDCA Documents

`/jira-task` 워크플로에서 생성하는 문서:
- Plan: `docs/plan/<TASK-ID>.plan.md`
- Design: `docs/design/<TASK-ID>.design.md`
- Test Report: `docs/test/<TASK-ID>.test-report.md`

### MCP Server: jira (mcp-jira-cloud)

The `jira` MCP server provides Jira Cloud tools (79개). 전체 도구 레퍼런스: `docs/mcp-jira-cloud-tools.md`

스킬에서 주로 사용하는 도구:

**Issue Management:**

- `jira_get_issue` - 이슈 상세 조회
- `jira_search_issues` - JQL로 이슈 검색
- `jira_create_issue` - 새 이슈 생성
- `jira_update_issue` - 이슈 필드 수정
- `jira_transition_issue` - 상태 전환 (transitionId 사용, `jira_get_transitions`로 조회)
- `jira_assign_issue` - 담당자 할당

**Comments & Attachments:**

- `jira_add_comment` - 이슈에 코멘트 추가
- `jira_get_issue_comments` - 이슈 코멘트 조회
- `jira_upload_attachment` - 파일 첨부 업로드 (filePath 사용)
- `jira_get_attachments` - 첨부파일 목록 조회

**Sprint & Agile:**

- `jira_get_boards` - 보드 목록 조회
- `jira_get_sprints` - 스프린트 목록 조회
- `jira_move_issues_to_sprint` - 이슈를 스프린트로 이동
- `jira_get_sprint_issues` - 스프린트 이슈 조회

**Authentication:**

- `jira_auth_status` - 인증 상태 확인
- `jira_whoami` - 현재 사용자 정보

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
- Use `jira_get_transitions`로 전환 목록 조회 후 `jira_transition_issue`에 **transitionId**를 전달.
- Store active task context in `.jira-context.json` (gitignored).
- Git branches follow pattern: `feature/<TASK-ID>`
- Worktrees are created in the parent directory: `../<project>_worktree/<TASK-ID>`

### Workflow Progress Tracking

각 `/jira-task` 스킬은 완료 시 `.jira-context.json`의 `completedSteps` 배열에 자신의 단계를 추가해야 한다:

```json
{
  "taskId": "PROJ-123",
  "completedSteps": ["init", "start", "plan"]
}
```

유효한 단계: `init`, `start`, `plan`, `design`, `impl`, `test`, `review`, `pr`, `done`

규칙:
- 스킬 완료 시 `.jira-context.json`을 읽고, `completedSteps`에 현재 단계를 추가 (중복 방지)
- Completion Summary 출력 시, `completedSteps`를 기반으로 Progress 라인의 `✓` 표시를 생성
- `done` 단계 완료 시 `status`를 `"Done"`으로 변경

### Environment Variables

Required: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`
Optional: `JIRA_DEFAULT_PROJECT`

Set in `.mcp.json` (project-level) or `~/.claude/settings.local.json` (global).
