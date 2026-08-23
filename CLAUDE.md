# CLAUDE.md

이 저장소는 Jira와 Claude Code 워크플로를 연동하는 **Claude Code 플러그인**(`jira-integration`)이다. 이 문서는 플러그인 자체를 **개발/유지보수**할 때 필요한 컨벤션을 다룬다. 최종 사용자 문서는 `README.md` 참고.

## 작업 원칙

- **Surgical Changes**: 요청과 직접 관련된 라인만 수정. 인접 코드 "개선"/포맷팅 변경 금지. 본인의 변경으로 생긴 orphan import/변수만 정리하고, 기존 dead code는 건드리지 않는다.
- **Simplicity First**: 요청되지 않은 추상화/설정 옵션/방어 코드 추가 금지. 스킬은 prompt 마크다운이므로 분량이 곧 토큰 비용이다.
- **버전 동기화**: 스킬/훅/스크립트/설정이 바뀌면 `.claude-plugin/plugin.json`의 `version`도 반드시 함께 올린다 (안 올리면 마켓플레이스 업데이트가 감지 안 됨).

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

## Jira 호출: `scripts/jira-cli.py` (v0.59.0+) / atlassian MCP (Phase B까지 폴백)

auto 경유 단계(start/approach/impl/test/review)는 **`scripts/jira-cli.py`**를 Bash로 호출한다 — 표준 라이브러리 REST(v2 + search는 v3 `search/jql`), 압축 JSON 출력, 코멘트는 markdown→wiki 변환. 규약·MCP 대응표: `skills/_shared/jira-cli.md`, 설계: `tasks/jira-cli-design.md`. 자격증명(v0.60.0): **메인 레포 `.jira-context.json`의 `jira` 블록** `{url, username, apiToken, project}`이 정본 — `jira-cli.py config set`으로 기록, worktree에서는 `--git-common-dir`로 메인 레포 파일을 찾아 읽으므로 복제 금지. 조회 순서: 환경변수 → `jira` 블록 → (레거시 폴백) MCP 설정 파일들. 스킬은 `jira` 블록을 출력·인용하지 않는다 (토큰 노출 경로 차단).

나머지 스킬(init/create/discover/epic/report/merge/done/pr/clean/status)은 아직 `atlassian` MCP 서버(tool prefix `mcp__atlassian__`, 레퍼런스 `docs/mcp-atlassian-tools.md`)를 쓴다 — Phase B에서 전환 예정. 첨부 업로드는 MCP 미지원이라 `jira-cli.py attach` 또는 `jira-attach.sh`(REST 직접 호출).

## Skill Authoring Conventions

- **Language Rule**: 모든 `/jira-task` 스킬 출력은 한국어. 사용자 응답·생성 문서·Jira 코멘트 본문 모두. 예외: 코드/변수명/브랜치명/파일명/명령어는 영어. Jira 코멘트의 섹션 제목(##, ###)은 영어, 내용은 한국어.

- **Markdown for Jira comments**: Jira 코멘트는 마크다운으로 작성.

- **Cache-First Fetch** (approach/impl/test/review/done): 호출 직전 `.jira-context.json`의 `cachedIssue`를 먼저 확인.
  1. `cachedIssue.key === <TASK-ID>`면 그 값 사용 → `jira_get_issue` 호출 **생략**.
  2. miss면 본래 fields/comment_limit으로 fetch 후 `cachedIssue` 갱신.
  3. 강제 새로고침은 사용자가 `cachedIssue`를 수동 삭제.
  4. `cachedIssue`는 **worktree-local context에만** 기록한다 — `tasks[]`가 있는 aggregate 파일 최상위에는 절대 기록 금지 (스키마 오염; `jira-context-update.py`가 발견 시 자동 제거).

- **공용 스크립트 lookup**: 워크트리 cwd에서는 플러그인 `scripts/`가 직접 보이지 않으므로 호출 직전 lookup으로 절대 경로를 결정한다. 단일 출처: `skills/_shared/script-lookup.md`. 각 스킬은 호출 직전 그 파일을 Read한 뒤 `SCRIPT_NAME` / `OUT_VAR`를 셋업하고 lookup 블록을 실행.
  - `jira-attach.sh` (approach/test/review): Jira 첨부 업로드. 못 찾으면 첨부만 스킵, 워크플로 진행.
  - `jira-context-update.py` (start/approach/impl/test/review/merge/done): worktree-local + aggregate `.jira-context.json` 두 개의 `completedSteps`/`status`/`<step>At`/`cachedIssue` 갱신.
    호출: `python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> <step> <status> <ctx-file> [<ctx-file>...]`.
    `status="-"`는 status/cachedIssue.status를 그대로 보존(Jira transition 없는 record-only 단계용). 표준 호출 스니펫: `skills/_shared/context-update.md`.
  - 그 외: `propagate-mcp-config.sh`(init), `append-review-log-wrapper.sh`(review), `cleanup-worktree-mcp.py`(done), `auto.workflow.js`(auto — Workflow `scriptPath`로 실행, bash 호출 아님), `append-run-log.py`(auto — 실행 결과를 `docs/run-log/_index.jsonl`에 기록), `detect-lint.sh`(impl/review/fix — 선언된 lint/format 도구 판정 1회 호출).
  - **auto 경유 시 lookup 생략**: auto launcher가 `scriptsDir`를 Workflow args로 넘기고 stage prompt가 절대 경로를 제시한다. 스킬 본문의 lookup 블록은 "prompt에 경로가 없을 때만" 실행 (호출 1회 ≈ 10초 — 의식 호출 최소화 원칙).

- **상태 전환 전 항상 이슈 상세 fetch** (`jira_get_transitions` → `jira_transition_issue`에 transitionId 전달).

- **Context 파일**: 활성 작업 컨텍스트는 `.jira-context.json`(gitignored). 브랜치 패턴 `feature/<TASK-ID>`, 워크트리 위치 `../<project>_worktree/<TASK-ID>`.

- **Epic 스코프 파일**: `.jira-epic.json`(gitignored, 메인 레포 루트 1곳만 정본 — worktree에 복제하지 않음). `/jira-task epic`이 쓰고 `create`만 읽는다. 규약 단일 출처는 `skills/_shared/epic-scope.md`. `init`/`report`의 JQL에는 영향을 주지 않는다.

- **Progress 추적**: 각 스킬은 완료 시 `.jira-context.json`의 `completedSteps`에 자기 단계를 추가(중복 방지). 유효 단계: `discover`, `create`, `init`, `start`, `approach`, `impl`, `test`, `review`, `merge`, `pr`, `done`. `done`은 추가로 `status`를 `"Done"`으로 변경. Completion Summary의 Progress `✓`는 `completedSteps`에서 생성. (`plan`/`design`은 MAE-350에서 `approach`로 통합되어 제거됨; 기존 task의 stale 흔적은 마이그레이션 로직이 처리.)

- **Approach 문서에 코드 스니펫 금지** (토큰 낭비).

## JIRA_DEFAULT_PROJECT Scoping Rule

`JIRA_DEFAULT_PROJECT` 환경변수가 설정되어 있으면 **모든 JQL에 `project = <JIRA_DEFAULT_PROJECT>` 조건을 반드시 포함**. 스프린트/에픽 하위/관련 이슈 검색 등 예외 없음. init/report 등 JQL 쓰는 모든 스킬에 적용 (mcp-atlassian의 `JIRA_PROJECTS_FILTER`와 별개의 플러그인 자체 규칙).
