# Shared: Transition Verify (Fresh Fetch SSOT)

`jira-local-merge`/`jira-task-done` 등에서 Jira transition 직후 실제 status를 확정하는 공용 절차.

## When to Read

`mcp__atlassian__jira_transition_issue` 호출 직후, `.jira-context.json`을 갱신하기 직전에 1회 적용한다.

## ADF Comment 경고

`mcp__atlassian__jira_transition_issue`에 **`comment` 파라미터를 절대 사용하지 말 것.** `comment` 필드는 Atlassian Document Format(ADF) JSON을 요구하므로 일반 텍스트를 넣으면 오류가 발생한다. 코멘트는 반드시 별도로 `jira_add_comment`를 호출하여 추가한다.

## jira-cli 경로 (v0.59.0+)

`python3 "<scripts>/jira-cli.py" transition <KEY> "<id|상태명>"`은 전이 직후 재조회한 실제 status를 `{"key","status"}`로 반환한다 — 이 값이 아래 fresh fetch와 동일한 SSOT이므로 별도 `get` 호출이 필요 없다. 코멘트는 `comment` 서브커맨드로 분리 (전이에 섞지 않음). 아래는 MCP 도구를 쓰는 경우의 절차다.

## Fresh Fetch Procedure

Transition 후 즉시 `mcp__atlassian__jira_get_issue`를 호출해 Jira 측 실제 status 이름을 확보한다.

```
mcp__atlassian__jira_get_issue(
  issue_key=<TASK-ID>,
  fields="status",
  comment_limit=0,
)
```

이 fetch 결과의 `status.name`이 **유일한 진실 원천(SSOT)** 이다. 다음 단계의 `<final-jira-status>` 인자로 그대로 전달한다.

## `<final-jira-status>` 결정 규칙

- **transition 시도값을 그대로 쓰지 말 것.** Workflow 설정에 따라 시도값과 결과 status 이름이 다를 수 있다.
  - 예: "In Review" → "검토중", "Done" → "완료"
- 결과 status는 위 fresh fetch로만 결정한다.
- `cachedIssue.status` / `cachedIssue.fetchedAt` 갱신도 같은 값/타임스탬프를 사용한다 (`new Date().toISOString()` UTC `Z` 형식).

## Fetch 실패 정책

Fetch가 실패하면 (네트워크/auth 등):

- 사용자에게 fetch 실패를 알린다.
- `cachedIssue` 갱신은 **스킵**한다 — stale 상태를 거짓 갱신으로 덮지 않는다 (dashboard collector가 다음 cycle에서 정정).
- `completedSteps` / `<step>At` 등 fetch에 의존하지 않는 갱신은 그대로 진행해도 된다.
