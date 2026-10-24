# CLAUDE.md

이 저장소는 Jira와 Claude Code 워크플로를 연동하는 **Claude Code 플러그인**(`jira-integration`)이다. 이 문서는 플러그인 자체를 **개발/유지보수**할 때 필요한 컨벤션을 다룬다. 최종 사용자 문서는 `README.md` 참고.

## 작업 원칙

- **Surgical Changes**: 요청과 직접 관련된 라인만 수정. 인접 코드 "개선"/포맷팅 변경 금지. 본인의 변경으로 생긴 orphan import/변수만 정리하고, 기존 dead code는 건드리지 않는다.
- **Simplicity First**: 요청되지 않은 추상화/설정 옵션/방어 코드 추가 금지. 스킬은 prompt 마크다운이므로 분량이 곧 토큰 비용이다.
- **버전 동기화**: 스킬/훅/스크립트/설정이 바뀌면 `.claude-plugin/plugin.json`의 `version`도 반드시 함께 올린다 (안 올리면 마켓플레이스 업데이트가 감지 안 됨). 같은 변경에서 `CHANGELOG.md`에 그 버전 섹션(Added/Changed/Fixed/Removed, 사용자 관점 한국어)을 추가한다. bump 없는 커밋은 `[Unreleased]`에 적고 다음 bump 때 그 버전으로 옮긴다.

## Repository Layout

- `skills/` — `/jira-task` SKILL.md 프롬프트 (단계별 1개)
- `commands/` — 슬래시 커맨드 정의
- `agents/` — 서브에이전트 정의 (jira-reviewer = verify 단계 검증 세션)
- `hooks/` — phase-gate 훅 + 동기화 스크립트 (`hooks/hooks.json` 자동 로드)
- `scripts/` — 공용 헬퍼 (`jira-attach.sh`, `jira-context-update.py`, dashboard 서버 등)
- `templates/` — 문서 템플릿 (`sdlc/` 표준 산출물·PR 양식 사본, requirements, report)
- `tests/` — 플러그인 테스트
- `docs/` — 내부 문서 (`mcp-atlassian-tools.md`, requirements/plan/design/test 산출물)

빌드/테스트 스크립트는 `package.json`의 scripts 참고.

## Jira 호출: `scripts/jira-cli.py` (v0.61.0+ 전 스킬)

모든 스킬은 **`scripts/jira-cli.py`**를 Bash로 호출한다 (MCP 도구 사용 금지) — 표준 라이브러리 REST(v2 + search는 v3 `search/jql`), 압축 JSON 출력, 코멘트는 markdown→wiki 변환. 규약·MCP 대응표: `skills/_shared/jira-cli.md`, 설계: `tasks/jira-cli-design.md`. 자격증명(v0.60.0): **메인 레포 `.jira-context.json`의 `jira` 블록** `{url, username, apiToken, project}`이 정본 — `jira-cli.py config set`으로 기록, worktree에서는 `--git-common-dir`로 메인 레포 파일을 찾아 읽으므로 복제 금지. 조회 순서: `jira` 블록 → 환경변수 → (레거시 폴백) MCP 설정 파일. 블록이 없을 때 뒤의 둘에서 찾으면 자동으로 블록에 기입하고 .gitignore 미등록이면 등록까지 한다(정보 알림). 스킬은 `jira` 블록을 출력·인용하지 않는다 (토큰 노출 경로 차단).

atlassian MCP 서버는 **선택**(`/jira setup --mcp`, 대화 중 ad-hoc 질의용)이며 플러그인 워크플로에는 쓰지 않는다. 레퍼런스: `docs/jira-cli.md` (구 `docs/mcp-atlassian-tools.md`는 선택 MCP용으로만 유지). 첨부 업로드는 `jira-cli.py attach`(`jira-attach.sh`는 호환 유지).

## Skill Authoring Conventions

