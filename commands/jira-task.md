---
name: jira-task
description: Main workflow command for Jira-integrated development. Routes to specialized skills based on the action argument. Usage /jira-task [action] [TASK-ID]. Actions epic, create, discover, init, start, approach, test-write, impl, verify, pr, done, report, status, auto, loop, clean. Triggers jira-task, jira task, create task, new task, discover requirements, init tasks, setup tasks, start task, begin task, approach task, write tests, implement task, verify task, review task, create PR, complete task, task report, clean worktree, set epic, epic scope, 에픽 설정, 이번 작업은 epic, 태스크 생성, 이슈 등록, 요구사항 수집, 현황 리포트, 작업 환경 세팅, 작업 시작, 접근 설계, 구현 시작, 테스트 먼저, 검증, 코드 리뷰, PR 만들어, 작업 완료, 워크트리 정리
user-invocable: true
argument-hint: "[epic|create|discover|init|start|approach|test-write|impl|verify|pr|done|report|auto|loop|clean] [TASK-ID 또는 힌트/주제]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Skill
---

# /jira-task - Jira Development Workflow

Parse the user's argument to determine the action and task ID, then execute the corresponding workflow.

## Argument Parsing

The argument format is: `[action] [TASK-ID 또는 힌트]`

- **action**: One of `epic`, `create`, `discover`, `init`, `start`, `approach`, `test-write`, `impl`, `verify`, `pr`, `done`, `report`, `status`, `auto`, `loop`, `clean`. `plan`/`design`은 `approach`, `review`는 `verify`의 alias로 허용된다 (자동 라우팅). `test`·`merge`는 폐지 안내.
- **TASK-ID**: Jira issue key (e.g., `PROJ-123`). Optional — if omitted, auto-detect from context. Not required for `epic`, `create`, `discover`, `init`, `report`, `status`, `loop`.
- For `create`, any text after the action is treated as an initial hint (자연어 설명) and passed to the skill as-is.
- For `discover`, any text after the action (자연어 주제) 및 `--lite`, `--from <파일경로>` 등의 플래그는 원문 그대로 스킬에 위임된다.

If no action is provided, show the help text (same as `/jira` command).

## TASK-ID Auto-Detection

When TASK-ID is not provided, detect it as `skills/_shared/conventions.md` "TASK-ID" describes (branch → directory name → `.jira-context.json`). If it fails and the action requires a TASK-ID, ask the user to provide it.

## Action Routing

각 action은 대응하는 스킬의 워크플로를 그대로 따른다. 세부 절차는 각 스킬의 SKILL.md를 참조.

**중요: 서브 스킬 실행 시 반드시 `Skill` 도구를 사용한다. `Task` 도구는 절대 사용하지 않는다.**

### `epic [set <에픽 키|이름> | show | clear]`

Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-epic", args: "<epic 이후의 전체 인자를 그대로 전달>" })`

프로젝트 로컬 Epic 스코프(`.jira-epic.json`)를 관리한다. 설정해 두면 이후 `create`가 만드는 이슈가 그 Epic 아래에 붙는다. 스코프가 없으면 create는 Epic 없이 생성한다.

**자연어 진입**: 슬래시 커맨드 없이 "이번 작업은 epic v1.0이야", "에픽 MAE-100으로 설정해줘" 같은 발화가 나오면 곧바로 위 Skill을 호출한다 (args에 발화 원문 전달). Claude가 직접 파일을 쓰거나 JQL을 짜지 않는다.

인자 예시:
- `epic` → args: `""` (현재 스코프 표시)
- `epic set v1.0` → args: `"set v1.0"`
- `epic MAE-100` → args: `"MAE-100"`
- `epic clear` → args: `"clear"`

### `create [자연어 힌트]`

**강제 규칙**: `create` 키워드가 감지되면 **반드시** 아래 Skill 도구를 호출한다. Claude가 직접 `jira-cli.py create`를 호출하여 이슈를 만드는 것을 금지한다 — 과거 반복 실패 이력이 있어 스킴/필드 규칙을 박아둔 스킬을 통해서만 생성한다.

Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-create", args: "<사용자가 입력한 create 이후의 전체 인자를 그대로 전달>" })`

