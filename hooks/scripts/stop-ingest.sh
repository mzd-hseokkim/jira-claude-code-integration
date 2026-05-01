#!/usr/bin/env bash
# stop-ingest.sh
#
# Stop hook → dashboard ingest forwarder.
# Reads hook payload from stdin, extracts the last assistant text from
# transcript_path, and POSTs the original payload + lastAssistantText
# preview (≤500 chars) to /ingest.
#
# Race mitigation:
#   Claude Code의 Stop hook은 transcript에 응답 본문이 모두 쓰이기 *전*에
#   실행될 때가 있다. 그 결과 hook이 짧은 안내 멘트를 마지막 텍스트로
#   잡아 전송하고, 이후 transcript에 본문이 들어와도 dashboard store는
#   갱신되지 않음. 이를 보정하기 위해:
#     1) 즉시 첫 ingest를 전송 (빠른 카드 갱신)
#     2) 백그라운드로 detached 프로세스를 띄워 1.5초 후 transcript를 다시
#        읽고 두 번째 ingest를 보낸다 — 본문이 추가되었으면 덮어씀.
#   hook 본체는 즉시 종료되어 hook timeout에 영향 없음.

set +e

INGEST_URL="${DASHBOARD_INGEST_URL:-http://127.0.0.1:8765/ingest}"
PAYLOAD="$(cat)"

# transcript에서 마지막 assistant text의 의미 있는 마지막 줄을 뽑아 payload에
# lastAssistantText로 채운 enriched JSON을 stdout으로 출력하는 공통 로직.
extract_and_send() {
  local payload="$1"
  local enriched
  enriched="$(node -e '
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
  ' "$payload" 2>/dev/null)"

  [ -z "$enriched" ] && enriched="$payload"

  curl \
    --connect-timeout 0.5 \
    --max-time 1 \
    --noproxy '*' \
    -s -o /dev/null \
    -X POST \
    -H 'Content-Type: application/json' \
    --data-binary "${enriched}" \
    "${INGEST_URL}?hook=Stop" \
    >/dev/null 2>&1 || true
}

# 1) 즉시 첫 ingest
extract_and_send "$PAYLOAD"

# 2) 백그라운드 재추출 (transcript flush를 기다린 뒤 본문으로 덮어쓰기).
#    detached로 실행해 hook 본체는 즉시 반환.
(
  sleep 1.5
  extract_and_send "$PAYLOAD"
) </dev/null >/dev/null 2>&1 &
disown 2>/dev/null

exit 0
