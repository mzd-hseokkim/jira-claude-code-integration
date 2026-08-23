# atlassian MCP → `jira-cli.py` 대체 — 설계

> 개선안 6번. `tasks/loop-engineering-roadmap.md` 참조. 의존: 없음 (독립). 단, stage 프롬프트 변경은 1번(Workflow) 위에서.
> 상태: 설계 (미구현)

---

## 문제

Jira 연동이 `mcp-atlassian` MCP 서버에 묶여 있어서 생기는 비용 세 가지:

1. **세션 시작 경쟁** — `uvx mcp-atlassian` 기동(uv 환경 해석)이 세션의 도구 스냅샷보다 늦어, 재시작 직후 `mcp__atlassian__*`가 목록에 없다. `claude mcp list`는 연결됨으로 보이고, `/mcp` 재연결을 사람이 해야 한다. 오늘 세션에서 3회 재현.
2. **호출·컨텍스트 비용** — 모든 stage agent가 `ToolSearch`로 MCP 스키마를 로드(단계당 1회 ≈ 10초). MCP 응답은 이슈 1건에 avatar URL·reporter 블록·전체 코멘트가 딸려와 sub-agent 컨텍스트를 불린다.
3. **worktree 전파** — worktree는 별도 프로젝트 루트라 `propagate-mcp-config.sh`로 `.mcp.json`을 복사해야 하고, 첫 로드 시 신뢰 프롬프트가 뜬다.

첨부 업로드는 MCP가 미지원이라 이미 `jira-attach.sh`가 REST(curl)로 하고 있고, 자격증명 조회 순서(env → `.mcp.json` → `~/.claude.json` → settings)도 거기에 있다. 즉 REST 직접 호출 인프라의 절반은 이미 존재한다.

## 원칙

**Jira 호출은 결정론적 스크립트 1개로, 출력은 LLM이 소비할 만큼만.** 하니스 원칙(싼 computational 층이 비싼 inferential 층을 받친다)을 Jira 연동에도 적용한다.

## 사용 현황 (마이그레이션 범위)

`skills/`·`commands/`·`agents/`에서 18개 파일이 MCP 도구를 참조. 호출 빈도:

| 도구 | 참조 수 | CLI 서브커맨드 |
|---|---|---|
| jira_get_issue | 24 | `get` |
| jira_add_comment | 21 | `comment` |
| jira_transition_issue | 11 | `transition` |
| jira_search | 11 | `search` |
| jira_get_transitions | 10 | `transitions` |
| jira_get_user_profile | 8 | `whoami` |
| jira_get_agile_boards / get_sprints_from_board | 5 / 5 | `boards` / `sprints` |
| jira_update_issue | 3 | `update` |
| jira_create_issue / create_issue_link / link_to_epic | 2 / 2 / 2 | `create` / `link` / `epic-link` |
| get_all_projects / get_link_types / get_sprint_issues / get_project_issues / get_board_issues | 1~2 | `projects` / `link-types` / `search`로 흡수 |
| jira_download_attachments | 1 | `attach --download` (후순위) |
| (jira-attach.sh) | — | `attach` — 흡수 |

## 설계

### 1. `scripts/jira-cli.py` — 단일 파일, 표준 라이브러리만

```
python3 jira-cli.py <subcommand> [args] [--fields a,b,c] [--json|--compact]
```

- **의존성 0**: `urllib.request` + `json` + `base64`. uv/uvx/pip 불필요 — 플러그인의 기존 전제(python3)만 쓴다.
- **자격증명**: `jira-attach.sh`와 동일한 5단 조회(env → `.mcp.json` → `~/.claude.json` top-level/projects → `.claude/settings.local.json` → `~/.claude/settings.json`). 공용 모듈로 빼서 `jira-attach.sh`의 node 인라인 추출을 대체.
- **API 버전**: 조회·전이·생성·링크는 REST v3. **코멘트만 v2** (`/rest/api/2/issue/{key}/comment`) — v2는 wiki markup 텍스트를 받아 ADF 변환이 필요 없다.
- **출력 계약**: 기본은 **압축 JSON** — `get`은 `{key, summary, status, issuetype, priority, assignee, description, parent, labels}`만, `search`는 `[{key, summary, status, issuetype, priority}]`. avatar·self URL·reporter 블록·워크로그는 절대 내보내지 않는다. `--fields`로 추가 선택. 사람이 볼 때는 `--table`.
- **에러 계약**: HTTP 4xx/5xx → stderr 한 줄(`jira-cli: 401 Unauthorized — 토큰 확인`) + exit 1. 3xx/네트워크 오류 → exit 2. loop의 인프라 시그니처 판정이 이 메시지를 그대로 매칭한다.
- **`JIRA_DEFAULT_PROJECT`**: `search`/`create`가 읽어 JQL에 `project =` 자동 삽입, `create`의 project 기본값. 플러그인 규칙(CLAUDE.md)과 동일.