인자 예시:
- `create` → args: `""` (대화 컨텍스트만 사용)
- `create 로그인 기능 추가` → args: `"로그인 기능 추가"`
- `create auth 모듈에 OTP 2차 인증 붙이기` → args: `"auth 모듈에 OTP 2차 인증 붙이기"`
- `create --from-requirements docs/requirements/<slug>.requirements.md` → args: `"--from-requirements docs/requirements/<slug>.requirements.md"` (`/jira-task discover` 산출물을 입력으로 Epic/Story/Sub-task 일괄 등록)

서브태스크 분해 여부는 스킬이 자동 판단한다 (별도 플래그 없음). `--from-requirements` 모드에서는 자동 판단을 skip하고 트리를 그대로 사용한다.

### `discover [자연어 주제] [--lite] [--from <파일경로>]`

**강제 규칙**: `discover` 키워드가 감지되면 **반드시** 아래 Skill 도구를 호출한다. Claude가 직접 코드베이스를 탐색하거나 요구사항 문서를 작성하는 것을 금지한다 — 질문 패턴/문서 템플릿/문서 경로 규약을 박아둔 스킬을 통해서만 처리한다.

Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-discover", args: "<사용자가 입력한 discover 이후의 전체 인자를 그대로 전달>" })`

인자 예시:
- `discover 사용자 알림 시스템` → args: `"사용자 알림 시스템"`
- `discover "결제 모듈 리뉴얼" --lite` → args: `"\"결제 모듈 리뉴얼\" --lite"`
- `discover --from docs/raw/req.md` → args: `"--from docs/raw/req.md"`

자연어 주제가 비어 있어도 그대로 위임한다 — 스킬 Step 0에서 사용자에게 재입력을 요청한다.

### `init [count | ISSUE-KEY | 자연어설명]`

**강제 규칙**: 인자 형식(숫자, 이슈 키, 자연어)과 무관하게 `init` 키워드가 감지되면 **반드시** 아래 Skill 도구를 호출한다. Claude가 직접 처리하거나 스킬 호출을 건너뛰는 것을 금지한다.

Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-init", args: "<사용자가 입력한 init 이후의 전체 인자를 그대로 전달>" })`

인자 예시:
- `init` → args: `""`
- `init 3` → args: `"3"`
- `init MAE-2` → args: `"MAE-2"`
- `init MAE-2 하위작업 분석해서 착수 가능한 것만` → args: `"MAE-2 하위작업 분석해서 착수 가능한 것만"`

### `start <TASK-ID>`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-start", args: "<TASK-ID>" })`

### `approach <TASK-ID>`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-approach", args: "<TASK-ID>" })`

L2·L3 산출물(`work/<KEY>/` intent·spec·plan)을 쓰고 draft PR에서 승인을 요청한 뒤 멈춘다. L1은 산출물이 없다.

### `plan <TASK-ID>` / `design <TASK-ID>` (deprecated alias)

`plan`과 `design`은 MAE-350에서 `approach`로 통합되었다. 호출 시 deprecation 안내를 1회 출력한 뒤 approach 스킬로 자동 라우팅한다.

먼저 다음 메시지를 사용자에게 출력:

```
⚠️ deprecated: `plan`/`design`은 `approach`로 통합되었습니다 (MAE-350). 자동으로 `/jira-task approach <TASK-ID>`로 라우팅합니다.
```

그 다음: `Skill({ skill: "jira-integration:jira-task-approach", args: "<TASK-ID>" })`

### `impl <TASK-ID>`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-impl", args: "<TASK-ID>" })`

### `test-write <TASK-ID>`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-test-write", args: "<TASK-ID>" })`

### `test <TASK-ID>` (폐지)
`test`는 v0.70.0에서 `test-write`(구현 전 실패 테스트)와 `verify`(수용 조건별 검증)로 나뉘었다. 안내 1줄 후 `completedSteps`에 `impl`이 있으면 verify, 없으면 test-write로 라우팅한다.

