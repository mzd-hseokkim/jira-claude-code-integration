# Shared Context Update Pattern

`jira-context-update.py`로 worktree-local + aggregate `.jira-context.json` 두 파일의 `completedSteps`/`status`/`<step>At`/`cachedIssue`를 일관되게 갱신하는 표준 호출. LLM이 JSON을 인라인으로 patch하는 방식은 누락/덮어쓰기 사고가 발생하므로 모든 단계 스킬은 이 패턴을 사용한다.

## 호출 변수

- `TASK_ID` — `MAE-123` 등 Jira 이슈 키.
- `STEP` — `start` / `approach` / `impl` / `test` / `review` / `merge` / `done` 중 하나.
- `STATUS` — Jira에서 fresh fetch한 실제 status명 (예: `"In Progress"`, `"검토중"`). 단계가 Jira transition을 하지 않으면(record-only) `"-"` 전달 — 기존 status를 보존한다.
- `WORKTREE_CTX` — 워크트리 cwd의 `.jira-context.json` 절대/상대 경로.
- `REPO_CTX` — 메인 레포의 `.jira-context.json` (aggregate). `<repoRoot>/.jira-context.json`. 워크트리 안에서는 cwd `.jira-context.json`의 `repoRoot` 필드 또는 `git worktree list | head -1`로 결정.

## 호출 블록

`skills/_shared/script-lookup.md`로 `JIRA_CTX_UPDATE_PY` 절대경로를 해석한 뒤:

```bash
python3 "$JIRA_CTX_UPDATE_PY" "$TASK_ID" "$STEP" "$STATUS" \
    "$WORKTREE_CTX" \
    "$REPO_CTX"
```

스크립트가 처리하는 것:
- `completedSteps`에 `STEP` 추가 (중복 방지).
- `STATUS != "-"`일 때만 top-level `status` + (있으면) `cachedIssue.status` 갱신.
- `<STEP>At` UTC ISO 8601 (Z 접미사) 기록.
- `cachedIssue.fetchedAt` 갱신 (cachedIssue 존재 시).
- aggregate(`tasks[]`) vs worktree(top-level) 자동 감지.

## 호출 후 보존해야 할 추가 필드

스크립트는 위 키만 갱신한다. 스킬이 별도로 기록해야 하는 필드(예: start의 `startedAt`은 `startAt`으로 기록됨, 또는 fresh 모드에서 새 파일 생성 등)는 이 호출 **이전**에 별도로 처리하거나, 호출 이후 추가 patch로 처리한다. 대부분의 단계는 본 호출만으로 충분하다.
