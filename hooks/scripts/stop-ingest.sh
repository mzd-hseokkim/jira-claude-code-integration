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
        const text = content.find(c => c && c.type === "text");
        if (text && typeof text.text === "string" && text.text.trim()) {
          // 의미 있는 "마지막 줄" 추출:
          // 빈 줄, 코드 펜스(```...), markdown HR(---/===) 제외하고 뒤에서부터.
          const rows = text.text.split("\n").map(s => s.trim());
          let lastLine = "";
          for (let j = rows.length - 1; j >= 0; j--) {
            const r = rows[j];
            if (!r) continue;
            if (/^`{3,}/.test(r)) continue;          // 코드 펜스
            if (/^[-=*_]{3,}$/.test(r)) continue;    // markdown HR
            lastLine = r;
            break;
          }
          // fallback: 모든 라인이 필터링됐으면 raw 마지막 500자 (뒷부분)
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
