---
name: jira-setup
description: Interactive setup wizard for Jira MCP server registration. Guides through prerequisites check, credential collection, MCP server registration, and connection validation. Use when user says "/jira setup", "setup jira", "jira 설정", "MCP 등록", "연결 설정", or wants to configure Jira integration for the first time.
user-invocable: false
argument-hint: ""
allowed-tools:
  - Read
  - Bash
  - mcp__atlassian__jira_get_user_profile
  - mcp__atlassian__jira_search
---

# jira-setup: Interactive Jira Setup Wizard

## Language Rule

모든 출력을 한국어로 작성한다.
예외: 명령어, URL, 환경변수명, 파일명은 영어를 유지한다.

## Overview

Jira MCP 서버(`atlassian`)를 Claude Code에 등록하는 대화형 설정 위자드.

## Step 1: Prerequisites Check

### 1-1. uv 설치 확인

```bash
uv --version
```

실패 시:
```
❌ uv가 설치되어 있지 않습니다.

설치 방법:
  Windows (PowerShell): irm https://astral.sh/uv/install.ps1 | iex
  macOS/Linux:          curl -LsSf https://astral.sh/uv/install.sh | sh

설치 후 터미널을 재시작하고 /jira setup을 다시 실행하세요.
```
→ 중단

### 1-2. Python 3.10+ 확인

```bash
python --version 2>/dev/null || python3 --version 2>/dev/null
```

**Windows Store stub 회피**: `python --version`이 "Python 3.x.x"를 반환하지 않고 아무것도 출력하지 않거나 Microsoft Store를 열려고 하면 stub으로 간주. `uv python list`로 대체 확인.

Python 3.10 미만이거나 없으면:
```
❌ Python 3.10 이상이 필요합니다.

현재 버전: <버전 또는 "없음">

uv로 Python 설치:
  uv python install 3.11

또는 python.org에서 직접 설치하세요.
```
→ 중단

사전 요건 통과 시: `✅ 사전 요건 확인 완료 (uv <버전>, Python <버전>)`

## Step 2: Check Existing Registration

`.claude/settings.local.json`과 `~/.claude/settings.json` 검사:

```bash
cat .claude/settings.local.json 2>/dev/null
cat ~/.claude/settings.json 2>/dev/null
```

`mcpServers` 키 아래 `atlassian` 항목이 존재하면 이미 등록된 것으로 판단.

**이미 등록된 경우**, 선택지를 안내:

```
ℹ️ Jira MCP 서버(atlassian)가 이미 등록되어 있습니다.

어떻게 하시겠습니까?
1. 연결 테스트만 실행
2. 자격증명 재설정 (기존 설정 덮어쓰기)
3. 취소
```

`AskUserQuestion` 도구로 사용자에게 선택 요청:
- "연결 테스트" 선택 → Step 5로 바로 이동
- "재설정" 선택 → Step 3부터 진행
- "취소" 선택 → 종료

## Step 3: Collect Credentials

`AskUserQuestion` 도구로 아래 정보를 수집한다.

**필수 항목:**

1. **JIRA_URL** — Jira Cloud URL
   - 예시: `https://your-domain.atlassian.net`
   - 확인: `https://`로 시작하고 `atlassian.net`을 포함해야 함

2. **JIRA_USERNAME** — Atlassian 계정 이메일
   - 예시: `your-email@company.com`

3. **JIRA_API_TOKEN** — API 토큰
   - 발급 링크: https://id.atlassian.com/manage-profile/security/api-tokens
   - 입력값을 화면에 표시하지 않도록 안내

**선택 항목** (별도 질문):

4. **JIRA_PROJECTS_FILTER** — 접근 허용 프로젝트 키 (쉼표 구분)
   - 예시: `PROJ` 또는 `PROJ,DEV`
   - 비워두면 모든 프로젝트 접근 가능

5. **JIRA_DEFAULT_PROJECT** — 기본 프로젝트 키 (JQL 쿼리에 자동 포함)
   - 예시: `PROJ`
   - 비워두면 프로젝트 필터링 없음

## Step 4: Register MCP Server

수집한 자격증명으로 MCP 서버를 등록:

```bash
claude mcp add atlassian \
  -e JIRA_URL="<JIRA_URL>" \
  -e JIRA_USERNAME="<JIRA_USERNAME>" \
  -e JIRA_API_TOKEN="<JIRA_API_TOKEN>" \
  -- uvx mcp-atlassian
```

`JIRA_PROJECTS_FILTER`가 입력되었으면 `-e JIRA_PROJECTS_FILTER="<값>"` 추가.

**참고**: `JIRA_DEFAULT_PROJECT`는 MCP 서버가 아닌 플러그인 자체에서 사용하는 변수이므로, `.claude/settings.local.json` 또는 `CLAUDE.md`에 별도로 기록 안내.

등록 후: `✅ MCP 서버 등록 완료`

## Step 5: Validate Connection

`mcp__atlassian__jira_get_user_profile` 호출로 연결 검증.

**성공 시:**
```
✅ 연결 성공!

사용자: <displayName> (<emailAddress>)
계정 ID: <accountId>

Jira MCP 서버가 정상적으로 연결되었습니다.
이제 /jira-task 워크플로를 사용할 수 있습니다.
```

**실패 시 오류 진단:**

| 오류 패턴 | 원인 | 해결책 |
|-----------|------|--------|
| `401 Unauthorized` | API 토큰 또는 이메일 오류 | JIRA_USERNAME과 JIRA_API_TOKEN 재확인 |
| `404 Not Found` | JIRA_URL 오류 | URL 형식 확인 (`https://domain.atlassian.net`) |
| `connection refused` | 네트워크 문제 | 인터넷 연결 및 방화벽 확인 |
| `uvx not found` | uv 미설치 또는 PATH 오류 | `uv --version` 재확인 |

```
❌ 연결 실패

오류: <오류 메시지>
원인: <진단 결과>
해결책: <구체적인 조치>

자격증명을 수정하려면 /jira setup을 다시 실행하세요.
```

## Step 6: Post-Setup Summary

```
─────────────────────────────────────────
🎉 Jira 설정 완료
─────────────────────────────────────────
MCP 서버: atlassian (uvx mcp-atlassian)
연결 계정: <이메일>
Jira URL: <JIRA_URL>

다음 단계:
  /jira              — 연결 상태 및 사용 가능한 명령 확인
  /jira-task init    — 할당된 작업 목록 가져오기
─────────────────────────────────────────
```
