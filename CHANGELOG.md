# Changelog

`jira-integration` 플러그인의 주요 변경 이력입니다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다. 자잘한 패치가 이어진 구간은 버전 범위로 묶어 요약했습니다.

## [Unreleased]

## [0.72.1] - 2026-10-24

### Changed
- README Codex 절에 auto 사용 순서(등급 확정 → 터미널에서 runner → 승인 후 재실행)와 사용량을 적었다.

### Fixed
- `git worktree remove` 차단 hook(`guard-worktree-remove.js`)이 Windows에서만 동작한다. junction을 따라 들어가 메인 레포를 지우는 문제는 Windows 동작이라 macOS·Linux에서는 명령이 안전한데도 막고 있었고, 대안인 `clean-worktree.py`는 `<TASK-ID>` worktree만 다뤄 다른 worktree는 지울 방법이 없었다.

## [0.72.0] - 2026-10-20

### Added
- Codex에서 auto 실행: `scripts/auto-codex.js` runner가 Claude Code와 같은 `auto.workflow.js`를 단계마다 새 `codex exec` 세션으로 돌린다. worktree 터미널에서 `node <scriptsDir>/auto-codex.js <KEY>`로 실행하고, `$jira-task-auto`는 이 명령을 안내한다. 옵션은 `--model`, `--bypass-hook-trust`.
- `CHANGELOG.md`를 추가했다(0.1.0부터의 이력).

### Changed
- 지원 harness를 Claude Code·Codex 두 가지로 명시하고 Copilot은 계획으로만 남겼다. README에 v0.71 변경 요약과 Codex auto 사용법을 반영했다. loop·대시보드는 계속 Claude Code 전용이다.

### Fixed
- `/jira-task verify`가 검증 diff를 로컬 main이 아니라 `origin/<Base>` 기준으로 계산한다. 오래된 로컬 main과 비교해 다른 작업의 커밋을 범위 밖 변경으로 보고하던 문제를 고쳤다.
- 역할 보호 hook(`guard-test-files.js`)이 Edit·`apply_patch`로 저장소 밖 임시 파일을 쓰는 것까지 막아 verify가 PR 본문 파일(`--body-file`)을 쓰지 못하던 문제를 고쳤다. 셸 명령과 같이 저장소 밖 경로는 판정하지 않는다.

### Removed
- Stop hook `stop-sync.js`를 제거했다. 출력 규격에 없는 키를 내보내 Claude Code에서는 효과가 없었고, Codex에서는 세션마다 hook 실패로 기록됐다.

## [0.71.0] - 2026-10-17

### Added
- Codex 지원: 같은 원본을 Codex에도 설치한다. 스킬 공용 규약을 `skills/_shared/conventions.md`(언어, TASK-ID 감지, Cache-First, harness 차이 표)로 모았고, 질문 도구가 없으면 텍스트로 묻는다.
- 테스트 보호 hook이 Codex의 `apply_patch` 편집도 판정한다.
- `loop`·`pr`·`done`: 먼저 머지된 PR과 충돌하는 열린 PR을 `base-conflict`로 격리하고 해결 절차(rebase → 역할별 수정 → 재검증)를 안내한다. `sdlc-gate.py pr-state`에 `mergeable`을 추가했다.
- `jira-context-update.py`에 `--cache-issue`, `--remove-step` 옵션을 추가했다.

### Changed
- 산출물 승인을 SHA 이력이 아니라 산출물 내용으로 판정한다. rebase로 승인 SHA가 이력에서 빠져도 spec·plan 내용이 같으면 승인이 유지된다.
- `approach`는 미결 질문이 남은 spec·plan에 승인 요청 대신 질문을 남기고, 받은 답을 spec 결정 사항에 기록한 뒤 승인을 요청한다.
- `start`는 등급 확정 전에 담당자 지정·상태 전이를 하지 않는다. `cachedIssue` 캐시 hit 조건을 `key` + `fetchedAt`으로 통일했다.
- review-log·run-log를 메인 레포 로컬 관측 데이터로 바꾸고 `init`이 `docs/review-log/`·`docs/run-log/`를 `.gitignore`에 등록한다.
- `auto` triage 기준을 "미충족 2건 이상이면서 30% 초과, 또는 Critical 3건 이상"으로 조정해 AC가 적은 작업도 fix 루프에 들어간다.

### Fixed
- context 파일이 없을 때 `jira-context-update.py`가 조용히 성공(rc=0)하던 문제를 exit 1로 고쳤다.
- 스크립트 lookup이 구버전 플러그인 캐시를 잡던 문제를 고쳐 지금 로드된 플러그인을 먼저 찾는다.
- Windows Git Bash의 MSYS 경로(`/c/...`, `/tmp/...`)를 Python이 열지 못해 context 갱신·review-log가 실패하던 문제를 고쳤다.
- rebase로 test 커밋 SHA가 바뀌면 verify가 Critical로 오판하던 문제, delta 재검증 뒤 PR 본문 검증 절이 갱신되지 않던 문제를 고쳤다.

## [0.70.0] - 2026-10-16

