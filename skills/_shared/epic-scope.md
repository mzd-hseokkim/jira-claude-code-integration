# Epic Scope 파일 규약 (`.jira-epic.json`)

프로젝트 단위로 "이번에 붙일 Epic"을 고정해 두는 로컬 파일. `jira-task-epic`이 쓰고 `jira-task-create`가 읽는다.

## 파일 위치

**메인 레포 루트 1곳만 정본**이다. worktree마다 복제하지 않는다 (Epic 스코프는 태스크가 아니라 프로젝트에 붙는 개념).

```bash
COMMON=$(git rev-parse --git-common-dir 2>/dev/null) || { echo "NOT_A_GIT_REPO"; }
case "$COMMON" in
  /*|[A-Za-z]:*) ;;
  *) COMMON="$(git rev-parse --show-toplevel)/$COMMON" ;;
esac
EPIC_FILE="$(dirname "$COMMON")/.jira-epic.json"
```

`cd`+`pwd`로 정규화하지 말 것 — git bash에서 `C:/...`가 `/c/...`로 바뀌어 `Write` 도구가 못 쓰는 경로가 된다.

`--git-common-dir`는 worktree 안에서도 **메인 레포의 `.git`**을 가리키므로, 워크트리/메인 어디서 실행해도 같은 파일에 도달한다.

## 스키마

```json
{
  "epicKey": "MAE-100",
  "epicSummary": "v1.0 릴리스",
  "projectKey": "MAE",
  "setAt": "2026-08-07T10:00:00+09:00"
}
```

`epicKey`가 단일 진실. 나머지는 표시·검증용 캐시다.

## 읽기

```bash
if [ -f "$EPIC_FILE" ]; then cat "$EPIC_FILE"; else echo "NO_EPIC_SCOPE"; fi
```

- `NO_EPIC_SCOPE` 또는 JSON 파싱 실패 → `epicScope = null`로 두고 **Epic 없이 그대로 진행**한다. 에러로 중단하지 않는다.
- 파싱은 실패했는데 파일은 있는 경우 사용자에게 1줄 경고 후 진행.

## `.gitignore` 등록

사람마다 작업 Epic이 다르므로 커밋 대상이 아니다. 파일을 쓰기 **직전**에 확인한다:

```bash
REPO_GITIGNORE="$(dirname "$EPIC_FILE")/.gitignore"
if ! grep -qF ".jira-epic.json" "$REPO_GITIGNORE" 2>/dev/null; then
  printf '\n# Jira integration (local epic scope)\n.jira-epic.json\n' >> "$REPO_GITIGNORE"
fi
```

## 우선순위 규칙

대화에서 사용자가 Epic을 **명시**했으면 그 값이 파일보다 우선한다. 파일은 어디까지나 기본값이다.
