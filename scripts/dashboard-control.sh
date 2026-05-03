#!/usr/bin/env bash
# dashboard-control.sh — Dashboard lifecycle helper for /jira dashboard skill.
# Functions: require_plugin_root, pid_file_path, read_pid_file, write_pid_file,
#            is_running, dashboard_setup, dashboard_start,
#            dashboard_stop, dashboard_status, dashboard_register_and_attach,
#            _fetch_workspaces_summary, cmd_default
# Usage: bash dashboard-control.sh <start|stop|status|setup|"">
# Return: 0=success, non-zero=error. stdout=user output. stderr=warnings/errors.

set -euo pipefail

# ---------------------------------------------------------------------------
# CLAUDE_PLUGIN_ROOT 자동 탐색 (셸 환경변수 비주입 케이스 대응)
#   Claude Code의 hook command 문자열에서는 ${CLAUDE_PLUGIN_ROOT}가 자동 치환되지만
#   skill의 Bash tool 셸에는 항상 주입되지는 않는다. 본 스크립트는 항상
#   <plugin-root>/scripts/dashboard-control.sh 경로에 있으므로, 자기 위치 한 단계
#   위를 plugin root로 자동 채택한다 (env 미설정 시).
# ---------------------------------------------------------------------------
if [[ -z "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  _self="${BASH_SOURCE[0]:-$0}"
  _self_dir="$(cd -- "$(dirname -- "$_self")" && pwd)"
  CLAUDE_PLUGIN_ROOT="$(cd -- "$_self_dir/.." && pwd)"
  export CLAUDE_PLUGIN_ROOT
fi

# ---------------------------------------------------------------------------
# require_plugin_root
#   여기까지 왔는데도 비어 있으면(자기 위치 추정 실패) 친화적 에러로 종료.
# ---------------------------------------------------------------------------
require_plugin_root() {
  if [[ -z "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    echo "오류: CLAUDE_PLUGIN_ROOT를 자동으로 결정할 수 없습니다." >&2
    echo "  스크립트 위치 기반 추정이 실패했습니다 ($0)." >&2
    echo "  CLAUDE_PLUGIN_ROOT를 직접 export 후 재시도하세요." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# pid_file_path  -> stdout: absolute path to PID file
#   Creates parent directory (~/.claude/jira-integration/) with 700 if absent.
# ---------------------------------------------------------------------------
pid_file_path() {
  local dir="${HOME}/.claude/jira-integration"
  mkdir -p "${dir}"
  chmod 700 "${dir}"
  echo "${dir}/dashboard.pid"
}

# ---------------------------------------------------------------------------
# read_pid_file  -> stdout: KEY=VALUE lines (PID/PORT/PLUGIN_ROOT/STARTED_AT)
#   Outputs nothing if file does not exist.
# ---------------------------------------------------------------------------
read_pid_file() {
  local pid_file
  pid_file="$(pid_file_path)"
  if [[ -f "${pid_file}" ]]; then
    cat "${pid_file}"
  fi
}

# ---------------------------------------------------------------------------
# write_pid_file <pid> <port> <plugin_root> <started_at>
#   Creates/overwrites PID file with 0600 permissions.
# ---------------------------------------------------------------------------
write_pid_file() {
  local pid="${1}"
  local port="${2}"
  local plugin_root="${3}"
  local started_at="${4}"
  local pid_file
  pid_file="$(pid_file_path)"
  {
    echo "PID=${pid}"
    echo "PORT=${port}"
    echo "PLUGIN_ROOT=${plugin_root}"
    echo "STARTED_AT=${started_at}"
  } > "${pid_file}"
  chmod 600 "${pid_file}"
}

# ---------------------------------------------------------------------------
# is_running  -> 0=running, 1=stopped (no PID file), 2=stale (file but no process)
# ---------------------------------------------------------------------------
is_running() {
  local pid_file
  pid_file="$(pid_file_path)"
  if [[ ! -f "${pid_file}" ]]; then
    return 1  # stopped
  fi
  local pid
  pid="$(grep '^PID=' "${pid_file}" | cut -d= -f2)"
  if [[ -z "${pid}" ]]; then
    return 1  # stopped (malformed file treated as stopped)
  fi
  if kill -0 "${pid}" 2>/dev/null; then
    return 0  # running
  else
    return 2  # stale
  fi
}

# ---------------------------------------------------------------------------
# dashboard_setup
#   Checks 3 cache markers; skips if all present. Otherwise runs npm install
#   and web build.
# ---------------------------------------------------------------------------
dashboard_setup() {
  require_plugin_root
  local root="${CLAUDE_PLUGIN_ROOT}"
  local marker1="${root}/node_modules"
  local marker2="${root}/scripts/dashboard/web/node_modules"
  local marker3="${root}/scripts/dashboard/public/index.html"

  if [[ -d "${marker1}" && -d "${marker2}" && -f "${marker3}" ]]; then
    echo "셋업 캐시 확인됨 — npm install 및 빌드를 건너뜁니다."
    return 0
  fi

  echo "Dashboard 셋업을 시작합니다 (${root}) ..."

  # Root dependencies
  echo "  [1/2] 플러그인 root 의존성 설치 중 (npm install) ..."
  if ! npm --prefix "${root}" install; then
    echo "오류: npm install 실패. 로그를 확인하세요." >&2
    echo "  로그 위치: 터미널 출력 또는 ~/.npm/_logs/ 참조" >&2
    return 1
  fi

  # Web app build
  echo "  [2/2] Web UI 빌드 중 (npm --prefix scripts/dashboard/web install && run build) ..."
  if ! npm --prefix "${root}/scripts/dashboard/web" install; then
    echo "오류: web 의존성 설치 실패." >&2
    return 1
  fi
  if ! npm --prefix "${root}/scripts/dashboard/web" run build; then
    echo "오류: web 빌드 실패." >&2
    return 1
  fi

  echo "셋업 완료."
  return 0
}

# ---------------------------------------------------------------------------
# dashboard_start
#   Ensures setup, then spawns dashboard server detached.
# ---------------------------------------------------------------------------
dashboard_start() {
  require_plugin_root
  local root="${CLAUDE_PLUGIN_ROOT}"
  local port=8765

  # Already running?
  if is_running; then
    local pid_file
    pid_file="$(pid_file_path)"
    local pid started_at
    pid="$(grep '^PID=' "${pid_file}" | cut -d= -f2)"
    started_at="$(grep '^STARTED_AT=' "${pid_file}" | cut -d= -f2-)"
    echo "Dashboard가 이미 실행 중입니다."
    echo "  URL        : http://127.0.0.1:${port}"
    echo "  PID        : ${pid}"
    echo "  시작 시각  : ${started_at}"
    return 0
  fi

  # Stale PID file? Clean up silently.
  local pid_file
  pid_file="$(pid_file_path)"
  if [[ -f "${pid_file}" ]]; then
    echo "오래된 PID 파일을 정리합니다." >&2
    rm -f "${pid_file}"
  fi

  # Ensure setup is done
  dashboard_setup || return 1

  # Prepare log directory
  local log_dir="${root}/logs"
  mkdir -p "${log_dir}"
  local log_file="${log_dir}/dashboard-server.log"

  echo "Dashboard 서버를 시작합니다 ..."

  # Launch detached
  local server_js="${root}/scripts/dashboard/server.js"
  DASHBOARD_NO_OPEN=1 nohup node "${server_js}" \
    > "${log_file}" 2>&1 < /dev/null &
  local server_pid=$!
  disown "${server_pid}" 2>/dev/null || true

  # Verify it stayed alive (1s grace)
  sleep 1
  if ! kill -0 "${server_pid}" 2>/dev/null; then
    echo "오류: 서버가 즉시 종료되었습니다. 로그를 확인하세요:" >&2
    echo "  ${log_file}" >&2
    echo "  포트 충돌 시: lsof -i :${port}" >&2
    return 1
  fi

  local started_at
  started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  write_pid_file "${server_pid}" "${port}" "${root}" "${started_at}"

  echo "Dashboard 시작 완료!"
  echo "  URL        : http://127.0.0.1:${port}"
  echo "  PID        : ${server_pid}"
  echo "  로그       : ${log_file}"
  echo "  시작 시각  : ${started_at}"
  return 0
}

# ---------------------------------------------------------------------------
# dashboard_stop
#   Reads PID from file, kills process (graceful), removes PID file.
#   Multi-workspace 의도: dashboard 서버는 단일 프로세스이므로 stop은 등록된
#   모든 workspace를 함께 종료한다 (개별 unregister가 아니라 서버 자체 종료).
# ---------------------------------------------------------------------------
dashboard_stop() {
  local pid_file
  pid_file="$(pid_file_path)"

  if [[ ! -f "${pid_file}" ]]; then
    echo "Dashboard가 실행 중이지 않습니다 (PID 파일 없음)."
    return 0
  fi

  local pid
  pid="$(grep '^PID=' "${pid_file}" | cut -d= -f2)"

  if [[ -z "${pid}" ]]; then
    echo "PID 파일이 손상되었습니다. 파일을 삭제합니다." >&2
    rm -f "${pid_file}"
    return 0
  fi

  if kill -0 "${pid}" 2>/dev/null; then
    echo "Dashboard 서버(PID ${pid})를 종료합니다 — 등록된 모든 workspace가 함께 정지됩니다."
    if ! kill "${pid}" 2>/dev/null; then
      echo "경고: kill ${pid} 실패. 이미 종료된 것으로 처리합니다." >&2
    else
      echo "종료 완료."
    fi
  else
    echo "경고: PID ${pid} 프로세스가 이미 없습니다. PID 파일만 정리합니다." >&2
  fi

  rm -f "${pid_file}"
  echo "Dashboard가 중지되었습니다."
  return 0
}

# ---------------------------------------------------------------------------
# dashboard_status
#   Reports running/stopped/stale. Stale → auto-clean PID file.
# ---------------------------------------------------------------------------
dashboard_status() {
  local pid_file
  pid_file="$(pid_file_path)"

  if [[ ! -f "${pid_file}" ]]; then
    echo "상태: stopped (Dashboard가 실행 중이지 않습니다)"
    return 0
  fi

  local pid port started_at
  pid="$(grep '^PID=' "${pid_file}" | cut -d= -f2)"
  port="$(grep '^PORT=' "${pid_file}" | cut -d= -f2)"
  started_at="$(grep '^STARTED_AT=' "${pid_file}" | cut -d= -f2-)"

  if [[ -z "${pid}" ]]; then
    echo "경고: PID 파일이 손상되었습니다. 파일을 삭제합니다." >&2
    rm -f "${pid_file}"
    echo "상태: stopped"
    return 0
  fi

  if kill -0 "${pid}" 2>/dev/null; then
    echo "상태: running"
    echo "  URL        : http://127.0.0.1:${port:-8765}"
    echo "  PID        : ${pid}"
    echo "  시작 시각  : ${started_at}"
    echo ""
    _fetch_workspaces_summary "${port:-8765}" || true
  else
    echo "상태: stopped (stale PID 파일 감지 → 자동 정리)"
    rm -f "${pid_file}"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# _fetch_workspaces_summary <port>
#   Print a plain-text table of registered workspaces + collector health.
#   Tries:
#     1) curl GET http://127.0.0.1:<port>/workspaces (timeout 1s)
#     2) node -e require('../scripts/dashboard/workspaces').list()  → health=unknown
#     3) workspaces.json direct read                                 → health=unknown
#   Always returns 0 — best-effort, status command must not fail because of this.
# ---------------------------------------------------------------------------
_fetch_workspaces_summary() {
  local port="${1:-8765}"
  local body=""
  local source=""

  # Try 1: curl
  if command -v curl >/dev/null 2>&1; then
    body="$(curl -sS --max-time 1 "http://127.0.0.1:${port}/workspaces" 2>/dev/null || true)"
    if [[ -n "${body}" ]]; then
      source="http"
    fi
  fi

  # Try 2: node http
  if [[ -z "${body}" ]] && command -v node >/dev/null 2>&1; then
    body="$(node -e "
      const http=require('http');
      const req=http.get({host:'127.0.0.1',port:${port},path:'/workspaces',timeout:1000},(res)=>{
        let b='';res.on('data',(c)=>b+=c);res.on('end',()=>process.stdout.write(b));
      });
      req.on('error',()=>process.exit(0));
      req.on('timeout',()=>{req.destroy();process.exit(0)});
    " 2>/dev/null || true)"
    if [[ -n "${body}" ]]; then
      source="http"
    fi
  fi

  # Try 3: workspaces.json direct (health=unknown)
  if [[ -z "${body}" ]] && command -v node >/dev/null 2>&1; then
    local plugin_root="${CLAUDE_PLUGIN_ROOT:-}"
    if [[ -n "${plugin_root}" && -f "${plugin_root}/scripts/dashboard/workspaces.js" ]]; then
      body="$(node -e "
        const w=require('${plugin_root}/scripts/dashboard/workspaces');
        const list=w.list();
        process.stdout.write(JSON.stringify({workspaces:list.map((e)=>({path:e.path,registeredAt:e.registeredAt,lastSeenAt:e.lastSeenAt,status:e.status,health:'unknown',worktreeCount:0})),serverPluginRoot:null,serverNowMs:Date.now()}));
      " 2>/dev/null || true)"
      if [[ -n "${body}" ]]; then
        source="registry-file"
      fi
    fi
  fi

  if [[ -z "${body}" ]]; then
    echo "  Workspaces : (조회 실패 — 서버 응답 없음)"
    return 0
  fi

  # Parse JSON via node and emit a plain-text table.
  printf '%s' "${body}" | WS_SRC="${source}" node -e '
    let raw="";process.stdin.on("data",(c)=>raw+=c);process.stdin.on("end",()=>{
      let j;try{j=JSON.parse(raw)}catch{console.log("  Workspaces : (응답 파싱 실패)");return;}
      const ws=Array.isArray(j.workspaces)?j.workspaces:[];
      const src=process.env.WS_SRC||"";
      console.log("  Workspaces (" + ws.length + (src?" / source="+src:"") + "):");
      if(ws.length===0){console.log("    (등록된 워크스페이스 없음)");return;}
      const rows=ws.map((w)=>({
        path:String(w.path||""),
        last:String(w.lastSeenAt||"").replace(/\.\d+Z$/,"Z"),
        health:String(w.health||"unknown"),
        wc:Number(w.worktreeCount||0),
      }));
      const wPath=Math.max(4,...rows.map((r)=>r.path.length));
      const wLast=Math.max(9,...rows.map((r)=>r.last.length));
      const wHealth=Math.max(6,...rows.map((r)=>r.health.length));
      const pad=(s,n)=>s+" ".repeat(Math.max(0,n-s.length));
      console.log("    " + pad("PATH",wPath) + "  " + pad("LAST_SEEN",wLast) + "  " + pad("HEALTH",wHealth) + "  WT");
      for(const r of rows){
        console.log("    " + pad(r.path,wPath) + "  " + pad(r.last,wLast) + "  " + pad(r.health,wHealth) + "  " + r.wc);
      }
    });
  ' 2>/dev/null || echo "  Workspaces : (출력 실패)"
  return 0
}

# ---------------------------------------------------------------------------
# dashboard_register_and_attach
#   Register cwd into the workspace registry and print attach status.
#   Idempotent — repeated calls just bump lastSeenAt.
#
#   On registry write failure: warn + still print status (graceful degrade).
# ---------------------------------------------------------------------------
dashboard_register_and_attach() {
  require_plugin_root
  local cwd
  cwd="$(pwd)"

  if ! command -v node >/dev/null 2>&1; then
    echo "경고: node를 찾지 못했습니다. workspace 등록을 건너뜁니다." >&2
    dashboard_status
    return 0
  fi

  # Call workspaces.register(cwd) and detect new vs existing entry.
  # Output: "NEW" or "EXISTING" or "ERROR:<msg>"
  local result
  result="$(CWD_VAL="${cwd}" node -e "
    try{
      const w=require(process.env.CLAUDE_PLUGIN_ROOT + '/scripts/dashboard/workspaces');
      const before=w.list().some((e)=>e.path===require('path').resolve(process.env.CWD_VAL));
      const entry=w.register(process.env.CWD_VAL);
      process.stdout.write(before?'EXISTING':'NEW');
    }catch(err){process.stdout.write('ERROR:'+err.message);}
  " 2>/dev/null || echo "ERROR:node-failed")"

  case "${result}" in
    NEW)
      echo "Dashboard에 attach합니다 — 현재 cwd를 신규 workspace로 등록했습니다."
      echo "  cwd : ${cwd}"
      ;;
    EXISTING)
      echo "Dashboard에 attach합니다 — 현재 cwd는 이미 등록되어 있습니다 (lastSeenAt 갱신)."
      echo "  cwd : ${cwd}"
      ;;
    ERROR:*)
      echo "경고: workspace 등록 실패 — attach만 진행합니다." >&2
      echo "  사유: ${result#ERROR:}" >&2
      ;;
  esac

  echo ""
  dashboard_status
  return 0
}

# ---------------------------------------------------------------------------
# cmd_default
#   No-argument entrypoint: status check → stopped=setup+start, stale=cleanup+start,
#   running=register+attach (multi-workspace: never restart on plugin-root change).
# ---------------------------------------------------------------------------
cmd_default() {
  require_plugin_root

  # Check running state
  # NOTE: is_running returns non-zero for stopped/stale; use || true to prevent
  # set -e from terminating the script before we can inspect the exit code.
  local run_state
  is_running || run_state=$?
  run_state=${run_state:-0}
  # run_state: 0=running, 1=stopped, 2=stale

  if [[ "${run_state}" -eq 0 ]]; then
    # Running — register cwd into the workspace registry and attach.
    # Multi-workspace: PLUGIN_ROOT 차이는 정상 (각 worktree마다 다른 plugin root 가능).
    dashboard_register_and_attach
    return $?
  elif [[ "${run_state}" -eq 2 ]]; then
    # Stale: clean up and start fresh
    echo "오래된 PID 파일을 정리하고 Dashboard를 시작합니다 ..."
    local pid_file
    pid_file="$(pid_file_path)"
    rm -f "${pid_file}"
    dashboard_start
    return $?
  else
    # Stopped: setup + start
    dashboard_start
    return $?
  fi
}

# ---------------------------------------------------------------------------
# main dispatcher
# ---------------------------------------------------------------------------
main() {
  local action="${1:-}"
  case "${action}" in
    start)  dashboard_start ;;
    stop)   dashboard_stop ;;
    status) dashboard_status ;;
    setup)  dashboard_setup ;;
    "")     cmd_default ;;
    *)
      echo "사용법: /jira dashboard [start|stop|status|setup]" >&2
      echo "  (인자 없음): Dashboard 상태 확인 후 자동 시작" >&2
      echo "  start  : Dashboard 시작" >&2
      echo "  stop   : Dashboard 중지" >&2
      echo "  status : 현재 상태 조회" >&2
      echo "  setup  : npm 의존성 설치 및 UI 빌드만 수행" >&2
      exit 1
      ;;
  esac
}

main "$@"