### Added
- 전사 SDLC 표준(`00-ai-native-sdlc-process`) 정합. `start`가 등급(L1/L2/L3)을 판정·확정해 context `level`과 Jira 라벨 `sdlc-L1|L2|L3`에 기록한다.
- `sdlc-gate.py`: PR 코멘트 `APPROVE <artifact> <sha>`로 산출물 승인과 PR 상태를 판정한다.
- `approach`: 표준 산출물(intent·spec·plan)을 `work/<KEY>/`에 작성하고 draft PR로 승인을 요청한 뒤 멈춘다. 양식은 `templates/sdlc/`.
- `test-write` 단계 신설: plan 승인 확인 후 AC별 실패 테스트를 먼저 커밋한다.
- 역할 분리 hook: `guard-test-files.js`(implementer는 테스트 파일, verifier는 evidence 밖 쓰기 차단), `guard-approval.js`(에이전트의 승인 토큰 작성 차단).

### Changed
- `review`를 수용 조건별 검증 `verify`로 교체했다. L2·L3는 `work/<KEY>/evidence/verification.md`를 커밋하고, draft 해제는 사람이 한다.
- `pr`은 PR 상태 기반으로 Jira에 반영하고, `done`은 GitHub에서 머지를 확인한 뒤에만 완료 전이한다.
- `auto`는 다음 사람 게이트까지만 진행하고, `loop`는 prep/plan/build/sync 패스와 stacked PR 재정렬로 재구성했다.
- `create`·`discover`의 분해 형태 이름을 `single`/`story`/`tree`로 바꿔 등급과 구분했다.
- 첨부·대시보드 자격증명을 `.jira-context.json`의 `jira` 블록 기준으로 조회한다.

### Removed
- `test` 스킬, 로컬 병합(`jira-local-merge` 스킬·`merge` 명령), 구 PR 템플릿을 폐지했다.
- `session-start`가 프로젝트 `.claude/settings.json`에 권한을 자동 추가하던 동작을 제거했다.

## [0.64.2] - 2026-09-29

### Fixed
- `jira-attach.sh`가 `.jira-context.json`의 `jira` 블록 자격증명을 읽지 못하던 문제. `jira-cli.py attach`에 위임하는 래퍼로 바꿨다.

## [0.64.1] - 2026-09-20

### Fixed
- SessionStart hook의 미지원 키 `once`를 제거해 세션 시작 경고를 없앴다.

## [0.64.0] - 2026-09-20

### Added
- 요구사항 문서와 티켓을 양방향으로 연결한다. `approach`가 제목 유사도 대신 연결 정보로 입력 요구사항 문서를 확정한다.

## [0.63.0] - 2026-09-17

### Added
- `approach`가 Jira 첨부 이미지·PDF·텍스트를 내려받아 읽고 References·Open Items에 반영한다. `jira-cli.py`에 `download` 서브커맨드를 추가했다.

## [0.62.2] - 2026-09-10

### Fixed
- 대시보드가 꺼져 있을 때 ingest hook이 매번 연결을 시도해 지연·타임아웃 경고를 내던 문제.

## [0.62.1] - 2026-09-03

### Fixed
- Workflow `scriptPath` 경로 제한으로 `auto`가 실행되지 않던 문제. `ensure-workflow-dir.py`가 플러그인 설치 경로를 `permissions.additionalDirectories`에 등록한다.

## [0.62.0] - 2026-08-26

### Fixed
- Windows에서 `git worktree remove`가 worktree 안의 junction을 따라 들어가 메인 레포 소스까지 지우던 문제. `clean-worktree.py`가 링크를 먼저 끊고 검증한 뒤 삭제하며, `guard-worktree-remove.js` hook이 직접 실행을 막는다.

## [0.61.2] - 2026-08-23

### Fixed
- `jira-cli.py search`의 project 조건 자동 삽입이 `ORDER BY`를 괄호 안에 넣던 문제.

## [0.61.1] - 2026-08-23

### Changed
- `done`이 aggregate `.jira-context.json`에서 완료 항목을 제거한다. 기존 누적분은 `--prune-done`으로 일괄 정리한다.

## [0.61.0] - 2026-08-23

### Changed
- 모든 스킬의 Jira 호출을 MCP에서 `jira-cli.py`로 전환했다. atlassian MCP는 선택(`/jira setup --mcp`)이 됐다.
- `/jira setup`을 `jira-cli config set` 기반 워크스페이스 자격증명 위자드로 다시 만들고 레거시 설정을 자동 이관한다.
- 자격증명 자동 기입 시 `.gitignore`에 없으면 등록까지 한다.

## [0.60.1] - 2026-08-23

### Added
- `jira` 블록이 없으면 환경변수·레거시 MCP 설정에서 자격증명을 찾아 메인 레포 `.jira-context.json`에 자동 기입한다.

## [0.60.0] - 2026-08-23

### Added
- 자격증명을 워크스페이스 단위로 관리한다. 메인 레포 `.jira-context.json`의 `jira` 블록이 정본이고, worktree는 메인 레포 파일을 읽는다. `config set/show` 서브커맨드 추가.

## [0.59.0] - 2026-08-23

### Added
- `scripts/jira-cli.py`: atlassian MCP를 대체하는 표준 라이브러리 REST CLI. 압축 JSON 출력, markdown→wiki 코멘트 변환, `JIRA_DEFAULT_PROJECT` JQL 자동 삽입을 지원하고 일부 스킬부터 전환했다.

