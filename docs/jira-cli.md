# jira-cli.py 레퍼런스

플러그인의 모든 Jira 호출을 담당하는 단일 스크립트 (`scripts/jira-cli.py`, Python 3.10+ 표준 라이브러리만). atlassian MCP 서버를 대체한다 — 설계 배경은 `tasks/jira-cli-design.md`, 스킬 작성 규약은 `skills/_shared/jira-cli.md`.

```
python3 <plugin>/scripts/jira-cli.py <subcommand> [args] [--fields a,b] [--limit N] [--raw]
```

## 자격증명

정본은 **메인 레포 `.jira-context.json`의 `jira` 블록** — 워크스페이스 단위이며 worktree에서도 메인 레포 파일을 찾아 읽는다 (`git rev-parse --git-common-dir`). 조회 순서: `jira` 블록 → 환경변수(`JIRA_URL`/`JIRA_USERNAME`/`JIRA_API_TOKEN`/`JIRA_DEFAULT_PROJECT`) → 레거시 MCP 설정(`.mcp.json`, `~/.claude.json`, `.claude/settings*.json`). 블록이 없을 때 뒤의 둘에서 찾으면 자동으로 블록에 기입하고, `.jira-context.json`이 `.gitignore`에 없으면 추가한다.

| 명령 | 설명 |
|---|---|
| `config set <url> <username> <token> [project]` | 블록 기록 (gitignore 자동 등록) |
| `config show` | 블록 조회 — 토큰은 `ATAT…5AA9`처럼 마스킹 |

토큰은 어떤 서브커맨드 출력에도 나오지 않는다. 스킬은 `jira` 블록을 인용·출력하지 않는다.

## 서브커맨드

| 명령 | 인자 | 출력 (압축 JSON) |
|---|---|---|
| `get` | `<KEY>` | `{key, summary, status, issuetype, priority, assignee, parent, labels, description}` |
| `search` | `"<JQL>" [--limit N]` | `[{key, summary, status, issuetype, priority, assignee, parent, labels}]` — `project`가 설정돼 있고 JQL에 project 조건이 없으면 자동 삽입 |
| `comment` | `<KEY> <markdown \| - \| @file>` | `{id, created}` — markdown→wiki 변환 (제목·굵게·인라인/블록 코드·불릿·번호·표·링크·구분선) |
| `transitions` | `<KEY>` | `[{id, name, to}]` |
| `transition` | `<KEY> <id \| 상태명>` | `{key, status}` — 전이 후 재조회한 실제 상태 (별도 fresh fetch 불필요) |
| `whoami` | — | `{accountId, displayName, email}` |
| `assign` | `<KEY> [accountId \| me]` | `{key, assignee}` |
| `update` | `<KEY> '<fields json>'` | `{key, updated: [필드명]}` — `description`은 markdown으로 주면 변환 |
| `create` | `'<json>' \| @file` | `{key, id}` — `{"project","summary","issuetype","description","parent","labels","priority","assignee":"me"}` |
| `link` | `<TYPE> <OUTWARD> <INWARD>` | 예: `link Blocks MAE-1 MAE-2` = MAE-1 blocks MAE-2 |
| `epic-link` | `<KEY> <EPIC>` | parent 필드 설정 |
| `boards` | `[PROJECT]` | `[{id, name, type}]` |
| `sprints` | `<BOARD-ID> [active\|future\|closed]` | `[{id, name, state, startDate, endDate}]` |
| `projects` | — | `[{key, name, type}]` |
| `link-types` | — | `[{name, inward, outward}]` |
| `attach` | `<KEY> <file>...` | `[{file, id}]` |

`--fields subtasks,issuelinks`처럼 압축 필드 밖의 raw 필드를 덧붙일 수 있고, `--raw`는 API 응답 전체를 돌려준다. avatar·self URL·reporter·worklog는 기본 출력에 절대 포함되지 않는다 (sub-agent 컨텍스트 절약).

## 종료 코드와 에러

| exit | 의미 | stderr |
|---|---|---|
| 0 | 성공 | — |
| 1 | HTTP 4xx/5xx | `jira-cli: 401 Unauthorized — 토큰/이메일 확인 (/jira setup) <Jira 에러 메시지>` |
| 2 | 인자 누락·자격증명 없음·네트워크 오류 | `jira-cli: …` |

`loop`의 시스템 실패 판정은 이 메시지를 그대로 매칭한다 (401/403 → 전체 중단).

## API

REST v2 (`/rest/api/2/…`) — description·코멘트가 wiki markup 문자열이라 ADF 변환이 필요 없다. 검색만 v3 `/rest/api/3/search/jql` (구 `/search`는 Jira Cloud에서 제거됨, `nextPageToken` 페이지네이션). 애자일은 `/rest/agile/1.0/…`.

## 프로젝트별 주의

- 로컬라이즈된 Jira(한국어 등)는 이슈 타입명이 다르다 — 예: MAE 프로젝트는 상위 `작업`, 하위 `Subtask`, `Story` 없음. `create` 전에 `projects`/기존 이슈의 `issuetype`으로 확인.
- 우선순위 이름도 로컬라이즈될 수 있다 — 모르면 `priority`를 생략(기본값).
