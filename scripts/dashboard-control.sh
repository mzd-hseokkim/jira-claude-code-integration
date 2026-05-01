#!/usr/bin/env bash
# dashboard-control.sh — Dashboard lifecycle helper for /jira dashboard skill.
# Functions: require_plugin_root, pid_file_path, read_pid_file, write_pid_file,
#            is_running, check_plugin_root_match, dashboard_setup, dashboard_start,
#            dashboard_stop, dashboard_status, cmd_default
# Usage: bash dashboard-control.sh <start|stop|status|setup|"">
# Return: 0=success, non-zero=error. stdout=user output. stderr=warnings/errors.

set -euo pipefail

# ---------------------------------------------------------------------------
# require_plugin_root
#   Exits 1 with friendly message if CLAUDE_PLUGIN_ROOT is not set or empty.
# ---------------------------------------------------------------------------
require_plugin_root() {
  if [[ -z "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    echo "오류: CLAUDE_PLUGIN_ROOT 환경변수가 정의되지 않았습니다." >&2
    echo "  이 스크립트는 Claude Code 플러그인 컨텍스트 외에서 직접 실행할 수 없습니다." >&2
    echo "  /jira dashboard 슬래시 커맨드를 Claude Code 안에서 실행하세요." >&2
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
# check_plugin_root_match
#   -> 0=match (or already running with correct root)
#   -> 1=mismatch (running with different root)
#   -> 2=stopped (no PID file)
# ---------------------------------------------------------------------------
check_plugin_root_match() {
  require_plugin_root
  local pid_file
  pid_file="$(pid_file_path)"
  if [[ ! -f "${pid_file}" ]]; then
    return 2  # stopped
  fi
  local file_root
  file_root="$(grep '^PLUGIN_ROOT=' "${pid_file}" | cut -d= -f2-)"
  if [[ "${file_root}" == "${CLAUDE_PLUGIN_ROOT}" ]]; then
    return 0  # match
  else
    return 1  # mismatch
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
    echo "Dashboard 서버(PID ${pid})를 종료합니다 ..."
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
  else
    echo "상태: stopped (stale PID 파일 감지 → 자동 정리)"
    rm -f "${pid_file}"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# cmd_default
#   No-argument entrypoint: status check → stopped=setup+start, mismatch=restart,
#   running=info only.
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
    # Running — check plugin root match
    # NOTE: same set -e guard; check_plugin_root_match returns 1 on mismatch.
    local match_state
    check_plugin_root_match || match_state=$?
    match_state=${match_state:-0}
    if [[ "${match_state}" -eq 1 ]]; then
      # Mismatch: old version is running
      local pid_file
      pid_file="$(pid_file_path)"
      local old_root
      old_root="$(grep '^PLUGIN_ROOT=' "${pid_file}" | cut -d= -f2-)"
      echo "버전 변경 감지: 실행 중인 Dashboard의 플러그인 경로가 현재와 다릅니다."
      echo "  이전 경로: ${old_root}"
      echo "  현재 경로: ${CLAUDE_PLUGIN_ROOT}"
      echo "기존 서버를 중지하고 새 버전으로 재기동합니다 ..."
      dashboard_stop || true
      dashboard_start
      return $?
    else
      # Running with correct root — just show status
      dashboard_status
      return 0
    fi
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