- **Language Rule**: 모든 `/jira-task` 스킬 출력은 한국어. 사용자 응답·생성 문서·Jira 코멘트 본문 모두. 예외: 코드/변수명/브랜치명/파일명/명령어는 영어. Jira 코멘트의 섹션 제목(##, ###)은 영어, 내용은 한국어.

- **Markdown for Jira comments**: Jira 코멘트는 마크다운으로 작성.

- **Cache-First Fetch** (approach/test-write/impl/verify/done): 호출 직전 `.jira-context.json`의 `cachedIssue`를 먼저 확인.
  1. `cachedIssue.key === <TASK-ID>`이고 `fetchedAt`이 있으면 그 값 사용 → `jira-cli.py get` 호출 **생략**. 필드 목록은 따지지 않는다(`cachedIssue`는 항상 `get` 출력 전체).
  2. miss면 `jira-cli.py get <KEY> --fields subtasks,issuelinks > <파일>` 후 `jira-context-update.py <KEY> - - <worktree ctx> --cache-issue <파일>`로 저장 (LLM이 JSON을 직접 편집하지 않는다).
  3. 강제 새로고침은 사용자가 `cachedIssue`를 수동 삭제.
  4. `cachedIssue`는 **worktree-local context에만** 기록한다 — `tasks[]`가 있는 aggregate 파일 최상위에는 절대 기록 금지 (스키마 오염; `jira-context-update.py`가 발견 시 자동 제거).

- **공용 스크립트 lookup**: 워크트리 cwd에서는 플러그인 `scripts/`가 직접 보이지 않으므로 호출 직전 lookup으로 절대 경로를 결정한다. 단일 출처: `skills/_shared/script-lookup.md`. 각 스킬은 호출 직전 그 파일을 Read한 뒤 `SCRIPT_NAME` / `OUT_VAR`를 셋업하고 lookup 블록을 실행.
  - 첨부 업로드는 `jira-cli.py attach <KEY> <file> --artifact`(approach/verify — `<KEY>.<파일명>`으로 올리고 본인이 올린 같은 이름을 교체). `jira-attach.sh`는 호환 래퍼.
  - `jira-context-update.py` (start/approach/test-write/impl/verify/pr/done): worktree-local + aggregate `.jira-context.json` 두 개의 `completedSteps`/`status`/`<step>At`/`cachedIssue` 갱신.
    호출: `python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> <step> <status> <ctx-file> [<ctx-file>...]`.
    `status="-"`는 status/cachedIssue.status를 그대로 보존(Jira transition 없는 record-only 단계용). `--patch`로 `level`·`riskSignals`·`stackedOn`(aggregate에도 반영)과 `activeRole`·`planApproval` 등(worktree만)을 기록하고, 값이 `null`이면 키를 지운다. 표준 호출 스니펫: `skills/_shared/context-update.md`.
  - `sdlc-gate.py` (approach/test-write/pr/done/loop): 산출물 승인(`check <KEY> <intent|spec|plan>`)과 PR 상태(`pr-state <KEY>`)를 GitHub·git 사실로 판정한다. 승인을 LLM이 판단하지 않는다 — 스킬은 exit code와 JSON만 따른다. 승인 형식·판정 규칙은 스크립트 docstring, 설계는 `tasks/sdlc-alignment-design.md` §6.
  - `ensure-workflow-dir.py`(setup, auto 실패 시): 플러그인 설치 경로를 사용자 settings.json의 `permissions.additionalDirectories`에 등록. Workflow 도구가 `scriptPath`를 cwd·추가 디렉터리 안의 파일로 제한하므로 auto의 전제 조건이다.
  - 그 외: `propagate-mcp-config.sh`(init), `append-review-log-wrapper.sh`(verify), `cleanup-worktree-mcp.py`(done), `auto.workflow.js`(auto — Workflow `scriptPath`로 실행, bash 호출 아님), `auto-codex.js`(Codex auto — 같은 `auto.workflow.js`를 로드해 `agent()`를 단계마다 `codex exec`로 대신하는 runner, 사용자가 터미널에서 실행), `append-run-log.py`(auto — 실행 결과를 `docs/run-log/_index.jsonl`에 기록), `detect-lint.sh`(impl/verify/fix — 선언된 lint/format 도구 판정 1회 호출).
  - `clean-worktree.py`(clean): **worktree 삭제의 유일한 경로.** `git worktree remove`는 Windows에서 worktree 안의 junction/dir symlink를 따라 들어가 대상(메인 레포 `node_modules` → workspace 링크 → `packages/**`)까지 지운다 — `--force` 없이도, 실측 git 2.53 (2026-08-26). 스크립트는 링크를 먼저 끊고 0개 검증 후에만 git을 호출하며, 메인 레포 tracked 파일 소실을 사후 감지한다. 스킬·에이전트가 `git worktree remove`/재귀 삭제를 직접 실행하지 않도록 `hooks/scripts/guard-worktree-remove.js`(PreToolUse)가 Windows에서 Bash/PowerShell의 `git worktree remove`를 거부한다(macOS·Linux의 git은 링크를 따라가지 않으므로 허용). 회귀 테스트: `tests/test_clean_worktree_links.py`. dashboard `routes/cleanup.js`도 동일 순서.
  - **auto 경유 시 lookup 생략**: auto launcher가 `scriptsDir`를 Workflow args로 넘기고 stage prompt가 절대 경로를 제시한다. 스킬 본문의 lookup 블록은 "prompt에 경로가 없을 때만" 실행 (호출 1회 ≈ 10초 — 의식 호출 최소화 원칙).

- **상태 전환 전 항상 이슈 상세 fetch** (`jira_get_transitions` → `jira_transition_issue`에 transitionId 전달).

- **Context 파일**: 활성 작업 컨텍스트는 `.jira-context.json`(gitignored). 브랜치 패턴 `feature/<TASK-ID>`, 워크트리 위치 `../<project>_worktree/<TASK-ID>`.

- **Epic 스코프 파일**: `.jira-epic.json`(gitignored, 메인 레포 루트 1곳만 정본 — worktree에 복제하지 않음). `/jira-task epic`이 쓰고 `create`만 읽는다. 규약 단일 출처는 `skills/_shared/epic-scope.md`. `init`/`report`의 JQL에는 영향을 주지 않는다.

- **요구사항 문서 ↔ 티켓 연결**: 요구사항 문서가 내용의 정본이고, 티켓 description의 `Requirements:` 출처 줄과 문서 노드의 `[<KEY>]` 표기로 양방향 연결한다. `create --from-requirements`가 쓰고 `approach`가 읽는다. 규약 단일 출처는 `skills/_shared/requirements-link.md` — 스킬 본문에 형식을 다시 적지 않는다.

- **Progress 추적**: 각 스킬은 완료 시 `.jira-context.json`의 `completedSteps`에 자기 단계를 추가(중복 방지). 유효 단계: `discover`, `create`, `init`, `start`, `approach`, `test-write`, `impl`, `verify`, `pr`, `done` (v0.70.0 — `test`/`review`/`merge`는 폐지. `pr`은 사람이 draft를 풀어 리뷰를 요청한 시점). `done`은 worktree-local에 기록하고 **aggregate에서는 항목을 제거**한다 (완료 태스크를 큐 파일에 누적하지 않음 — 이력은 run-log/review-log). 기존 누적분은 `jira-context-update.py --prune-done <aggregate>`로 일괄 정리. Completion Summary의 Progress `✓`는 `completedSteps`에서 생성. (`plan`/`design`은 MAE-350에서 `approach`로 통합되어 제거됨; 기존 task의 stale 흔적은 마이그레이션 로직이 처리.)

- **SDLC 표준 정합 (v0.70.0)**: 전사 표준 `mzd-software-development-standard/00-ai-native-sdlc-process`를 따른다. 설계·결정: `tasks/sdlc-alignment-design.md`.
  - 등급은 start가 확정해 context `level` + Jira 라벨 `sdlc-L1|L2|L3`에 기록한다(단일 출처 `skills/_shared/sdlc-level.md`). 이후 단계는 issuetype으로 등급을 추정하지 않는다. create/discover의 분해 형태는 `single`/`story`/`tree`로 등급과 이름을 나눈다.
  - 산출물은 사용자 레포 `work/<KEY>/`(intent·spec·plan·evidence)에 커밋하고 Jira에는 사본을 첨부한다. 양식은 `templates/sdlc/`의 표준 사본 — 고치지 말고 표준이 바뀌면 통째로 교체한다.
  - 역할 분리: test-write(`test-writer`) / impl(`implementer`) / verify(`verifier`)는 서로 다른 세션이고, context `activeRole`을 `hooks/scripts/guard-test-files.js`가 읽어 쓰기를 막는다.
  - 에이전트는 승인하지 않는다: `APPROVE <artifact> <sha>` 줄은 jira-cli와 `guard-approval.js`가 거부한다. draft 해제·머지는 사람. 로컬 병합 없음. PR 생성·본문 규약은 `skills/_shared/pr-body.md`.
  - 커밋은 단계가 만든 파일만 명시적으로 add한다(`git add -A` 금지).

- **산출물(spec·plan 등)에 코드 스니펫 금지** (토큰 낭비).

- **harness 중립 (v0.71.0)**: 같은 원본을 Codex에도 설치한다(`tasks/harness-adapter-design.md`). 스킬은 첫 줄에서 `skills/_shared/conventions.md`(언어, TASK-ID 감지, Cache-First, harness 차이)를 읽는다. harness마다 다른 동작(질문 도구, scratchpad, 다음 단계 안내 문법, 작성 도구 기록, auto·loop 지원)은 그 표에만 쓰고 스킬을 harness별로 나누지 않는다. SKILL.md 본문의 `${CLAUDE_PLUGIN_ROOT}`는 Claude Code에서만 치환되므로 스크립트 경로는 `script-lookup.md`의 `PLUGIN_ROOT`로 찾는다. guard hook은 Codex 입력(`Bash`에 PowerShell 명령, 편집은 `apply_patch` 패치 본문)도 판정한다.

## JIRA_DEFAULT_PROJECT Scoping Rule

`JIRA_DEFAULT_PROJECT` 환경변수가 설정되어 있으면 **모든 JQL에 `project = <JIRA_DEFAULT_PROJECT>` 조건을 반드시 포함**. 스프린트/에픽 하위/관련 이슈 검색 등 예외 없음. init/report 등 JQL 쓰는 모든 스킬에 적용 (mcp-atlassian의 `JIRA_PROJECTS_FILTER`와 별개의 플러그인 자체 규칙).
