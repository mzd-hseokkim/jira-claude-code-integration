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

### MCP Server: atlassian (mcp-atlassian)~~~~

The `atlassian` MCP server provides Jira Cloud tools. 전체 도구 레퍼런스: `docs/mcp-atlassian-tools.md`

스킬에서 주로 사용하는 도구:

**Issue Management:**

- `jira_get_issue` - 이슈 상세 조회
- `jira_search` - JQL로 이슈 검색 (구 `jira_search_issues`)
- `jira_create_issue` - 새 이슈 생성
- `jira_update_issue` - 이슈 필드 수정 (담당자 변경 포함)
- `jira_transition_issue` - 상태 전환 (transitionId 사용, `jira_get_transitions`로 조회)
- `jira_get_transitions` - 가능한 상태 전환 목록 조회

**Comments & Attachments:**

- `jira_add_comment` - 이슈에 코멘트 추가
- `jira_download_attachments` - 첨부파일 다운로드
- 첨부파일 **업로드**는 Jira REST API 직접 호출로 처리:
  `POST $JIRA_URL/rest/api/3/issue/<KEY>/attachments` (Basic Auth + X-Atlassian-Token: no-check)
  자격증명 조회 순서: 환경변수 → `.mcp.json` (project) → `~/.claude.json` (global) → `.claude/settings.local.json` (legacy)

**Sprint & Agile:**

- `jira_get_agile_boards` - 보드 목록 조회 (구 `jira_get_boards`)
- `jira_get_sprints_from_board` - 보드의 스프린트 목록 조회 (boardId 필요, 구 `jira_get_sprints`)
- `jira_get_sprint_issues` - 스프린트 이슈 조회
- `jira_get_board_issues` - 보드 이슈 조회
- `jira_create_sprint` - 스프린트 생성
- `jira_update_sprint` - 스프린트 수정

**User & Project:**

- `jira_get_user_profile` - 현재 사용자 정보 및 인증 확인 (구 `jira_whoami`, `jira_auth_status`)
- `jira_get_all_projects` - 프로젝트 목록 조회
- `jira_get_project_issues` - 프로젝트 이슈 조회

**Issue Linking:**

- `jira_create_issue_link` - 이슈 간 링크 생성
- `jira_link_to_epic` - 에픽 연결

### Workflow Commands

- `/jira` - Help and connection status
- `/jira setup` - Interactive setup wizard for Jira MCP server registration
- `/jira-task init [N | ISSUE-KEY | 설명]` - Fetch tasks and create worktrees (count, sub-task analysis, or natural language)
- `/jira-task auto <ID>` - Auto-execute full workflow (start → plan → design → impl → test → review)
- `/jira-task start <ID>` - Start working on a task (fetch, branch, transition)
- `/jira-task plan <ID>` - Generate planning document
- `/jira-task design <ID>` - Generate design document
- `/jira-task impl <ID>` - Implement based on design document
- `/jira-task test <ID>` - Run tests (Playwright E2E, unit) and report to Jira
- `/jira-task review <ID>` - Code review with Jira reporting
- `/jira-local-merge <ID>` - [worktree에서] 로컬 병합 후 worktree 세션 종료
- `/jira-task pr <ID>` - [메인 레포에서] Create pull request and link to Jira
- `/jira-task done <ID>` - Complete task (transition, report)
- `/jira-task report` - Sprint progress report

### Conventions

- When posting comments to Jira, use markdown format. Jira 코멘트 언어 표준: 섹션 제목(##, ###)은 영어로, 내용(설명·요약·노트)은 한국어로 작성한다.
- Always fetch issue details before transitioning status.
- Use `jira_get_transitions`로 전환 목록 조회 후 `jira_transition_issue`에 **transitionId**를 전달.
- `jira_get_sprints_from_board`는 `boardId`가 필요하므로 먼저 `jira_get_agile_boards`로 보드 ID를 조회해야 한다.
- Store active task context in `.jira-context.json` (gitignored).
- Git branches follow pattern: `feature/<TASK-ID>`
- Worktrees are created in the parent directory: `../<project>_worktree/<TASK-ID>`
- 프로젝트 내용(스킬, 훅, 설정 등)이 변경되면 `.claude-plugin/plugin.json`의 `version`도 반드시 함께 증가시킬 것.

### JIRA_DEFAULT_PROJECT Scoping Rule

`JIRA_DEFAULT_PROJECT` 환경변수가 설정되어 있으면, **모든 JQL 쿼리에 `project = <JIRA_DEFAULT_PROJECT>` 조건을 반드시 포함**해야 한다.

- 스프린트 기반 조회에서도 `project = <JIRA_DEFAULT_PROJECT> AND sprint = ...` 형태로 프로젝트를 한정
- 관련 이슈, 에픽 하위 이슈 등 검색 시에도 항상 프로젝트 조건 포함
- 이 규칙은 init, plan, report 등 JQL을 사용하는 모든 스킬에 적용

### Workflow Progress Tracking

각 `/jira-task` 스킬은 완료 시 `.jira-context.json`의 `completedSteps` 배열에 자신의 단계를 추가해야 한다:

```json
{
  "taskId": "PROJ-123",
  "completedSteps": ["init", "start", "plan"]
}
```

유효한 단계: `init`, `start`, `plan`, `design`, `impl`, `test`, `review`, `merge`, `pr`, `done`

규칙:

- 스킬 완료 시 `.jira-context.json`을 읽고, `completedSteps`에 현재 단계를 추가 (중복 방지)
- Completion Summary 출력 시, `completedSteps`를 기반으로 Progress 라인의 `✓` 표시를 생성
- `done` 단계 완료 시 `status`를 `"Done"`으로 변경

### Environment Variables

**MCP 서버 등록 시 (`claude mcp add -e ...`):**

| 변수 | 필수 | 설명 |
|------|------|------|
| `JIRA_URL` | Yes | Jira Cloud URL |
| `JIRA_USERNAME` | Yes | Atlassian 계정 이메일 |
| `JIRA_API_TOKEN` | Yes | API 토큰 |
| `JIRA_PROJECTS_FILTER` | No | MCP 서버 접근 프로젝트 화이트리스트 (mcp-atlassian 공식 변수, 예: `PROJ` 또는 `PROJ,DEV`) |

**이 플러그인 전용 규칙 (CLAUDE.md 또는 `.jira-context.json`에 명시):**

| 변수 | 설명 |
|------|------|
| `JIRA_DEFAULT_PROJECT` | 스킬이 JQL 쿼리 구성 시 사용하는 기본 프로젝트 키. mcp-atlassian이 인식하지 않는 플러그인 자체 규칙. |

Set MCP env vars in `.claude/settings.local.json` (project-level, default) or `~/.claude/settings.json` (global).
