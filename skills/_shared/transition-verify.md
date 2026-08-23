# Shared: Transition Verify (SSOT)

`jira-local-merge`/`jira-task-done` 등에서 Jira transition 직후 실제 status를 확정하는 공용 절차.

## When to Read

`python3 "<scripts>/jira-cli.py" transition` 호출 직후, `.jira-context.json`을 갱신하기 직전에 1회 적용한다.

## Transition 절차 (jira-cli)

```bash
python3 "<scripts>/jira-cli.py" transitions <TASK-ID>              # [{id,name,to}]
python3 "<scripts>/jira-cli.py" transition <TASK-ID> "<id|상태명>"   # {"key","status"}
```

`transition` 출력의 `status`는 전이 직후 Jira에서 재조회한 실제 status 이름이다. 이 값이 **유일한 진실 원천(SSOT)** 이며 별도 `get` 재조회가 필요 없다. 다음 단계의 `<final-jira-status>` 인자로 그대로 전달한다.

코멘트는 `comment` 서브커맨드로 별도 호출한다 (전이에 섞지 않음).

## `<final-jira-status>` 결정 규칙

- **transition 시도값을 그대로 쓰지 말 것.** Workflow 설정에 따라 시도값과 결과 status 이름이 다를 수 있다.
  - 예: "In Review" → "검토중", "Done" → "완료"
- 결과 status는 `transition` 출력의 `status`로만 결정한다.
- `cachedIssue.status` / `cachedIssue.fetchedAt` 갱신도 같은 값/타임스탬프를 사용한다 (`new Date().toISOString()` UTC `Z` 형식).

## Transition 실패 정책

`transition`이 실패하면 (exit 1/2 — 네트워크/auth/전이 없음 등):

- 사용자에게 실패와 현재 status를 알린다.
- `cachedIssue` 갱신은 **스킵**한다 — stale 상태를 거짓 갱신으로 덮지 않는다 (dashboard collector가 다음 cycle에서 정정).
- `completedSteps` / `<step>At` 등 전이 결과에 의존하지 않는 갱신은 그대로 진행해도 된다.