## [0.58.0] - 2026-08-23

### Changed
- `auto` stage agent의 반복 의식 호출(lookup, self-check 기록, 재-Read 등)을 줄였다. launcher가 `scriptsDir`를 한 번 해석해 넘기고, `jira-context-update.py --patch`로 기록을 한 번에 처리한다.
- README를 두 루프 모델·Jira 연계 모델·운영 규칙 중심으로 다시 썼다.

## [0.57.0] - 2026-08-23

### Added
- run-log 스키마 문서 `docs/run-log/README.md`.

### Fixed
- Windows에서 한국어가 담긴 JSON을 stdin으로 넘길 때 인코딩 오류가 나던 문제. loop의 init→start 간격은 `queueWaitSec`로 분리해 단계 소요와 구분한다.

## [0.56.0] - 2026-08-23

### Fixed
- `loop`의 worktree 진입을 Bash `cd` 대신 `EnterWorktree`/`ExitWorktree`로 바꿔 stage agent가 메인 cwd를 보던 문제를 고쳤다.

## [0.55.0] - 2026-08-23

### Changed
- `loop`가 태스크 하나의 실패(게이트 미통과, 단계 실패, merge·rebase 충돌)를 격리하고 다음 태스크를 계속 진행한 뒤 예외 리포트를 낸다. 시스템 실패로 판정될 때만 전체를 멈춘다.

## [0.54.0] - 2026-08-23

### Changed
- `auto` fix loop를 lint/typecheck/관련 테스트만 도는 inner loop와 직전 지적만 재검증하는 delta 재리뷰로 재구성했다. 수렴하지 않으면 `fix_unconverged`로 멈춘다.

## [0.53.0] - 2026-08-23

### Added
- `append-run-log.py`: `auto` 실행 결과를 `docs/run-log/_index.jsonl`에 단계 소요시간과 함께 기록한다.

## [0.52.1] - 2026-08-23

### Fixed
- Windows checkout의 CRLF 때문에 `*.workflow.js`가 Workflow 승인에서 거부되던 문제(`.gitattributes`로 LF 고정).
- impl+test sub-agent가 스킵된 test를 임의로 실행하던 문제, L1 리뷰가 opus로 승격되던 문제.

## [0.52.0] - 2026-08-23

### Changed
- `auto` 오케스트레이션을 Workflow 스크립트 `scripts/auto.workflow.js`로 옮겼다. 단계 순서·게이트·triage·fix loop가 결정론적으로 동작하고, SKILL.md는 얇은 launcher가 됐다.

## [0.51.0] - 2026-08-17

### Added
- `impl` 종료 직전 Self-Check(Plan 대조 + lint 1회)를 추가하고 결과를 `implSelfCheck`에 기록한다.

### Changed
- lint는 1회만 돌리고, L1 리뷰는 sonnet으로 수행한다.

## [0.50.0] - 2026-08-15

### Fixed
- `review`가 정상 구현을 반복해서 Request Changes로 판정하던 오탐 7건을 고치고, `auto` triage를 구조화해 근거 없는 fix loop를 줄였다.

## [0.49.0] - 2026-08-07

### Added
- 프로젝트 Epic 스코프(`.jira-epic.json`)를 고정하는 `/jira-task epic`. 스코프가 있으면 `create`가 새 이슈를 그 Epic 아래에 만든다.

## [0.48.0] - 2026-08-05

### Fixed
- 서브태스크 크기 산정을 파일군 기준으로 바꿔 0.47.1의 과분해 가드가 실제로 동작하게 했다.

## [0.47.1] - 2026-08-04

### Fixed
- `discover`가 FR 개수만큼 서브태스크를 만들어 과분해하던 문제를 세 지점에서 막았다.

## [0.47.0] - 2026-06-14

### Changed
- 대시보드: loop/auto sub-agent의 활동을 해당 worktree 카드로 라우팅한다.

## [0.46.0] - 2026-06-12

### Added
- `/jira-task loop`: init된 태스크 큐를 순차로 소진하는 태스크 단위 오케스트레이터.

### Fixed
- aggregate `.jira-context.json`의 스키마 오염(`cachedIssue` 최상위 기록)을 자동으로 치유한다.

## [0.45.3] - 2026-06-07

### Changed
- `jira-reviewer`가 증거를 직접 확인한 항목만 충족으로 표시하고, 미확인 항목은 Request Changes로 처리한다.

## [0.45.2] - 2026-06-01

### Fixed
- `auto`가 impl+test와 review를 병렬로 띄워 미완성 코드를 리뷰하던 문제.

## [0.45.1] - 2026-05-31

### Added
- `start`가 실행한 사용자를 담당자로 자동 지정한다.

## [0.45.0] - 2026-05-30

### Changed
- `auto`의 impl과 test를 하나의 sub-agent로 묶어 컨텍스트 재구성 비용을 줄였다.

## [0.44.9] - 2026-05-30

### Added
- `auto`에서 사용자가 "test 스킵"처럼 단계를 명시해 건너뛸 수 있다.

### Changed
- `jira-local-merge`가 미커밋 변경을 질문 없이 커밋하고 `--no-ff`로만 병합한다.

## [0.44.8] - 2026-05-30

