#!/usr/bin/env bash
# stop-ingest.sh
#
# Stop hook → dashboard ingest forwarder.
# Reads hook payload from stdin, extracts the last assistant text from
# transcript_path, and POSTs the original payload + lastAssistantText
# preview (≤500 chars) to /ingest.
#
# Principles: fail-silent, exit 0 always, ≤1s wall time.

set +e

INGEST_URL="${DASHBOARD_INGEST_URL:-http://127.0.0.1:8765/ingest}"
PAYLOAD="$(cat)"

# Extract preview via node (jq may not be installed; node is required by other hooks).
ENRICHED="$(node -e '
  const fs = require("fs");
  let payload = {};
  try { payload = JSON.parse(process.argv[1] || "{}"); } catch {}
  const tp = payload.transcript_path;
  let preview = null;
  if (tp && fs.existsSync(tp)) {
    try {
      const lines = fs.readFileSync(tp, "utf8").split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        let o; try { o = JSON.parse(lines[i]); } catch { continue; }
        if (o.type !== "assistant") continue;
        const content = (o.message && o.message.content) || [];
        // 한 assistant 메시지에 text 블록이 여러 개일 때(예: 도구 사용 전 짧은
        // 안내 한 줄 + 도구 결과 후 결론 본문) 마지막 text 블록을 우선 채택.
        let text = null;
        for (let k = content.length - 1; k >= 0; k--) {
          const c = content[k];
          if (c && c.type === "text") { text = c; break; }
        }
        if (text && typeof text.text === "string" && text.text.trim()) {
          // 의미 있는 "마지막 줄" 추출.
          // 제외 대상: 빈 줄, 코드 펜스, markdown HR, 박스/구분선 문자만으로 된 줄.
          const SEPARATOR_RE = /^[\s\-=*_~─━═─-╿]+$/;
          const rows = text.text.split("\n").map(s => s.trim());
          let lastLine = "";
          for (let j = rows.length - 1; j >= 0; j--) {
            const r = rows[j];
            if (!r) continue;
            if (/^`{3,}/.test(r)) continue;       // 코드 펜스
            if (SEPARATOR_RE.test(r)) continue;   // markdown HR + 박스 그리기 문자 줄
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
' "$PAYLOAD" 2>/dev/null)"

# Fallback: if enrichment failed, forward original payload unchanged.
[ -z "$ENRICHED" ] && ENRICHED="$PAYLOAD"

curl \
  --connect-timeout 0.5 \
  --max-time 1 \
  --noproxy '*' \
  -s \
  -o /dev/null \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-binary "${ENRICHED}" \
  "${INGEST_URL}?hook=Stop" \
  || true

exit 0