### 2. 마크다운 → wiki markup 변환 (`comment` 전용)

현재 Jira 코멘트는 4종 구문만 쓴다 — 제목(`## `/`### `), 불릿(`- `), 표(`| a | b |`), 코드(`` ` ``/```` ``` ````), 굵게(`**x**`). 변환기는 이 5가지만 처리하고 나머지는 통과:

| markdown | wiki |
|---|---|
| `## T` / `### T` | `h2. T` / `h3. T` |
| `- item` | `* item` |
| `**x**` | `*x*` |
| `` `x` `` | `{{x}}` |
| ```` ```lang ```` … ```` ``` ```` | `{code:lang}` … `{code}` |
| `\| a \| b \|` 헤더 행 | `\|\| a \|\| b \|\|`, 본문 행은 `\| a \| b \|`, 구분선 행 제거 |

오늘 관찰한 문제(MCP가 `**브랜치**:`를 `\*\*브랜치\*\*:`로 이스케이프한 사례)도 이 변환기가 직접 다루므로 사라진다. 변환기는 단위 테스트로 고정.

### 3. 스킬 마이그레이션 — 2단계

**Phase A (v0.59): CLI 추가 + auto 경유 단계만 전환.** `auto.workflow.js`의 stage 프롬프트에 "Jira 호출은 `<scriptsDir>/jira-cli.py`로, MCP 도구 사용 금지"를 추가하고 start/approach/impl/test/review SKILL.md의 MCP 호출 블록을 CLI 호출로 교체. 이 5개가 호출 빈도의 80%다. `ToolSearch` 1회/단계가 사라지고 응답 크기가 준다.

**Phase B (v0.60): 나머지 전환 + MCP 선택화.** init/create/discover/epic/report/merge/done/pr/clean/status 전환. `/jira setup`은 MCP 등록 대신 자격증명을 `.claude/settings.local.json`의 `env`에 쓰는 것으로 단순화 (MCP 서버 등록은 선택 — 대화형 ad-hoc 질의용으로 남길 수 있음). `propagate-mcp-config.sh`는 자격증명이 env/settings에 있으면 불필요 — `.mcp.json` 전파 로직은 유지하되 "MCP를 쓸 때만".

`docs/mcp-atlassian-tools.md` → `docs/jira-cli.md`로 교체. README의 설정 섹션 갱신.

### 4. 권한

Bash 허용 목록에 `python3 */scripts/jira-cli.py *` 패턴 하나면 모든 Jira 호출이 프롬프트 없이 통과한다 — MCP 도구 13개를 개별 허용하던 것보다 단순.

## 기대 효과

| 항목 | 현재 | 전환 후 |
|---|---|---|
| 세션 시작 시 Jira 가용성 | 경쟁 조건, `/mcp` 수동 재연결 | 항상 (프로세스 없음) |
| 단계당 호출 | ToolSearch 1회 포함 | −1회 |
| 이슈 조회 응답 | 수 KB (avatar·reporter·코멘트) | 수백 B |
| 외부 의존 | python3 + uv + mcp-atlassian | python3 |
| worktree 준비 | MCP 전파 + 신뢰 프롬프트 | env 상속, 없음 |

## 비목표

- Confluence 등 Jira 외 Atlassian 기능 — 쓰지 않는다.
- ADF 완전 변환 — wiki markup v2로 충분. 필요해지면 그때.
- 대화형 ad-hoc 질의의 MCP 완전 제거 — Phase B에서도 MCP는 "선택"으로 남긴다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/jira-cli.py` | 신규 (~300줄) + `scripts/jira_cli/` 모듈(creds, md2wiki) |
| `tests/test_jira_cli.py` | md2wiki·출력 압축·자격증명 조회 단위 테스트 (HTTP는 mock) |
| `scripts/jira-attach.sh` | `jira-cli.py attach`로 위임하는 얇은 래퍼로 축소 (기존 호출 호환) |
| `scripts/auto.workflow.js` | guardHeader에 CLI 사용 지시 |
| skills 5개 (Phase A) → 나머지 (Phase B) | MCP 호출 블록 → CLI 호출 |
| `docs/jira-cli.md`, README §6 | 문서 |

## 검증 계획

- 단위: md2wiki 5종 구문, `get` 출력 필드 화이트리스트, 401/404/네트워크 에러 exit 코드, 자격증명 5단 조회 우선순위.
- 통합: 더미 태스크 1건을 Phase A 상태로 auto 실행 → Jira 코멘트 렌더링(제목·표·코드)이 MCP 시절과 동일한지 육안 확인, run-log 호출 수에서 ToolSearch 감소 확인.
- 회귀: 재시작 직후 `/mcp` 없이 `auto`가 바로 도는지 (경쟁 조건 소멸 확인).
