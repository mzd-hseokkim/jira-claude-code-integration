---
name: jira-setup
description: "Interactive setup wizard — Jira credentials for this workspace (jira-cli) and optional MCP registration. Triggers: jira setup, setup jira; Jira 설정, 자격증명 설정."
user-invocable: false
argument-hint: "[--mcp]"
allowed-tools:
  - Read
  - Bash
  - AskUserQuestion
---

# jira-setup: Workspace Jira Setup Wizard

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력).

## Overview

이 워크스페이스의 Jira 자격증명을 **메인 레포 `.jira-context.json`의 `jira` 블록**에 기록하고 연결을 검증하는 위자드. v0.61.0부터 플러그인의 모든 Jira 호출은 `scripts/jira-cli.py`가 하므로 MCP 서버 등록은 **선택**(`--mcp` 인자 또는 Step 5에서 요청 시 — 대화 중 ad-hoc Jira 질의를 MCP 도구로 하고 싶을 때만).

- 자격증명은 워크스페이스 단위다 — 다른 워크스페이스가 알 필요 없는 값을 전역 설정에 두지 않는다.
- 토큰은 `.jira-context.json`에만 저장되며 이 파일은 `.gitignore` 대상이다 (`config set`이 미등록이면 등록까지 한다).
- **위자드 출력·요약에 토큰 값을 절대 표시하지 않는다** (`config show`가 마스킹한 값만).

## Step 1: Prerequisites

```bash
python3 --version        # 3.10+ (jira-cli는 표준 라이브러리만 사용 — uv/pip 불필요)
git rev-parse --git-common-dir 2>/dev/null && echo IN_GIT_REPO
```

python3가 없으면 설치 안내 후 중단. git 레포가 아니면 "플러그인은 git 레포 안에서 동작합니다" 안내 후 중단.

## Step 2: 기존 설정 확인

`skills/_shared/script-lookup.md`로 `SCRIPT_NAME="jira-cli.py"` 1회 해석 후:

```bash
python3 "<scripts>/jira-cli.py" config show
```

- `url`·`username`·`apiToken`(마스킹)이 모두 있으면 → 사용자에게 선택: **연결 테스트만** / **재설정** / 취소.
- 없으면 → `python3 "<scripts>/jira-cli.py" whoami`를 한 번 실행해 본다. jira-cli는 환경변수·레거시 MCP 설정(`.mcp.json`, `~/.claude.json`, settings)에서 자격증명을 찾으면 **자동으로 `jira` 블록에 기입**하므로(stderr에 "기입함" 안내), 성공하면 Step 4로 바로 간다. 실패하면 Step 3.

## Step 3: 자격증명 수집

`AskUserQuestion`으로 수집 (토큰 입력은 사용자가 직접 — 위자드가 값을 되풀이해 출력하지 않는다):

| 항목 | 필수 | 비고 |
|---|---|---|
| Jira URL | ✓ | `https://your-domain.atlassian.net` (끝 `/` 없이) |
| 계정 이메일 | ✓ | Atlassian 계정 |
| API 토큰 | ✓ | https://id.atlassian.com/manage-profile/security/api-tokens |
| 기본 프로젝트 키 | | 설정하면 모든 JQL에 `project =`가 자동 삽입되고 `create`가 프로젝트를 묻지 않는다 |

기록:

```bash
python3 "<scripts>/jira-cli.py" config set "<url>" "<email>" "<token>" [<PROJECT>]
```

출력의 `gitignoreUpdated: true`면 ".gitignore에 `.jira-context.json`을 추가했습니다"를 알린다 (정보 — 경고 아님).

## Step 4: 연결 검증

```bash
python3 "<scripts>/jira-cli.py" whoami
```

| 결과 | 진단 |
|---|---|
| `{"accountId", "displayName", ...}` | 성공 → Step 5 |
| `jira-cli: 401 Unauthorized` | 토큰/이메일 오류 — Step 3 재수집 |
| `jira-cli: 404` | URL 오류 (도메인·끝 슬래시) |
| `jira-cli: 네트워크 오류` | URL 도달 불가 — VPN/프록시 확인 |

기본 프로젝트를 설정했으면 `python3 "<scripts>/jira-cli.py" search "assignee = currentUser()" --limit 1`로 프로젝트 접근도 확인한다.

## Step 5: Workflow 실행 디렉터리 등록

`/jira-task auto`는 플러그인의 `auto.workflow.js`를 Workflow 도구로 실행하는데, Claude Code는 `scriptPath`로 **cwd 또는 추가된 워킹 디렉터리 안의 파일**만 받는다. 플러그인은 그 밖(`~/.claude/plugins/cache/…`)에 설치되므로 설치 경로를 사용자 settings.json에 1회 등록한다:

```bash
python3 "<scripts>/ensure-workflow-dir.py"
```

- `"added":true` → 등록 완료. **새 세션부터 적용**되므로, 지금 세션에서 auto를 쓰려면 출력된 `dir` 값으로 `/add-dir <dir>`를 실행하라고 안내한다.
- `"added":false,"registered":true` → 이미 등록됨. 별도 안내 없음.
- 실패해도(exit≠0) setup은 계속 진행한다 — auto 외 명령에는 영향이 없다.

## Step 6: (선택) MCP 서버 등록

`--mcp` 인자가 있거나 사용자가 요청할 때만. 대화 중 `mcp__atlassian__*` 도구로 ad-hoc 질의를 하고 싶은 경우용이며, 플러그인 워크플로에는 필요 없다.

```bash
claude mcp add atlassian \
  -e JIRA_URL="<url>" -e JIRA_USERNAME="<email>" -e JIRA_API_TOKEN="<token>" \
  [-e JIRA_PROJECTS_FILTER="<PROJECT>"] \
  -- uvx mcp-atlassian
```

전제: Python 3.10+ 와 `uv`(`uv --version`). 등록 후 세션 재시작이 필요하고, 세션 시작 직후 서버가 늦게 붙으면 `/mcp`에서 재연결해야 할 수 있음을 안내한다.

## Step 7: 완료 요약

```
---
✅ **Jira Setup Complete**

- 워크스페이스: <메인 레포 경로>
- Jira: <url> (<displayName>)
- 기본 프로젝트: <PROJECT | 없음>
- 자격증명 저장: .jira-context.json `jira` 블록 (gitignore ✓)
- Workflow 디렉터리: <등록됨 | 이미 등록됨 | 등록 실패 — auto 사용 시 재시도>
- MCP 서버: <등록됨 | 미등록 (플러그인 동작에 불필요)>

**Next**: `/jira-task init <이슈키|N>` 으로 작업 큐를 잡거나, `/jira-task create`로 이슈를 만드세요.
---
```
