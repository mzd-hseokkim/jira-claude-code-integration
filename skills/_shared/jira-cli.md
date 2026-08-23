# Shared: Jira 호출은 `jira-cli.py`로

> v0.59.0부터 auto 경유 단계(start/approach/impl/test/review)는 atlassian MCP 도구 대신 `scripts/jira-cli.py`를 Bash로 호출한다. 이유: 세션 시작 시 MCP 기동 경쟁으로 도구가 안 붙는 문제 제거, 단계당 `ToolSearch` 1회 절감, 응답 압축(avatar·reporter 등 미출력). 설계: `tasks/jira-cli-design.md`.

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