### `verify <TASK-ID>` (alias: `review`)
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-verify", args: "<TASK-ID>" })`

`review`는 v0.70.0에서 `verify`로 바뀌었다. `review`로 호출되면 안내 1줄 후 같은 Skill로 라우팅한다.

### `pr <TASK-ID>`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-pr", args: "<TASK-ID>" })`

### `merge <TASK-ID>` (폐지)
로컬 병합은 v0.70.0에서 폐지되었다 — 에이전트 코드는 PR로만 기본 브랜치에 들어간다(SD-COM-AUT-005). 다음 메시지만 출력하고 아무 Skill도 호출하지 않는다:

```
⚠️ merge는 폐지되었습니다. draft를 풀어 리뷰를 요청하고(gh pr ready), 코드 오너가 머지한 뒤 /jira-task done <TASK-ID>를 실행하세요.
```

### `done <TASK-ID>`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-done", args: "<TASK-ID>" })`

### `auto <TASK-ID>`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-auto", args: "<TASK-ID>" })`

다음 사람 게이트까지 자동 진행한다 — L2·L3는 approach 뒤 승인 대기에서, 승인 뒤에는 test-write → impl → verify 후 "리뷰 요청 준비됨"에서 멈춘다. draft 해제·머지·done은 포함하지 않는다.

### `loop [prep|plan|build|sync]`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-loop", args: "<loop 이후의 전체 인자를 그대로 전달>" })`

init된 태스크 큐를 사람 게이트 단위 패스로 돈다 — prep(등급 일괄 확정) / plan(L2·L3 산출물 → 승인 대기) / build(test-write → impl → verify → 리뷰 요청 준비됨) / sync(PR 상태 → Jira, stacked 재정렬). 인자 없으면 prep → sync → plan → build. TASK-ID 불필요 (aggregate `.jira-context.json`의 큐 사용).

### `clean [TASK-ID ...] | --all | --list`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-clean", args: "<TASK-ID(s) 또는 --all 또는 --list>" })`

Worktree와 branch를 정리한다. `--list`로 현황 조회, `--all`로 병합/완료된 것 일괄 정리.

### `report`
Use the `Skill` tool: `Skill({ skill: "jira-integration:jira-task-report", args: "" })`

### `status`
Quick status check — `.jira-context.json`에서 활성 태스크 정보를 읽고, `python3 "<scripts>/jira-cli.py" get <TASK-ID>`로 Jira 최신 상태(`status`)를 조회하여 표시. 경로는 `skills/_shared/script-lookup.md`로 `SCRIPT_NAME="jira-cli.py"` 1회 해석 (규약: `skills/_shared/jira-cli.md`).

## Error Handling

- If TASK-ID is not provided and auto-detection fails, ask the user to provide it
- If `jira-cli.py` fails with 401/403 (credentials), guide user to check `/jira` for setup
- If transition fails (e.g., invalid transition name), use `python3 "<scripts>/jira-cli.py" transitions <TASK-ID>` to list available transitions for the issue

## Response Summary

모든 응답 끝에 아래 형식의 요약을 출력한다:

```
─────────────────────────────────────────
📋 Jira Workflow Summary
─────────────────────────────────────────
✅ Done: [이번 응답에서 수행한 작업]
💡 Next: [다음 추천 작업]
─────────────────────────────────────────
```

규칙:
- **Done**: 실제로 수행한 작업을 간결하게 기술 (예: "PROJ-123 기획 문서 생성")
- **Next**: `.jira-context.json`의 `completedSteps` 기반으로 다음 워크플로 단계를 추천. 워크플로 외 작업이면 맥락에 맞는 다음 작업 추천
  - 워크플로 단계 순서: `discover → create → init → start → approach(L2·L3) → test-write → impl → verify → pr → done`
  - L2·L3 `approach` 뒤는 승인 대기 — 승인되면 `test-write`
  - `verify` 통과 뒤는 사람이 draft를 푼다(`gh pr ready <번호>`). 머지는 코드 오너, 머지 뒤 `done`
- 워크플로와 무관한 단순 질의응답에서는 생략 가능
