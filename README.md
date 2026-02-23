# Jira + Claude Code Integration

Jira와 Claude Code를 연동하여 소프트웨어 개발 전체 프로세스를 자동화하는 Claude Code 플러그인.

## Features

- **Task Init**: Jira에서 나에게 할당된 고우선순위 태스크를 가져와 git worktree 일괄 생성
- **Task Management**: Claude Code에서 직접 Jira 이슈 조회/생성/수정/상태전이
- **Planning**: Jira 이슈 기반 기획 문서 자동 생성
- **Design**: 코드베이스 분석 기반 설계 문서 생성
- **Implementation**: 설계 문서 기반 구현
- **Testing**: Playwright E2E / unit 테스트 실행 + Jira 리포트
- **Code Review**: 설계-구현 Gap 분석 + 코드 품질 분석 → Jira 코멘트로 자동 게시
- **Pull Request**: `gh` CLI로 PR 생성 + Jira에 PR 링크 자동 게시
- **Completion**: PR 생성, 상태 전이, 완료 리포트 일괄 처리
- **Reporting**: 내 할당 이슈 현황 리포트 (Scrum/Kanban 모두 지원)

## Prerequisites

> **bkit 플러그인이 설치되어 있다면 먼저 삭제해주세요.** bkit과 이 플러그인은 스킬/훅이 충돌할 수 있습니다:
> ```bash
> claude plugin uninstall bkit
> ```

