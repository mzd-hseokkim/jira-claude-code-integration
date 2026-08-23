# Shared: Jira 호출은 `jira-cli.py`로

> v0.59.0부터 auto 경유 단계(start/approach/impl/test/review)는 atlassian MCP 도구 대신 `scripts/jira-cli.py`를 Bash로 호출한다. 이유: 세션 시작 시 MCP 기동 경쟁으로 도구가 안 붙는 문제 제거, 단계당 `ToolSearch` 1회 절감, 응답 압축(avatar·reporter 등 미출력). 설계: `tasks/jira-cli-design.md`.

## 자격증명 (v0.60.0)

정본은 **메인 레포 `.jira-context.json`의 `jira` 블록** `{url, username, apiToken, project}` 한 곳. CLI가 worktree에서도 `git rev-parse --git-common-dir`로 메인 레포 파일을 찾아 읽으므로 worktree 컨텍스트에 복제하지 않는다 (init/start가 이 블록을 worktree-local 파일에 쓰지 말 것). `jira` 블록이 없으면 환경변수 → 레거시 MCP 설정 파일 순으로 찾고, **찾은 값을 메인 레포 context의 `jira` 블록에 자동 기입**한다 (1회; `.gitignore`에 `.jira-context.json`이 없으면 함께 추가하고 알린다). 다음 호출부터는 context가 정본.

- 설정: `python3 <scripts>/jira-cli.py config set <url> <username> <token> [project]` / 조회: `config show` (토큰 마스킹).
- **스킬은 `jira` 블록을 절대 출력·인용하지 않는다** — `.jira-context.json`을 Read했을 때 `apiToken` 값을 응답·코멘트·로그에 옮기지 마라. `jira-context-update.py --patch`로 이 블록을 건드리지 않는다.

## 경로

호출 prompt가 `<scripts>/` 절대 경로를 줬으면 그대로 쓴다. 없으면 `skills/_shared/script-lookup.md`로 `SCRIPT_NAME="jira-cli.py"` 1회 해석.

## MCP 도구 → CLI 대응

| MCP 도구 | CLI | 비고 |
|---|---|---|
| `jira_get_issue` | `python3 <scripts>/jira-cli.py get <KEY>` | 압축 JSON: key/summary/status/issuetype/priority/assignee/parent/labels/description. 추가 필드는 `--fields subtasks,issuelinks` |
| `jira_search` | `... search "<JQL>" --limit N` | `JIRA_DEFAULT_PROJECT`가 있으면 `project =` 자동 삽입 |
| `jira_add_comment` | `... comment <KEY> @<md파일>` 또는 `... comment <KEY> "<markdown>"` | markdown→wiki 자동 변환. 긴 본문은 scratchpad 파일로 쓰고 `@경로` |
| `jira_get_transitions` | `... transitions <KEY>` | `[{id,name,to}]` |
| `jira_transition_issue` | `... transition <KEY> "<id 또는 상태명>"` | 전이 후 실제 status를 반환 — **별도 재조회 불필요** (transition-verify의 fresh fetch를 대체) |
| `jira_get_user_profile` | `... whoami` | |
| `jira_update_issue` (assignee) | `... assign <KEY>` (기본 me) | |
| `jira_update_issue` (기타) | `... update <KEY> '<fields json>'` | |
| (jira-attach.sh) | `... attach <KEY> <file>...` | |

## 출력 처리

- 성공: stdout 한 줄 JSON. 필요한 값만 읽는다.
- 실패: exit 1 + stderr `jira-cli: <code> <reason> — <hint>`. 401/403이면 자격증명 문제로 보고 중단, 404는 키 확인. 코멘트/담당자 지정 실패는 비차단(경고 후 계속), 전이 실패는 현재 상태를 알리고 계속.
- `cachedIssue` 갱신: `get` 출력의 필드를 그대로 저장 (`fetchedAt`은 UTC Z).

## 금지

- auto 경유(prompt에 `<scripts>/` 경로가 있는 경우) `mcp__atlassian__*` 도구 호출 금지 — `ToolSearch`도 하지 않는다.
- `transition`에 코멘트를 섞지 않는다 (코멘트는 `comment`로 별도).
