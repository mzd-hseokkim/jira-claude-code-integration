# 공용 규약

모든 jira-task 스킬이 따르는 규칙. Claude Code와 Codex 등 다른 harness에서 같은 스킬을 쓰므로, harness마다 다른 부분은 여기서만 정한다.

## 언어

사용자 응답, 생성 문서, Jira 코멘트 본문은 한국어로 쓴다. 코드·변수명·브랜치명·파일명·명령어는 영어 그대로 둔다. Jira 코멘트의 섹션 제목(`##`, `###`)은 영어, 내용은 한국어.

문서, PR 본문과 코멘트, Jira 코멘트를 쓰기 전에 `skills/_shared/writing.md`를 Read해 따른다. 사용자 응답에도 같은 규칙을 적용한다.

## TASK-ID

인자로 받지 못했으면 다음 순서로 찾는다. 찾지 못했는데 그 단계에 필요하면 사용자에게 묻는다.

1. `git branch --show-current`가 `feature/<TASK-ID>`
2. 현재 디렉터리 이름이 `[A-Z]+-\d+`
3. `.jira-context.json`의 `taskId`

## Cache-First Fetch

context `cachedIssue.key === <TASK-ID>`이고 `fetchedAt`이 있으면 그 값을 쓰고 `jira-cli.py get`을 생략한다. 없으면 `get <KEY> --fields subtasks,issuelinks > <임시 파일>` 후 `jira-context-update.py <KEY> - - <worktree ctx> --cache-issue <임시 파일>`로 저장한다. JSON을 직접 편집하지 않는다. `cachedIssue`는 worktree context에만 둔다.

## 프로젝트 표준

산출물·테스트·코드는 프로젝트가 정한 설계·코딩·테스트 표준을 따른다. 표준은 루트 `AGENTS.md`(또는 `CLAUDE.md`)와, 바꿀 파일이 있는 폴더에서 루트까지의 `AGENTS.md`가 정하고 가리키는 문서다. 하위 폴더의 문서는 자동으로 실리지 않을 수 있으니 직접 Read한다. 이 스킬의 규칙(문서 위치, 억제 주석, 검사 명령)과 충돌하면 프로젝트 규칙을 따른다.

## Lint

test-write·impl·fix가 바꾼 파일에 lint를 돌릴 때 명령은 이 순서로 정한다.

1. 바꾼 파일과 가장 가까운 `AGENTS.md`가 lint·format 명령이나 기준(예: 경고 0건)을 정했으면 그것을 따른다.
2. 없으면 바꾼 파일과 가장 가까운 `package.json`·`pyproject.toml`·`pom.xml`·`build.gradle*`이 있는 폴더를 패키지 루트로 보고 `bash <scripts>/detect-lint.sh <패키지 루트>`를 1회 호출한다(`LINT <name> <cmd>` / `FORMAT <name> <cmd>` / `NONE`). 출력 명령은 그 패키지 루트에서 실행한다. 패키지 루트에서 `NONE`이면 저장소 루트로 한 번 더 호출한다.
3. 파일 단위로 돌릴 수 있는 명령이면 바꾼 파일만 넘긴다. 여러 패키지에 걸치면 패키지마다 한 번씩 돌린다.

## 프로젝트 스코핑

`JIRA_DEFAULT_PROJECT`가 있으면 모든 JQL에 `project = <값>` 조건이 들어간다(`jira-cli.py search`가 자동 삽입).

## harness 차이

| 항목 | Claude Code | 도구가 없는 harness(Codex 등) |
|---|---|---|
| 사람에게 묻기 | `AskUserQuestion` | 질문과 번호 선택지를 텍스트로 쓰고 턴을 끝낸다. 답을 받기 전에 다음 단계로 가지 않는다 |
| 임시 파일(`<scratchpad>`) | 세션 scratchpad | OS 임시 디렉터리(`python3 -c "import tempfile;print(tempfile.gettempdir())"`). 레포 안에 만들지 않는다 |
| 다음 단계 안내(`/jira-task <action> <KEY>`) | 그대로 | `$jira-task-<action> <KEY>` |
| 작성 도구 기록(PR 본문, 검증 서명) | `Claude Code` | 지금 실행 중인 harness 이름(예: `Codex`) |
| auto | Workflow | worktree 터미널에서 `node <scriptsDir>/auto-codex.js <KEY>` (단계마다 새 `codex exec`) |
| loop | 지원 | 지원 안 함. 태스크마다 auto나 단계 스킬을 쓴다 |