| 항목 | 필수 | 용도 |
|------|------|------|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | Yes | CLI 환경 |
| [Python](https://www.python.org/) 3.10+ + [uv](https://docs.astral.sh/uv/) | Yes | MCP 서버 실행 (`uvx mcp-atlassian`) |
| [Git](https://git-scm.com/) | Yes | 브랜치/worktree 관리 |
| Jira Cloud 계정 + API Token | Yes | Jira 연동 |
| [GitHub CLI (`gh`)](https://cli.github.com/) | PR 생성 시 | PR 생성/관리 |

## Quick Start

```bash
# 1. 플러그인 설치 (Setup 참고)
claude plugin marketplace add mzd-hseokkim/jira-claude-code-integration
claude plugin install jira-integration@jira-claude-code-integration

# 2. Atlassian MCP 서버 등록 (환경변수 포함, Setup 참고)
# macOS/Linux/Windows 모두 동일:
claude mcp add atlassian \
  -e JIRA_URL=https://your-domain.atlassian.net \
  -e JIRA_USERNAME=your-email@company.com \
  -e JIRA_API_TOKEN=your-api-token \
  -e JIRA_PROJECTS_FILTER=PROJ \
  -- uvx mcp-atlassian

# 3. Claude Code 실행 후 연결 확인
claude
> /jira

# 4. 할당된 태스크 가져오기 + worktree 일괄 생성
> /jira-task init 5

# 5. 태스크 하나를 시작부터 완료까지 (worktree 안에서 TASK-ID 자동 감지)
> cd ../your-project_worktree/PROJ-123
> /jira-task start                   # 시작 (In Progress 전환)
> /jira-task plan                    # 기획 문서 생성
> /jira-task design                  # 설계 문서 생성
> /jira-task impl                    # 구현
> /jira-task test                    # 테스트
> /jira-task review                  # 코드 리뷰
> /jira-task done                    # PR 생성 + 완료 처리
```

## Setup

### Step 1: 플러그인 설치

이 플러그인을 사용할 프로젝트에 설치합니다:

```bash
# GitHub에서 마켓플레이스 등록 + 플러그인 설치
claude plugin marketplace add mzd-hseokkim/jira-claude-code-integration
claude plugin install jira-integration@jira-claude-code-integration

# 또는 로컬에 클론한 경우 (개발/테스트용)
claude --plugin-dir /path/to/jira-claude-code-integration
```

설치 후 `/jira-integration:jira`를 입력하면 플러그인이 로드되었는지 확인할 수 있습니다.
`--plugin-dir`로 로드한 경우에도 동일하게 네임스페이스가 붙습니다.

> **참고**: 플러그인은 커맨드(`/jira`, `/jira-task`), 스킬, 에이전트, hooks를 제공합니다. Jira API 연동을 위한 MCP 서버는 아래 Step 3에서 별도로 등록합니다.

### Step 2: Jira API Token 생성

1. https://id.atlassian.com/manage-profile/security/api-tokens 에 접속
2. **"Create API token"** 클릭
3. Label 입력 (예: `claude-code`) → **Create**
4. 생성된 토큰을 복사 (한 번만 표시됨!)

### Step 3: Atlassian MCP 서버 등록

[mcp-atlassian](https://github.com/sooperset/mcp-atlassian)을 Claude Code에 등록합니다. `uvx`로 실행하므로 별도 설치 없이 사용 가능합니다.

> **중요**: 아래 환경변수가 모두 올바르게 설정되어야 Jira 연동이 동작합니다.

```bash
# macOS/Linux/Windows 모두 동일 (cmd /c 불필요):
claude mcp add atlassian \
  -e JIRA_URL=https://your-domain.atlassian.net \
  -e JIRA_USERNAME=your-email@company.com \
  -e JIRA_API_TOKEN=your-api-token \
  -e JIRA_PROJECTS_FILTER=PROJ \
  -- uvx mcp-atlassian
```

> **Windows 참고**: 이전 `mcp-jira-cloud`는 `npx.cmd` 배치 파일이라 `cmd /c npx ...` 래퍼가 필요했지만, `uvx`는 `uvx.exe` 네이티브 실행파일이므로 모든 OS에서 동일한 명령어를 사용합니다.

| 환경변수 | 필수 | 설명 |
|----------|------|------|
| `JIRA_URL` | Yes | Jira Cloud URL (끝에 `/` 없이) |
| `JIRA_USERNAME` | Yes | Atlassian 계정 이메일 |
| `JIRA_API_TOKEN` | Yes | Step 1에서 생성한 API 토큰 |
| `JIRA_PROJECTS_FILTER` | No | 접근 허용 프로젝트 키 (쉼표 구분, 예: `PROJ` 또는 `PROJ,DEV`) |

위 명령은 현재 프로젝트의 `.claude/settings.local.json`에 MCP 서버를 등록합니다 (기본 `local` 스코프). 프로젝트별로 다른 Jira 설정을 사용할 수 있습니다.

> **주의**: 이 파일에 API 토큰이 포함되므로, **사용하는 프로젝트의 `.gitignore`에 반드시 추가**하세요:
> ```
> .claude/settings.local.json
> ```

### Step 4: 연결 확인

```bash
claude
> /jira
```

정상이면 Jira MCP 서버 연결 상태와 사용 가능한 도구 목록이 표시됩니다.

### (선택) GitHub CLI 설치

PR 생성 기능(`/jira-task pr`)을 사용하려면:

```bash
# macOS
brew install gh

# Windows
winget install GitHub.cli

# 인증
gh auth login
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/jira` | 연결 상태 확인 및 도움말 |
| `/jira-task init [N]` | 나에게 할당된 고우선순위 태스크 N개 조회 + 일괄 worktree 생성 |
| `/jira-task start <TASK-ID>` | 태스크 시작 (이슈 조회, 브랜치 생성, In Progress 전환) |
| `/jira-task plan <TASK-ID>` | 기획 문서 생성 |
| `/jira-task design <TASK-ID>` | 설계 문서 생성 |
| `/jira-task impl <TASK-ID>` | 설계 문서 기반 구현 |
| `/jira-task test <TASK-ID>` | 테스트 실행 (Playwright E2E, unit) + Jira 리포트 |
| `/jira-task review <TASK-ID>` | 코드 리뷰 + Jira 코멘트 |
| `/jira-task pr <TASK-ID>` | PR 생성 + Jira에 PR 링크 게시 |
| `/jira-task merge <TASK-ID>` | 로컬 병합 (remote 없을 때 `pr` + `done` 대체) |
| `/jira-task done <TASK-ID>` | 완료 처리 (PR, 상태 전이, 리포트) |
| `/jira-task report` | 내 할당 이슈 현황 리포트 |
| `/jira-task status` | 현재 작업 중인 태스크 상태 |

### TASK-ID 자동 감지

worktree 안에서 작업할 때, TASK-ID를 생략하면 다음 순서로 자동 감지합니다:

1. **Git 브랜치명**: `feature/PROJ-123` → `PROJ-123` 추출
2. **현재 디렉토리명**: 디렉토리명이 `[A-Z]+-\d+` 패턴이면 TASK-ID로 사용
3. **`.jira-context.json`**: 파일에 저장된 활성 태스크 ID 사용

따라서 `init`으로 생성된 worktree 안에서는 TASK-ID 없이 바로 커맨드를 실행할 수 있습니다:

```bash
cd ../my-project_worktree/PROJ-123
/jira-task start    # PROJ-123 자동 감지
/jira-task plan     # PROJ-123 자동 감지
```

### Typical Workflow

#### Remote origin이 있는 경우 (PR 기반)

```
# === 태스크 초기화 ===
/jira-task init 5                  # 할당된 태스크 5개 worktree 일괄 생성

# === 태스크별 작업 (worktree 안에서 TASK-ID 자동 감지) ===
cd ../my-project_worktree/PROJ-123 # worktree로 이동
/jira-task start                   # 1. 시작 (In Progress 전환)
/jira-task plan                    # 2. 기획 문서 생성
/jira-task design                  # 3. 설계 문서 생성
/jira-task impl                    # 4. 구현 (설계 문서 기반)
/jira-task test                    # 5. 테스트 (Playwright E2E + unit)
/jira-task review                  # 6. 코드 리뷰
/jira-task pr                      # 7. PR 생성
/jira-task done                    # 8. 완료 (상태 전이 + 리포트)

# === 현황 리포트 ===
/jira-task report                  # 내 할당 이슈 현황
```

#### Remote origin이 없는 경우 (로컬 병합)

remote가 설정되지 않은 git 프로젝트에서는 `pr` 대신 `merge`를 사용합니다.
`merge`는 병합 전략 선택 → 로컬 병합 → Jira 상태 전환 → worktree 정리까지 한 번에 처리합니다.

```
cd ../my-project_worktree/PROJ-123 # worktree로 이동
/jira-task start
/jira-task plan
/jira-task design
/jira-task impl
/jira-task test
/jira-task review
/jira-task merge                   # pr + done 대신 사용
```

`merge` 실행 시 병합 전략을 선택합니다:

| 전략 | 설명 | GitHub 동등 |
|------|------|-------------|
| `--no-ff` (기본 권장) | merge commit 생성, 브랜치 히스토리 보존 | Create a merge commit |
| `--squash` | 모든 커밋을 하나로 합쳐 병합 | Squash and merge |
| `rebase` | 선형 히스토리, merge commit 없음 | Rebase and merge |

**병합 대상 브랜치**: `init` 시점에 감지된 `baseBranch` (`develop` → `develop`에, `main` → `main`에 병합).
무조건 `main`이 아니라 `init`을 실행한 레포의 base 브랜치가 기준입니다.

**실행 위치**: worktree 안에서 실행해도 병합은 항상 **메인 레포**에서 이루어집니다.
`.jira-context.json`의 `repoRoot`를 읽어 메인 레포 경로를 정확히 참조하기 때문입니다.

### 개별 단계 설명

| 단계 | 커맨드 | 입력 | 출력 | Jira 연동 |
|------|--------|------|------|-----------|
| 초기화 | `init` | 태스크 수 | worktree 생성 | 이슈 검색, 코멘트 |
| 시작 | `start` | TASK-ID | 브랜치 생성, README | 이슈 조회, In Progress 전환, 코멘트 |
| 기획 | `plan` | TASK-ID | `docs/plan/<ID>.plan.md` | 이슈 조회, 코멘트, **첨부파일** |
| 설계 | `design` | TASK-ID | `docs/design/<ID>.design.md` | 이슈 조회, 코멘트, **첨부파일** |
| 구현 | `impl` | TASK-ID | 코드 변경 | 이슈 조회, 코멘트 |
| 테스트 | `test` | TASK-ID | `docs/test/<ID>.test-report.md` | 이슈 조회, 코멘트, **첨부파일** (리포트+스크린샷) |
| 리뷰 | `review` | TASK-ID | `docs/review/<ID>.review.md` | 코멘트 (Gap 분석 + 코드 리뷰), **첨부파일** |
| PR | `pr` | TASK-ID | GitHub PR | 코멘트, In Review 전환 |
| 완료 | `done` | TASK-ID | 완료 리포트 | 코멘트, Done 전환 |
| 현황 | `report` | - | `docs/reports/status-*.md` | 내 할당 이슈 검색 |
| 상태 | `status` | - | 터미널 출력 | 활성 태스크 조회 |

### MCP Tools (직접 사용)

워크플로우 커맨드 대신 Atlassian MCP 도구를 자연어로 직접 사용할 수도 있습니다:

```
"PROJ-123 이슈 상세 정보 보여줘"       → jira_get_issue
"내 이슈 검색해줘"                     → jira_search (JQL)
"PROJ-123에 코멘트 남겨줘"            → jira_add_comment
"PROJ-123 상태를 Done으로 바꿔줘"      → jira_transition_issue
"보드 목록 보여줘"                     → jira_get_agile_boards
"진행 중인 이슈 목록"                  → jira_search (JQL)
"PROJ-123 관련 PR/브랜치 보여줘"      → jira_get_issue_development_info
```

## Project Structure

```
jira-claude-code-integration/
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest
│   └── marketplace.json         # Marketplace listing
├── CLAUDE.md                    # Claude instructions
├── README.md
├── .gitignore
│
├── commands/                    # Slash commands
│   ├── jira.md                  # /jira (도움말)
│   └── jira-task.md             # /jira-task (메인 라우터)
│
├── skills/                      # Workflow skills
│   ├── jira-task-init/          # init: 태스크 일괄 초기화
│   ├── jira-task-start/         # start: 태스크 시작
│   ├── jira-task-plan/          # plan: 기획 문서 생성
│   ├── jira-task-design/        # design: 설계 문서 생성
│   ├── jira-task-impl/          # impl: 구현 가이드
│   ├── jira-task-test/          # test: 테스트 실행 + 리포트
│   ├── jira-task-review/        # review: 코드 리뷰
│   ├── jira-task-pr/            # pr: PR 생성
│   ├── jira-task-done/          # done: 완료 처리
│   ├── jira-task-report/        # report: 현황 리포트
│   └── jira-local-merge/        # merge: 로컬 병합 (no remote)
│
├── agents/                      # Subagent definitions
│   ├── jira-planner.md          # plan/design 시 Jira 컨텍스트 수집 + 문서 생성
│   ├── jira-reviewer.md         # review 시 Gap 분석 + 코드 품질 검사
│   └── jira-reporter.md         # report 시 이슈 수집 + 현황 리포트 생성
│
├── hooks/                       # Event hooks
│   ├── hooks.json
│   └── scripts/
│       ├── session-start.js
│       └── stop-sync.js
│
└── templates/                   # Document templates
    ├── plan.template.md        # 기획 문서 템플릿
    └── report.template.md      # 현황 리포트 템플릿
```

### Worktree 구조 (init 커맨드 실행 후)

```
workspace/
├── your-project/                # 원본 레포 (main 브랜치)
└── your-project_worktree/       # worktree들 (원본 밖에 생성!)
    ├── PROJ-101/                # feature/PROJ-101 브랜치
    ├── PROJ-102/                # feature/PROJ-102 브랜치
    └── PROJ-103/                # feature/PROJ-103 브랜치
```

### Multi-Worktree PR 병합 전략

`/jira-task init`은 모든 worktree를 동일한 base branch(develop/main)에서 생성합니다. 서로 다른 태스크가 같은 파일을 수정하면, 나중에 병합되는 PR에서 충돌이 발생합니다. 작업 시작 전에 병합 순서를 계획하는 것이 핵심입니다.

#### 구조 이해

```
main (또는 develop)
 ├─ feature/PROJ-101   ← init이 main에서 생성
 ├─ feature/PROJ-102   ← init이 main에서 생성
 └─ feature/PROJ-103   ← init이 main에서 생성
```

모든 브랜치가 같은 시점의 main에서 분기됩니다. PROJ-101을 main에 병합하면, PROJ-102와 PROJ-103은 그 변경사항을 모르는 상태가 됩니다.

#### 충돌 발생 시나리오

```
main ──┬──────────────────────────────────►
       │
       ├ PROJ-101: src/api/auth.ts 수정 → main에 병합
       │
       ├ PROJ-102: src/api/auth.ts 수정 → PR 시 충돌!
       └ PROJ-103: src/api/user.ts 수정 → PR 시 정상 (다른 파일)
```

충돌 발생 여부는 **파일 중복 여부**로 결정됩니다. 설계 단계에서 미리 파악해야 합니다.

---

#### 전략 1: 순차 rebase-and-merge (파일 중복이 있을 때)

병합 순서를 미리 정하고, 앞 태스크가 main에 합쳐진 뒤 뒷 태스크를 rebase합니다.

```
1단계: PROJ-101 PR → main에 병합
2단계: PROJ-102 브랜치를 새 main으로 rebase → PR 생성
3단계: PROJ-103 브랜치를 새 main으로 rebase → PR 생성
```

```bash
# PROJ-101 병합 후, PROJ-102 worktree에서:
git fetch origin
git rebase origin/main

# 충돌 해결 후 PR 생성
/jira-task pr
```

**언제 사용**: 태스크 간 의존 관계가 있거나, 같은 파일을 건드릴 때.
**병합 순서 결정 기준**: 논리적으로 선행해야 하는 태스크 → 먼저 병합.

---

#### 전략 2: 통합 브랜치 (스프린트 단위 릴리즈)

별도 통합 브랜치를 만들고, 모든 태스크 PR을 거기서 먼저 합친 뒤 최종에 main으로 PR 1개.

```bash
# 스프린트 시작 시 통합 브랜치 생성
git checkout -b feature/sprint-42 main

# 각 태스크 PR의 base를 feature/sprint-42로 설정 (GitHub PR 생성 시)
# 태스크 완료마다 → feature/sprint-42에 병합 → 충돌 해결
# 스프린트 종료 시 → feature/sprint-42 → main PR 1개
```

**언제 사용**: 여러 태스크를 함께 릴리즈해야 하거나, 개별 배포가 불가능한 경우.

---

#### 전략 3: 사전 파일 영역 분리 (가장 단순)

`/jira-task design` 단계에서, 내가 수정할 파일이 다른 진행 중인 태스크와 겹치지 않도록 설계합니다.

```bash
# 현재 각 태스크 브랜치의 변경 파일 목록 확인
git diff --name-only main feature/PROJ-101
git diff --name-only main feature/PROJ-102
```

겹치는 파일이 없으면 어떤 순서로 병합해도 충돌이 없습니다. 겹친다면 전략 1로 순서를 정합니다.

---

#### 브랜치 주기적 동기화 (개발 기간 중)

스프린트 기간 동안 다른 팀원의 PR이 main에 계속 병합됩니다. 오래 방치한 브랜치일수록 나중에 충돌 규모가 커집니다. **매일 또는 작업 세션 시작 시** 각 worktree를 최신 main과 동기화하세요.

```bash
# 각 worktree에서 (또는 해당 worktree 디렉토리로 이동 후):
git fetch origin
git rebase origin/main   # 또는 git merge origin/main
```

rebase vs merge 선택:
- **rebase**: 커밋 히스토리가 깔끔하게 유지됨. 단독 작업 브랜치에 권장.
- **merge**: 히스토리 보존. 여러 명이 같은 브랜치에서 작업 중이라면 merge가 안전.

통합 브랜치(전략 2) 사용 시에는 feature 브랜치를 `origin/main` 대신 `origin/feature/sprint-42`와 동기화합니다.

---

#### 의사결정

```
설계 단계에서 파일 중복 확인
├─ 중복 없음 → 전략 3: 어떤 순서로든 PR 가능
├─ 중복 있음, 각자 배포 가능 → 전략 1: 병합 순서 정하고 순차 rebase
└─ 중복 있음, 함께 릴리즈 필요 → 전략 2: 통합 브랜치
```

> **팁**: `/jira-task init` 후 구현 시작 전에 `git diff --name-only`로 태스크 간 파일 중복을 확인하고, 중복이 있으면 병합 순서를 팀과 먼저 합의하세요. 개발 중에는 주기적으로 main을 당겨와 충돌을 조금씩 해결하는 것이 한꺼번에 처리하는 것보다 훨씬 수월합니다.

### Progress Tracking

각 워크플로 스킬이 완료되면 `.jira-context.json`의 `completedSteps`에 단계가 기록됩니다. 다음 스킬 실행 시 진행 상황이 자동으로 표시됩니다:

```
Progress: init ✓ → start ✓ → plan ✓ → design → impl → test → review → pr → done
```

`.jira-context.json` 예시:
```json
{
  "taskId": "PROJ-123",
  "branch": "feature/PROJ-123",
  "status": "In Progress",
  "completedSteps": ["init", "start", "plan"]
}
```

> 이 파일은 `.gitignore`에 포함되어 있으며, worktree별로 개별 관리됩니다.

### Session Hooks

플러그인은 Claude Code 세션 이벤트에 자동으로 반응합니다:

- **세션 시작 시**: `.jira-context.json`을 읽어 활성 태스크 정보(태스크 ID, 브랜치, 상태, 진행 상황)를 자동 표시
- **세션 종료 시**: 진행 중인 태스크가 있으면 Jira에 진행 상황을 동기화하라는 리마인더 표시

## Troubleshooting

### "Atlassian MCP server not connected"

```bash
# 1. MCP 서버 등록 상태 확인
claude mcp list

# 2. 환경변수가 올바른지 확인 (특히 JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN)
claude mcp get atlassian

# 3. MCP 서버 직접 실행 테스트
uvx mcp-atlassian               # 입력 대기하면 정상. Ctrl+C로 종료

# 4. uv가 없으면 설치
pip install uv                  # 또는 https://docs.astral.sh/uv/ 참조
```

### "Transition failed"

Jira 워크플로우에 따라 전환 이름이 다를 수 있습니다:
```
"PROJ-123 이슈의 가능한 상태 전환 보여줘"
```
일반적인 전환 이름: `To Do`, `In Progress`, `In Review`, `Done`

### "Authentication failed"

- API Token이 만료되지 않았는지 확인
- `JIRA_USERNAME`이 Atlassian 계정 이메일과 **정확히** 일치하는지 확인
- `JIRA_URL` URL 끝에 `/`가 **없어야** 함 (예: `https://company.atlassian.net`)

### "`gh` CLI not found" (PR 생성 실패)

```bash
# macOS: brew install gh
# Windows: winget install GitHub.cli
gh auth login
```

### Worktree 생성 실패

```bash
git rev-parse --git-dir          # git repo인지 확인
git branch -a | grep feature/    # 이미 있는 브랜치 확인
git worktree prune               # 정리
```

## Environment Variables

`claude mcp add` 시 `-e`로 설정하는 변수들:

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `JIRA_URL` | Yes | `https://company.atlassian.net` | Jira Cloud URL (끝에 `/` 없이) |
| `JIRA_USERNAME` | Yes | `user@company.com` | Atlassian 계정 이메일 |
| `JIRA_API_TOKEN` | Yes | `ATATT3x...` | API 토큰 ([여기서 생성](https://id.atlassian.com/manage-profile/security/api-tokens)) |
| `JIRA_PROJECTS_FILTER` | No | `PROJ` 또는 `PROJ,DEV` | MCP 서버가 접근할 프로젝트 화이트리스트 (mcp-atlassian 공식 변수) |

> **`JIRA_DEFAULT_PROJECT`와의 차이**: `JIRA_PROJECTS_FILTER`는 mcp-atlassian 서버 수준에서 접근 가능한 프로젝트를 제한합니다. `JIRA_DEFAULT_PROJECT`는 이 플러그인 스킬이 JQL 쿼리를 구성할 때 사용하는 별도의 프로젝트 키 규칙으로, CLAUDE.md에 명시하거나 `.jira-context.json`에 저장합니다.

> **주의**: 이 환경변수들이 누락되거나 잘못되면 모든 Jira 연동 기능이 동작하지 않습니다.

## Roadmap / TODO

### Git Hosting 확장
- [ ] **Bitbucket Cloud 지원** - `/jira-task pr`에서 Bitbucket REST API로 PR 생성 (현재 GitHub `gh` CLI만 지원)
- [ ] **GitLab 지원** - `glab` CLI 또는 GitLab API로 MR(Merge Request) 생성
- [ ] Git remote URL 자동 감지 → GitHub / Bitbucket / GitLab 분기 처리

### Jira 확장
- [ ] **Jira Server/Data Center 지원** - mcp-atlassian Personal Access Token 모드 연동 (`JIRA_PERSONAL_TOKEN`)
- [ ] **커스텀 워크플로우 매핑** - 회사별 Jira transition 이름 설정 (예: "In Progress" 대신 "개발중")
- [ ] **Sub-task 자동 생성** - 설계 문서의 Task Breakdown을 Jira sub-task로 자동 등록
- [ ] **Time Tracking** - 작업 시작/종료 시간을 Jira work log에 자동 기록
- [ ] **Jira 첨부파일 활용** - 설계 문서, 테스트 리포트를 Jira 첨부파일로 업로드

### 테스트 & 품질
- [ ] **Playwright 테스트 자동 생성** - Jira acceptance criteria → Playwright 테스트 코드 자동 생성 고도화
- [ ] **테스트 커버리지 연동** - 커버리지 리포트를 Jira 코멘트에 포함
- [ ] **CI/CD 연동** - GitHub Actions / Jenkins / Bitbucket Pipeline 결과를 Jira에 자동 게시

### 알림 & 협업
- [ ] **Slack 알림 연동** - PR 생성, 리뷰 완료, 태스크 완료 시 Slack 채널에 알림
- [ ] **Teams 알림 연동** - Microsoft Teams webhook 지원
- [ ] **멀티 어사이니 지원** - 한 태스크에 여러 명이 작업할 때 협업 워크플로우

### 사용성 개선
- [ ] **npm 패키지화** - `claude install-plugin jira-integration`으로 원클릭 설치
- [ ] **대화형 설정 마법사** - `/jira setup`으로 대화형 설정
- [ ] **대시보드 뷰** - `/jira-task dashboard`로 전체 태스크 현황 표시
- [ ] **영문 문서** - README, 템플릿의 영문 버전 제공
- [ ] **Jira 커스텀 필드 지원** - Story Points, Sprint Goal 등

### 고급 기능
- [ ] **자동 코드 리뷰 룰 설정** - 프로젝트별 리뷰 체크리스트 커스터마이징
- [ ] **회고 리포트** - 스프린트 완료 후 velocity, burndown 데이터 기반 회고 문서 생성
- [ ] **이슈 템플릿 연동** - Jira 이슈 생성 시 프로젝트별 템플릿 자동 적용
- [ ] **멀티 프로젝트 지원** - 여러 Jira 프로젝트를 동시에 관리

## License

MIT