### Changed
- phase-gate가 L1에서는 차단 대신 권고(advisory)로 동작한다.

## [0.44.6] - 2026-05-30

### Changed
- L1/L2/L3 등급별 산출물·검증 수준을 `impl`·`test`·`review`까지 확장했다.

## [0.44.5] - 2026-05-24

### Changed
- 대시보드 analytics의 스페이스 선택기를 dropdown으로 바꾸고 최근 추가순으로 정렬한다.

## [0.44.4] - 2026-05-24

### Added
- `start`가 worktree를 만든 뒤 atlassian MCP 설정을 전파한다.

## [0.44.3] - 2026-05-24

### Fixed
- 대시보드 analytics의 스페이스 탐지·집계 정합성과 자격증명 경로 해석을 고치고 뷰를 다시 디자인했다.

## [0.44.2] - 2026-05-22

### Added
- 대시보드 analytics: cycle/lead time, 사람별 처리량, aging WIP, SDLC 퍼널, 에이전트 처리량, priority·epic 분포.

### Fixed
- 좁은 카드에서 SDLC stepper가 잘리던 문제, busy/awaiting 카드 상태가 잘 보이지 않던 문제.

## [0.44.0] - 2026-05-21

### Added
- 대시보드 analytics 데이터 파이프라인: 스페이스 탐지, JQL 수집기, SQLite/JSON 저장소, 상태·처리량 차트.

## [0.43.1] - 2026-05-21

### Changed
- 대시보드 header/footer를 캔버스와 시각적으로 분리했다.

## [0.43.0] - 2026-05-21

### Changed
- 대시보드 UI를 라이트 테마로 다시 디자인했다.

## [0.42.1 – 0.42.2] - 2026-05-21 ~ 2026-05-21

### Fixed
- busy/awaiting 상태의 활성 세션 카드에서 텍스트와 ActivityPanel이 밝은 배경 위에서 보이지 않던 문제(CSS 적용 순서).

## [0.42.0] - 2026-05-20

### Changed
- `approach`가 고정 섹션 대신 작업이 실제로 건드리는 설계 차원만 다뤄, 데이터 모델·트랜잭션 경계 같은 비가역 결정을 코딩 전에 정한다.

## [0.41.1 – 0.41.2] - 2026-05-19 ~ 2026-05-19

