# /jira 슬래시 커맨드 오진 버그 수정 방안

## 개요

`/jira` 커맨드 실행 시 Jira가 정상 연결되어 있음에도 "연결 미설정"으로 잘못 표시되는 문제.

- **스킬 파일 위치**: `~/.claude/plugins/cache/jira-claude-code-integration/jira-integration/0.4.1/commands/jira.md`
- **Jira 플러그인 저장소**: `mzd-hseokkim/jira-claude-code-integration`

---

## 버그 1: `jira_get_user_profile`에 `"me"` 전달

### 문제

스킬 파일 17번째 줄:

```
Check if Atlassian MCP server is available by trying to use `mcp__atlassian__jira_get_user_profile`.
```

`user_identifier`로 무엇을 넘길지 명시가 없어 Claude가 `"me"`를 추론해서 사용함.
`mcp-atlassian` 툴은 `"me"` 같은 의미론적 값을 지원하지 않고 실제 이메일/account ID를 요구하므로 항상 실패:

```json
{"success": false, "error": "Could not determine how to look up user 'me'."}
```

### 수정 방안

연결 확인 수단을 `jira_get_user_profile` 대신 항상 응답이 오는 JQL 검색으로 교체:

```
Check if Atlassian MCP server is available by calling `mcp__atlassian__jira_search`
with JQL `project is not EMPTY ORDER BY updated DESC` and limit 1.
If the call succeeds (no exception), the server is connected.
```

또는 스킬 파일에 실제 이메일을 명시하는 방법도 있으나, 이메일이 사용자마다 다르므로 JQL 방식이 더 범용적.

---

## 버그 2: `JIRA_URL`을 shell 환경변수에서 읽으려 함

### 문제

스킬 파일 20번째 줄:

```
The connected Jira instance URL (from JIRA_URL env var)
```

Claude가 `echo $JIRA_URL`을 실행하지만 항상 비어있음. `JIRA_URL`은 shell 환경변수가 아니라 `.claude.json`의 MCP 서버 설정 `env` 블록 안에만 존재하기 때문:

```json
"atlassian": {
  "type": "stdio",
  "command": "uvx",
  "args": ["mcp-atlassian"],
  "env": {
    "JIRA_URL": "https://mz-dev.atlassian.net",   ← MCP 프로세스 내부에만 주입됨
    "JIRA_USERNAME": "hseokkim@mz.co.kr"
  }
}
```

shell에서 보면 항상 empty string이므로 "자격증명 미설정"으로 오진함.

### 수정 방안

`JIRA_URL` env var 확인 지시를 제거하고, MCP 툴 호출 결과에서 URL을 추출하도록 변경:

```
Report the Jira instance URL from the search result's issue URLs (e.g., extract base URL
from issue key responses), or simply omit the URL field if it cannot be determined
without shell env access.
```

---

## 수정 후 연결 확인 로직 예시

```markdown
## 1. Connection Status

Check if Atlassian MCP server is available by calling `mcp__atlassian__jira_search`
with JQL `project is not EMPTY ORDER BY updated DESC` and limit 1.

- If the call succeeds: report "Connected"
- If the call throws an error: report "Not connected" and guide setup

Do NOT use `echo $JIRA_URL` to check credentials — these are scoped to the MCP server
process and not visible as shell environment variables.
```

---

## 영향 범위

이 버그는 `/jira` 커맨드의 **표시 오류**에 국한됨. 실제 Jira 연동 기능(`/jira-task *` 커맨드들)은 정상 동작.
