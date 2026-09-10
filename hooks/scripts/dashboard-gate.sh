# dashboard-gate.sh — ingest 훅 공용 게이트 (source 전용).
#
# Dashboard 서버가 떠 있지 않으면 호출한 훅을 즉시 exit 0 시킨다.
# 닫힌 포트로의 curl은 Windows에서 connect-timeout을 다 써서, 동시 실행
# 훅과 겹치면 훅 제한(2s)을 넘긴다. PID 파일은 dashboard-control.sh가
# 관리하며, 재부팅 등으로 남은 stale 파일은 kill -0으로 걸러낸다.
# DASHBOARD_INGEST_URL을 지정하면 게이트 없이 항상 전송한다.
# fork 없이 bash 내장(read/kill)만 사용한다.

if [ -z "${DASHBOARD_INGEST_URL:-}" ]; then
  _dash_pid=""
  _dash_pid_file="${HOME}/.claude/jira-integration/dashboard.pid"
  if [ -f "${_dash_pid_file}" ]; then
    while IFS='=' read -r _k _v; do
      [ "${_k}" = "PID" ] && _dash_pid="${_v}"
    done < "${_dash_pid_file}"
  fi
  { [ -n "${_dash_pid}" ] && kill -0 "${_dash_pid}" 2>/dev/null; } || exit 0
fi