### Fixed
- hook payload의 `tool_name`이 객체로 오거나 `cachedIssue`에 Jira 응답 객체가 그대로 저장되면 대시보드가 깨지던(React #31) 문제.

## [0.41.0] - 2026-05-19

### Fixed
- 대시보드가 `workspaces.json` 변경을 재시작 전까지 반영하지 못하던 문제. 파일 변경을 감시해 바로 반영한다.

## [0.40.0] - 2026-05-15

### Added
- 대시보드 SessionCard에도 busy/awaiting 상태를 표시한다.

## [0.39.0] - 2026-05-14

### Fixed
- 0.38.0의 PreToolUse 기반 awaiting 추정을 제거하고 Notification 기반으로 되돌렸다. 느린 도구마다 응답 대기로 표시되던 오탐 때문이다.

## [0.38.0] - 2026-05-14

### Changed
- 대시보드 "응답 대기" 표시가 늦게 켜지는 문제를 PreToolUse 기반 조기 감지로 보정했다.

## [0.37.0] - 2026-05-13

### Changed
- `start`/`approach`/`impl`/`test`/`review`의 context 갱신을 `jira-context-update.py`로 통일했다. `-` status로 상태를 보존하는 기록 전용 호출을 지원한다.

## [0.36.0] - 2026-05-13

### Fixed
- 대시보드가 워크스페이스 하위 디렉터리에서 자격증명을 찾지 못하던 문제, 정리 대상 worktree가 이미 사라졌을 때의 처리.

## [0.35.0] - 2026-05-13

### Fixed
- 대시보드에서 종료된 sub-agent가 계속 active로 남던 문제, Last response가 실시간으로 갱신되지 않던 문제.

## [0.34.0] - 2026-05-07

### Fixed
- L3 Epic에 child가 없으면 `approach`가 빈 시퀀싱 표를 만들지 않고 분해를 안내한다.
- `auto` SKILL.md의 임계값 출처와 흐름을 정리했다.

## [0.33.1 – 0.33.2] - 2026-05-07 ~ 2026-05-07

### Fixed
- `impl`이 구 plan/design 경로를 참조해 `docs/approach/<TASK-ID>.approach.md`를 읽지 않던 문제(0.33.1). `start`·`auto`에 남아 있던 plan/design 참조도 정리했다.

## [0.33.0] - 2026-05-07

### Removed
- `jira-task-plan`·`jira-task-design` 스킬과 `plan`·`design` 템플릿을 제거했다. 해당 단계는 `approach`로 통합됐다.

## [0.32.38] - 2026-05-07

### Added
- phase-gate를 `approach` 기준으로 재배선했다.
- 기존 plan/design 진행 기록을 `approach`로 인정하는 마이그레이션(`jira-context-update.py --migrate-approach`)과 `plan`/`design` alias를 추가했다.

## [0.32.37] - 2026-05-06

### Added
- `/jira-task approach`: plan과 design을 하나로 합친 단계. 작업 규모(L1/L2/L3)에 따라 분량을 조절한다.

### Changed
- 라우팅·`auto`·`report`·대시보드의 단계 목록을 `approach` 기준으로 갱신했다.

## [0.32.36] - 2026-05-06

### Added
- `create --from-requirements`가 Single·Story·Tree 세 가지 분해 형식을 읽는다.

## [0.32.35] - 2026-05-06

### Changed
- `discover`가 반복 인터뷰(최소 4, 최대 10라운드)로 요구사항을 모으고, 3단계 분해와 Technical Approach Hint를 제안한다.

## [0.32.18 – 0.32.34] - 2026-05-04 ~ 2026-05-05

### Added
- 대시보드 Claude Sessions 섹션(SessionCard)과 WorktreeCard 활성 뱃지(0.32.30). SessionStart/SessionEnd hook을 ingest에 연결하고, worktree와 무관한 cwd는 `session_id` 기반 session 항목으로 관리한다(5분 TTL, SessionEnd 시 즉시 제거).
- `start`가 이슈 정보를 보고 생략할 수 있는 단계를 권고하고, `auto`가 그 권고를 반영한다(0.32.21).

### Changed
- 스킬 구조 정리: 인라인 스크립트를 `scripts/`로 분리, 공용 스크립트 lookup을 `skills/_shared/script-lookup.md`로 단일화, 상태 전이 확인 절차를 `skills/_shared/transition-verify.md`로 공유, review/auto의 긴 설명은 `refs/`로 분리했다.
- `discover`가 분해 형식을 Tree로 강제하지 않고 작업에 맞게 Tree/Single을 고른다.
- plan/design/review의 Jira 코멘트를 두 줄 요약으로 줄이고 상세는 첨부 문서로 넘긴다(0.32.33).
- 대시보드 UI 다듬기(빈 상태 카드 중앙 배치, footer 플러그인 버전 표시, blocked 표시를 corner badge로 단순화).

### Fixed
- 그래프 뷰가 간헐적으로 비거나 노드가 다시 배치되던 문제, 엣지가 꼬이고 교차하던 문제(blocks 의존을 계층 깊이에 반영, parent/epic과 blocks 핸들 분리, 부모-자식 세로 정렬).
- worktree 수집기가 `cachedIssue`를 덮어써 관계 데이터가 주기적으로 사라지던 문제.
- SessionCard의 blocked 뱃지 텍스트가 보이지 않던 문제, 취소된 도구가 계속 실행 중으로 표시되던 문제.

## [0.32.1 – 0.32.17] - 2026-05-03 ~ 2026-05-04

### Added
- 대시보드 멀티 워크스페이스 운영(0.32.3): workspace registry 영속화, `dashboard-control.sh`로 여러 워크스페이스 등록·연결, hook ingest의 longest-prefix 매칭, 카드 뷰의 workspace 단위 묶음, 로그의 workspace 식별자.
- `scripts/jira-context-update.py`: worktree-local과 aggregate context를 함께 갱신하는 공용 스크립트. done/merge에 먼저 적용했다(0.32.12).

### Changed
- `impl`은 테스트를 쓰지 않고 테스트 책임을 `test`로 일원화했다. design은 템플릿 복사 후 치환 방식으로 작성하고, plan/design 템플릿은 줄였다.
- init 직후 `start`는 post-init 모드로 중복 작업을 건너뛰고, merge/pr 이후 `done`은 git 호출 없이 기존 기록으로 변경 요약을 만든다.
- `auto`의 review 이중 nesting을 제거하고 scope shortfall triage를 추가했다.
- 대시보드 UI 다듬기(빈 상태 화면 카드화).

### Fixed
- Windows에서 대시보드 hook 페이로드의 한글이 깨지던 문제(argv 대신 stdin 전달), hook cwd와 worktree 경로 구분자가 달라 매칭이 실패하던 문제.
- `cachedIssue` 갱신이 타임존 파싱 때문에 막히던 문제, `cachedIssue.status`를 Jira에서 확인한 값으로 갱신하지 않던 문제, `plan`에 Cache-First가 빠져 있던 문제, merge 타임스탬프에 타임존이 없던 문제.
- 메인 레포에서 `done`을 실행하면 worktree-local context에 `done`이 기록되지 않던 문제, sub-agent 환경에서 `review`를 실행할 수 없던 문제(self-mode 추가).
- 스크립트 lookup이 오래된 플러그인 캐시 버전을 잡던 문제, 대시보드가 stale registry 항목을 primary workspace로 잡던 문제.

## [0.32.0] - 2026-05-03

### Changed
- 스킬 description을 압축해 매 턴 로드되는 토큰을 줄였다.

## [0.31.0] - 2026-05-02

### Added
- 대시보드 그래프 뷰: 카드/그래프 토글, force-directed 계층 레이아웃, 관계별 엣지(blocks/parent/epic), status·assignee 필터, 고립 노드·순환 의존 표시, 렌더 오류 시 카드 뷰 fallback.
- 완료된 worktree 카드의 정리 버튼.
- `cachedIssue`에 parent·epic 정보를 보존한다.

### Fixed
- blocks/blockedBy 방향이 뒤집혀 있던 문제, 카드의 blocks 정보가 갱신 때 사라지던 문제, 카드 스크롤이 버벅이던 문제.

## [0.30.1] - 2026-05-02

### Fixed
- 이벤트가 몰리면 카드의 Last prompt/Last response가 비던 문제.

## [0.30.0] - 2026-05-02

### Added
- 대시보드 카드에 blocker 표시(blocked 배지와 강조 stripe).

## [0.29.1 – 0.29.2] - 2026-05-02 ~ 2026-05-02

### Fixed
- `CLAUDE_PLUGIN_ROOT`가 없는 셸에서 `/jira dashboard`가 실패하던 문제.
- 매핑되지 않은 세션 카드에 실제 cwd와 디렉터리명을 표시한다.

## [0.29.0] - 2026-05-02

### Added
- `/jira dashboard`: 대시보드 셋업·기동·중지·상태 확인을 한 명령으로 처리한다.

## [0.28.1 – 0.28.4] - 2026-05-02 ~ 2026-05-02

### Added
- LIVE 칩에 다음 polling까지의 진행률을 표시하고 서버 수집 주기와 맞췄다.

### Changed
- SDLC stepper에 skipped 상태를 추가했다.
- 대시보드 UI 다듬기(단계 chip 가독성, priority dot 제거, 헤더 여백).

## [0.28.0] - 2026-05-01

### Changed
- 대시보드 UI 개편: sticky header, fixed footer, 정렬·필터, SSE 자동 재연결 보강.

## [0.27.2 – 0.27.7] - 2026-05-01 ~ 2026-05-01

### Added
- 대시보드 카드의 busy/awaiting/stale 상태 표시, Jira 상태 배지 분리, 응답 결론 줄 표시(0.27.2).

### Changed
- README 대시보드 섹션을 카드 상태 표시와 hook 구성에 맞춰 갱신했다.

### Fixed
- 사용자가 응답한 뒤에도 blocked/awaiting 상태가 풀리지 않던 문제.
- 응답 미리보기가 결론 대신 도구 사용 전 안내 문구나 박스 그리기 문자 구분선을 잡던 문제, Stop hook이 transcript 기록보다 먼저 실행돼 잘못된 응답을 잡던 문제.

## [0.26.0] - 2026-05-01

### Added
- Stop hook으로 마지막 응답 미리보기를 카드에 표시한다.

## [0.25.2 – 0.25.5] - 2026-05-01 ~ 2026-05-01

### Added
- 대시보드 카드에 status/priority 컬러 배지와 SDLC stepper(0.25.2). stepper는 단계명·아이콘 chip 형태로 흐름을 보여준다.

### Changed
- 대시보드 웹 빌드 산출물을 git에서 제외하고 빌드 절차를 README에 적었다.
- 대시보드 UI 다듬기(카드·WorktreeCard 레이아웃, 타이포그래피, 모션 효과).

### Fixed
- 서버와 hook forwarder의 기본 포트가 달라 ingest가 실패하던 문제. 8765로 통일했다.
- Jira 한국어 상태값 "검토 중"이 배지 색에 매칭되지 않던 문제.

## [0.25.1] - 2026-05-01

### Added
- 대시보드 React UI(카드 그리드, 활동 패널), `npm run dashboard` 기동과 자동 브라우저 열기.

### Fixed
- 대시보드 cold start 시 `cachedIssue`가 채워지지 않던 문제, `done`이 `cachedIssue`를 갱신하지 않던 문제.

## [0.25.0] - 2026-04-30

### Added
- 실시간 대시보드의 기반: worktree·git·Jira 수집기와 상태 저장소, Claude Code hook 이벤트를 받는 ingest 파이프.

## [0.24.0] - 2026-04-30

### Changed
- 주요 스킬의 상세 절차를 `skills/<name>/refs/`로 분리하는 리팩터링을 마무리했다.

## [0.23.1 – 0.23.2] - 2026-04-30 ~ 2026-04-30

### Changed
- `jira-task-discover` SKILL.md를 538줄에서 236줄로, `jira-task-create` SKILL.md를 694줄에서 249줄로 줄였다. discover는 `templates/requirements.template.md`를 단일 출처로 삼는다.

## [0.23.0] - 2026-04-30

### Added
- 스킬 리팩터링용 회귀 검증 체크리스트 템플릿.

### Changed
- `review`·`init` SKILL.md를 줄였다. review-log 기록은 `scripts/append-review-log.py`로 분리했다.

### Removed
- 플러그인과 무관한 문서와 dogfooding 산출물을 저장소에서 정리했다.

## [0.22.1] - 2026-04-29

### Added
- `scripts/analyze-review-log.py`: 누적 review 통계(횟수, 심각도 분포, 카테고리 빈도, FP 비율)를 출력한다.

### Fixed
- Reviewer Calibration Log의 견고성 보강과 UTC 타임스탬프.

## [0.22.0] - 2026-04-29

### Added
- Reviewer Calibration Log: `review` 결과를 `docs/review-log/`에 기록하고 민감 정보를 redact한다.

## [0.21.1] - 2026-04-29

### Changed
- `auto`의 plan 단계 모델을 sonnet에서 opus로 올렸다.

## [0.21.0] - 2026-04-29

### Changed
- `auto`가 6개 단계를 다시 sub-agent에 위임하고 단계별로 모델을 다르게 쓴다.

## [0.20.0] - 2026-04-29

### Changed
- `discover` 요구사항 템플릿에 Goals↔FR 매핑, 제약 4종 분리, NFR 표를 추가했다.

## [0.19.0] - 2026-04-29

### Changed
- design 템플릿에 결정 근거 기록과 plan과의 양방향 추적을 추가했다.

## [0.18.0] - 2026-04-29

### Changed
- plan 템플릿에 discover 산출물 연결과 결정 근거 기록을 추가했다.
- `.claudeignore`로 탐색 노이즈를 줄였다.

## [0.17.11 – 0.17.20] - 2026-04-28 ~ 2026-04-28

### Added
- phase-gate(0.17.12): 단계 의존 그래프(`hooks/scripts/phase-gate.config.json`)를 기준으로 단계 스킬 호출 전에 선행 단계와 산출물을 확인하는 PreToolUse hook. 우회 수단(환경변수, context 플래그)과 시나리오 테스트를 함께 넣었고, README에 실험적 기능이며 기본 비활성화라는 점과 활성화 방법을 적었다.
- design·test-report·review·pr-description 템플릿. plan 템플릿의 섹션 규약을 통일하고 스킬들의 인라인 섹션 정의를 템플릿 참조로 바꿨다.

### Changed
- `review`를 항상 `jira-reviewer` subagent(opus)에 맡겨 구현한 세션이 자기 코드를 리뷰하지 않게 했다(0.17.19).

### Fixed
- `clean`이 메인 레포의 aggregate `.jira-context.json`을 통째로 지우던 문제.

### Removed
- 쓰이지 않던 `jira-planner`·`jira-reporter` agent를 삭제했다.

## [0.17.1 – 0.17.10] - 2026-04-27 ~ 2026-04-28

### Added
- Cache-First: `start`·`plan`이 가져온 이슈를 `cachedIssue`에 저장하고 이후 단계는 이를 재사용한다(0.17.4).
- `discover --from` 모드에서 기존 자료 간 충돌을 찾아 Open Questions에 넣는다.

### Changed
- `auto`가 sub-agent 위임 없이 부모 컨텍스트에서 단계 스킬을 직접 호출한다(0.21.0에서 되돌림).
- 16개 스킬의 Language Rule 블록을 한 줄 참조로 바꾸고, 네 스킬에 중복돼 있던 첨부 업로드 블록을 `scripts/jira-attach.sh`로 모았다.
- 문서 정리: CLAUDE.md 문서 목록·워크플로 그래프 갱신, 요구사항 템플릿 placeholder 구체화, README 워크플로 다이어그램에 discover 추가, `/jira-local-merge` 표기를 `/jira-task merge`로 통일.

### Fixed
- `init`이 프로젝트 `.mcp.json`을 worktree에 우선 복사하고, user scope로 등록한 MCP 설정(`~/.claude.json` 최상위)도 찾아 전파한다.

## [0.17.0] - 2026-04-27

### Changed
- Jira 조회 호출에 fields·comment_limit·limit를 지정해 응답 크기를 줄였다.

## [0.16.1] - 2026-04-27

### Added
- `discover` 합성 결과에 출처 추적 marker를 붙인다.

## [0.16.0] - 2026-04-27

### Added
- `discover`에 합성 결과 확인 단계를 추가했다.

## [0.15.1] - 2026-04-27

### Added
- design 단계에 Data Model 섹션.

## [0.15.0] - 2026-04-27

### Added
- `create --from-requirements <경로>`: 요구사항 문서의 분해 트리를 읽어 이슈와 Blocks 링크를 만든다.

## [0.14.0] - 2026-04-27

### Changed
- `discover`·`create`를 `completedSteps` 유효 단계에 추가했다.

## [0.13.2] - 2026-04-27

### Added
- `/jira-task discover` 라우팅.

## [0.13.1] - 2026-04-26

### Added
- `templates/requirements.template.md`.

### Changed
- worktree마다 생성되는 `TASK-README.md`를 추적에서 빼고 `.gitignore`에 등록했다.

## [0.13.0] - 2026-04-26

### Added
- `jira-task-discover`: 자연어 주제에서 코드베이스 탐색과 질문을 거쳐 요구사항 분석서를 만든다.

## [0.12.0] - 2026-04-08

### Added
- `/jira-task create`: 대화로 Jira 이슈(서브태스크, Blocks 링크, Epic 연결 포함)를 만든다.

## [0.11.1] - 2026-03-15

### Removed
- `jira-local-merge`의 중복 MCP 설정 정리 단계(`done`이 처리).

## [0.11.0] - 2026-03-13

### Added
- `review`에 lint/format 검사 단계(Node.js/Python/Java).

### Changed
- 스킬의 Python 호출을 자동 승인되는 heredoc 형태로 바꿨다.

## [0.10.1] - 2026-03-13

### Fixed
- `start`가 프로젝트 `README.md`를 덮어쓰던 문제. `TASK-README.md`에 쓴다.

## [0.10.0] - 2026-03-13

### Added
- `/jira-task clean`: worktree·feature 브랜치·MCP 설정·context 파일을 정리한다(`--list`, `--all`, `--dry-run`).

## [0.9.0] - 2026-03-11

### Changed
- `auto`가 각 단계를 독립 sub-agent로 실행해 컨텍스트가 불어나지 않게 했다.

## [0.8.0] - 2026-03-11

### Added
- `auto`의 review 품질 게이트: Request Changes면 자동 수정 후 test → review를 다시 돈다(최대 2회).

## [0.7.1 – 0.7.4] - 2026-03-05 ~ 2026-03-10

### Added
- 세션 시작 시 플러그인에 필요한 권한을 `.claude/settings.json`에 자동 등록한다(0.7.2, 0.70.0에서 제거).

### Fixed
- 첨부 업로드용 자격증명을 `.mcp.json`·`~/.claude.json`에서 찾지 못해 업로드가 실패하던 문제. `~/.claude.json` projects와 `~/.claude/settings.json`도 찾고, Windows 경로 처리 오류를 고쳤다.

## [0.7.0] - 2026-03-05

### Added
- `init` 인자로 개수 외에 이슈 키(서브태스크와 의존 관계 분석)와 자연어를 받는다.

## [0.6.0] - 2026-03-01

### Added
- `/jira-task auto`: start부터 review까지 연쇄 실행하고 `completedSteps` 기준으로 재개한다.
- `/jira setup`: 대화형 MCP 설정 위자드.

## [0.5.1 – 0.5.5] - 2026-02-26 ~ 2026-02-26

### Changed
- Jira 코멘트는 섹션 제목을 영어, 내용을 한국어로 쓴다.
- README를 배지, 비교표, Mermaid 워크플로 다이어그램으로 정리했다.

### Fixed
- MCP 설정 전파 중 Python 탐지 결과가 유실되던 문제, Unix 드라이브 경로를 Windows 형식으로 바꾸지 않던 문제.
- 상태 전이 호출에 일반 텍스트 comment를 넘겨 오류가 나던 문제(ADF 필요).
- `/jira-task`가 하위 스킬을 Skill 도구 대신 Task 도구로 잘못 호출하던 문제.

## [0.5.0] - 2026-02-25

### Fixed
- `test` 스킬의 pytest 실행을 플랫폼 공통 Python 탐지로 바꿨다.

## [0.4.10 – 0.4.13] - 2026-02-24 ~ 2026-02-25

### Fixed
- Windows에서 `python3`가 Microsoft Store 스텁으로 연결돼 MCP 설정 전파가 실패하던 문제. 모든 스킬의 Python 탐지를 Windows/Linux/macOS 공통 방식으로 바꿨다.
- review 다음 단계 안내가 merge를 건너뛰고 pr을 제안하던 문제.

### Removed
- `done`의 PR 생성 로직(`pr` 단계에서 처리).

## [0.4.9] - 2026-02-24

### Changed
- 워크플로를 worktree에서 merge, 메인 레포에서 pr 순서로 재구성했다. merge는 feature 브랜치를 유지하고 In Review로만 전이한다.

## [0.4.8] - 2026-02-24

### Added
- 모든 스킬 출력을 한국어로 쓰는 Language Rule.

## [0.4.2 – 0.4.6] - 2026-02-23 ~ 2026-02-23

### Added
- `jira-local-merge`: 원격 없이 로컬에서 브랜치를 병합한다(0.4.3). `.jira-context.json`에 기록한 `repoRoot`를 사용하고, worktree를 직접 지우지 않고 정리 명령을 안내한다.
- `init`이 상위 프로젝트 MCP 설정을 각 worktree에 전파한다(0.4.3).

### Fixed
- `/jira` 연결 확인이 정상 연결을 실패로 보고하던 문제.
- worktree마다 `.gitignore`를 갱신해 merge 충돌을 막고, `init`이 사용자 프로젝트 `.gitignore`를 갱신하지 못하던 문제를 고쳤다.

## [0.4.1] - 2026-02-22

### Changed
- MCP 서버를 `mcp-jira-cloud`에서 `mcp-atlassian`(uvx)으로 바꾸고 서버 이름을 `atlassian`으로 바꿨다.

## [0.3.1] - 2026-02-19

### Changed
- `JIRA_DEFAULT_PROJECT`가 설정돼 있으면 모든 JQL에 project 조건을 넣는다.

## [0.3.0] - 2026-02-19

### Changed
- MCP 서버를 `mcp-jira-server`에서 `mcp-jira-cloud`로 바꿨다.

## [0.2.0] - 2026-02-18

### Added
- 마켓플레이스 등록(`marketplace.json`), 모든 워크플로 동작의 요약 리포트.
- `plan`이 이슈 정보가 부족하면 먼저 사용자에게 묻는다.
- 세션 시작 hook이 기존 PDCA 문서를 찾아 다음 단계를 제안한다.
- design에 구체적인 테스트 케이스, impl에 단위 테스트 작성 단계.

### Fixed
- `done`이 PR을 중복 생성하던 문제, plugin.json의 hooks 중복 선언으로 인한 로드 오류.

## [0.1.0] - 2026-02-15

### Added
- 최초 공개. Jira와 Claude Code를 연동해 개발 라이프사이클을 자동화하는 플러그인: init, start, plan, design, impl, test, review, pr, done, report 워크플로 스킬.
