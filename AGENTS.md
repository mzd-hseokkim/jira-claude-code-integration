# AGENTS.md

이 저장소는 Jira와 Codex 워크플로를 연동하는 **Codex 플러그인**(`jira-integration`)이다. 이 문서는 플러그인 자체를 **개발/유지보수**할 때 필요한 컨벤션을 다룬다. 최종 사용자 문서는 `README.md` 참고.

## 작업 원칙

- **Surgical Changes**: 요청과 직접 관련된 라인만 수정. 인접 코드 "개선"/포맷팅 변경 금지. 본인의 변경으로 생긴 orphan import/변수만 정리하고, 기존 dead code는 건드리지 않는다.
- **Simplicity First**: 요청되지 않은 추상화/설정 옵션/방어 코드 추가 금지. 스킬은 prompt 마크다운이므로 분량이 곧 토큰 비용이다.
- **버전 동기화**: 스킬/훅/스크립트/설정이 바뀌면 `.Codex-plugin/plugin.json`의 `version`도 반드시 함께 올린다 (안 올리면 마켓플레이스 업데이트가 감지 안 됨).

## Repository Layout

- `skills/` — `/jira-task` SKILL.md 프롬프트 (단계별 1개)
- `commands/` — 슬래시 커맨드 정의
- `agents/` — 서브에이전트 정의 (예: jira-reviewer)
- `hooks/` — phase-gate 훅 + 동기화 스크립트 (`hooks/hooks.json` 자동 로드)
- `scripts/` — 공용 헬퍼 (`jira-attach.sh`, `jira-context-update.py`, dashboard 서버 등)
- `templates/` — 문서 템플릿 (approach/test-report/review/report)
- `tests/` — 플러그인 테스트
- `docs/` — 내부 문서 (`mcp-atlassian-tools.md`, requirements/plan/design/test 산출물)

빌드/테스트 스크립트는 `package.json`의 scripts 참고.

## MCP Server: atlassian (mcp-atlassian)

`atlassian` MCP 서버가 Jira Cloud 도구를 제공한다 (tool prefix `mcp__atlassian__`). **전체 도구 레퍼런스: `docs/mcp-atlassian-tools.md`** — 새 도구를 쓰기 전에 거기를 먼저 본다.

**첨부 업로드는 mcp-atlassian이 미지원** → REST 직접 호출:
`POST $JIRA_URL/rest/api/3/issue/<KEY>/attachments` (Basic Auth + `X-Atlassian-Token: no-check`).
자격증명 조회 순서: 환경변수 → `.mcp.json` → `~/.Codex.json` → `.Codex/settings.local.json` → `~/.Codex/settings.json`.

## Skill Authoring Conventions

- **Language Rule**: 모든 `/jira-task` 스킬 출력은 한국어. 사용자 응답·생성 문서·Jira 코멘트 본문 모두. 예외: 코드/변수명/브랜치명/파일명/명령어는 영어. Jira 코멘트의 섹션 제목(##, ###)은 영어, 내용은 한국어.

- **Markdown for Jira comments**: Jira 코멘트는 마크다운으로 작성.

- **Cache-First Fetch** (approach/impl/test/review/done): 호출 직전 `.jira-context.json`의 `cachedIssue`를 먼저 확인.
  1. `cachedIssue.key === <TASK-ID>`면 그 값 사용 → `jira_get_issue` 호출 **생략**.
  2. miss면 본래 fields/comment_limit으로 fetch 후 `cachedIssue` 갱신.
  3. 강제 새로고침은 사용자가 `cachedIssue`를 수동 삭제.

- **공용 스크립트 lookup**: 워크트리 cwd에서는 플러그인 `scripts/`가 직접 보이지 않으므로 호출 직전 lookup으로 절대 경로를 결정한다. 단일 출처: `skills/_shared/script-lookup.md`. 각 스킬은 호출 직전 그 파일을 Read한 뒤 `SCRIPT_NAME` / `OUT_VAR`를 셋업하고 lookup 블록을 실행.
  - `jira-attach.sh` (approach/test/review): Jira 첨부 업로드. 못 찾으면 첨부만 스킵, 워크플로 진행.
  - `jira-context-update.py` (start/approach/impl/test/review/merge/done): worktree-local + aggregate `.jira-context.json` 두 개의 `completedSteps`/`status`/`<step>At`/`cachedIssue` 갱신.
    호출: `python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> <step> <status> <ctx-file> [<ctx-file>...]`.
    `status="-"`는 status/cachedIssue.status를 그대로 보존(Jira transition 없는 record-only 단계용). 표준 호출 스니펫: `skills/_shared/context-update.md`.
  - 그 외: `propagate-mcp-config.sh`(init), `append-review-log-wrapper.sh`(review), `cleanup-worktree-mcp.py`(done).

- **상태 전환 전 항상 이슈 상세 fetch** (`jira_get_transitions` → `jira_transition_issue`에 transitionId 전달).

- **Context 파일**: 활성 작업 컨텍스트는 `.jira-context.json`(gitignored). 브랜치 패턴 `feature/<TASK-ID>`, 워크트리 위치 `../<project>_worktree/<TASK-ID>`.

- **Epic 스코프 파일**: `.jira-epic.json`(gitignored, 메인 레포 루트 1곳만 정본 — worktree에 복제하지 않음). `/jira-task epic`이 쓰고 `create`만 읽는다. 규약 단일 출처는 `skills/_shared/epic-scope.md`. `init`/`report`의 JQL에는 영향을 주지 않는다.

- **Progress 추적**: 각 스킬은 완료 시 `.jira-context.json`의 `completedSteps`에 자기 단계를 추가(중복 방지). 유효 단계: `discover`, `create`, `init`, `start`, `approach`, `impl`, `test`, `review`, `merge`, `pr`, `done`. `done`은 추가로 `status`를 `"Done"`으로 변경. Completion Summary의 Progress `✓`는 `completedSteps`에서 생성. (`plan`/`design`은 MAE-350에서 `approach`로 통합되어 제거됨; 기존 task의 stale 흔적은 마이그레이션 로직이 처리.)

- **Approach 문서에 코드 스니펫 금지** (토큰 낭비).

## JIRA_DEFAULT_PROJECT Scoping Rule

`JIRA_DEFAULT_PROJECT` 환경변수가 설정되어 있으면 **모든 JQL에 `project = <JIRA_DEFAULT_PROJECT>` 조건을 반드시 포함**. 스프린트/에픽 하위/관련 이슈 검색 등 예외 없음. init/report 등 JQL 쓰는 모든 스킬에 적용 (mcp-atlassian의 `JIRA_PROJECTS_FILTER`와 별개의 플러그인 자체 규칙).
