---
name: jira-dashboard
description: Dashboard lifecycle management — setup, start, stop, status. Invoked by /jira dashboard command.
allowed-tools:
  - Bash
---

# jira-dashboard Skill

Dashboard 서버의 셋업·기동·중지·상태조회를 담당한다.
모든 OS-level 동작은 `scripts/dashboard-control.sh`에 위임한다.

## Action Routing

인자(ARGUMENTS)에 따라 아래와 같이 라우팅한다.

| ARGUMENTS | 동작 |
|-----------|------|
| (비어 있음 / `dashboard` 만) | `cmd_default` — status 확인 후 자동 setup→start |
| `start` | `dashboard_start` |
| `stop` | `dashboard_stop` |
| `status` | `dashboard_status` |
| `setup` | `dashboard_setup` |
| 그 외 | 사용법 안내 |

## Execution

### 1. `CLAUDE_PLUGIN_ROOT` 확인

```bash
# CLAUDE_PLUGIN_ROOT가 없으면 bash 헬퍼가 exit 1로 친화적 메시지 출력.
# 이 스킬은 별도로 확인하지 않고 헬퍼에 위임.
```

### 2. 헬퍼 스크립트 경로 결정

```bash
# 스킬은 사용자 프로젝트 컨텍스트에서 실행 → 플러그인 root에서 찾는다
CTRL_SH="${CLAUDE_PLUGIN_ROOT}/scripts/dashboard-control.sh"
if [[ ! -f "${CTRL_SH}" ]]; then
  echo "오류: dashboard-control.sh를 찾을 수 없습니다: ${CTRL_SH}" >&2
  exit 1
fi
```

### 3. 액션 실행

아래 조건에 따라 bash 헬퍼를 호출한다.

**인자 없음 (default)**:
```bash
bash "${CTRL_SH}"
```

**start**:
```bash
bash "${CTRL_SH}" start
```

**stop**:
```bash
bash "${CTRL_SH}" stop
```

**status**:
```bash
bash "${CTRL_SH}" status
```

**setup**:
```bash
bash "${CTRL_SH}" setup
```

**그 외**:
```bash
bash "${CTRL_SH}" "${ACTION}"
# 헬퍼가 usage를 출력하고 exit 1
```

## Instructions for Claude

다음 순서로 수행하라:

1. ARGUMENTS에서 액션을 파싱한다.
   - 비어 있거나 `dashboard`만 있으면 action = `""` (default)
   - `start`, `stop`, `status`, `setup` 중 하나이면 그대로 사용
   - 그 외이면 usage를 출력하고 종료

2. `CLAUDE_PLUGIN_ROOT` 환경변수를 Bash에서 확인한다:
   ```bash
   echo "${CLAUDE_PLUGIN_ROOT:-}"
   ```
   비어 있으면 사용자에게 "Claude Code 플러그인 컨텍스트에서 실행하세요." 안내.

3. 헬퍼를 호출한다:
   ```bash
   CTRL_SH="${CLAUDE_PLUGIN_ROOT}/scripts/dashboard-control.sh"
   bash "${CTRL_SH}" <action>
   ```
   (action이 default이면 인자 없이 `bash "${CTRL_SH}"` 호출)

4. 헬퍼 출력을 그대로 사용자에게 전달한다.

5. 헬퍼 종료 코드가 0이면 성공 안내, 비-0이면 실패 안내 (헬퍼의 stderr 메시지 강조 표시).

## Output Format (성공 시)

헬퍼가 출력한 내용을 블록 형태로 감싸 사용자에게 전달:

```
Dashboard 명령 결과:
<헬퍼 stdout 내용>
```

start 성공 시에는 추가로 안내:
```
브라우저에서 http://127.0.0.1:8765 을 열거나,
`/jira dashboard status` 로 상태를 확인할 수 있습니다.
```
