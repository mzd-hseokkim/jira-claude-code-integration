#!/usr/bin/env bash
# post-tool-ingest.sh
#
# PostToolUse hook → dashboard ingest forwarder.
# stop-ingest.sh와 동일 로직으로 transcript_path에서 마지막 assistant text를
# 뽑아 payload.lastAssistantText로 채워 POST한다. Stop hook과 달리
# transcript는 이미 flush 되어 있으므로 1.5s 지연 재전송은 생략.
#
# 목적: AI가 도구 호출 사이에 출력하는 중간 응답 텍스트도 dashboard에
# 실시간 반영하기 위함. Stop 훅만으로는 턴 종료 시점에만 갱신되어
# 사용자가 "응답이 안 바뀐다"고 느낌.

set +e

INGEST_URL="${DASHBOARD_INGEST_URL:-http://127.0.0.1:8765/ingest}"
PAYLOAD="$(cat)"

# Windows(Git Bash/MSYS2) UTF-8 → ANSI(CP949) argv 변환 회피.
# payload를 argv 대신 stdin(fd 0)으로 node에 흘린다.
enriched="$(printf '%s' "$PAYLOAD" | node -e '
  const fs = require("fs");
  let payload = {};
  try { payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch {}
  const tp = payload.transcript_path;
  let preview = null;
  if (tp && fs.existsSync(tp)) {
    try {
      const lines = fs.readFileSync(tp, "utf8").split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        let o; try { o = JSON.parse(lines[i]); } catch { continue; }
        if (o.type !== "assistant") continue;
        const content = (o.message && o.message.content) || [];
        let text = null;
        for (let k = content.length - 1; k >= 0; k--) {
          const c = content[k];
          if (c && c.type === "text") { text = c; break; }
        }
        if (text && typeof text.text === "string" && text.text.trim()) {
          const SEPARATOR_RE = /^[\s\-=*_~─━═─-╿]+$/;
          const rows = text.text.split("\n").map(s => s.trim());
          let lastLine = "";
          for (let j = rows.length - 1; j >= 0; j--) {
            const r = rows[j];
            if (!r) continue;
            if (/^`{3,}/.test(r)) continue;
            if (SEPARATOR_RE.test(r)) continue;
            lastLine = r;
            break;
          }
          if (!lastLine) lastLine = text.text.slice(-500);
          preview = lastLine.slice(0, 500);
          break;
        }
      }
    } catch {}
  }
  payload.lastAssistantText = preview;
  process.stdout.write(JSON.stringify(payload));
' 2>/dev/null)"

[ -z "$enriched" ] && enriched="$PAYLOAD"

printf '%s' "${enriched}" | curl \
  --connect-timeout 0.5 \
  --max-time 1 \
  --noproxy '*' \
  -s -o /dev/null \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-binary @- \
  "${INGEST_URL}?hook=PostToolUse" \
  >/dev/null 2>&1 || true

exit 0
