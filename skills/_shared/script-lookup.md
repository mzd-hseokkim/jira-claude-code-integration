# Shared Script Lookup Pattern

플러그인 `scripts/` 하위 공용 스크립트의 절대 경로를 결정하는 표준 패턴. 스킬은 사용자 프로젝트(워크트리 포함)의 cwd에서 실행되므로 상대 경로만으로는 스크립트를 찾을 수 없다.

## 사용법

호출하는 스킬은 다음 두 변수를 셋업한 뒤 lookup 블록을 실행한다:

- `SCRIPT_NAME` — 찾을 스크립트 파일명 (예: `jira-attach.sh`, `jira-context-update.py`, `propagate-mcp-config.sh`, `append-review-log-wrapper.sh`, `cleanup-worktree-mcp.py`)
- `OUT_VAR` — 결과 절대 경로를 담을 변수명 (예: `JIRA_ATTACH_SH`, `PROPAGATE_SH`)

```bash
SCRIPT_NAME="<스크립트 파일명>"
OUT_VAR="<출력 변수명>"

# 1) CLAUDE_PLUGIN_ROOT  2) cwd  3) repoRoot(.jira-context.json)  4) 플러그인 캐시 최신 semver
# 캐시 fallback은 반드시 sort -V | tail -1로 최신 버전 선택. find ... | head -1은 stale 버전을 잡으므로 금지.
_resolved=""
for _c in "${CLAUDE_PLUGIN_ROOT}/scripts/${SCRIPT_NAME}" \
          "scripts/${SCRIPT_NAME}" \
          "$(node -e "try{console.log(require('./.jira-context.json').repoRoot)}catch{}" 2>/dev/null)/scripts/${SCRIPT_NAME}" \
          "$(find "$HOME/.claude" -name "${SCRIPT_NAME}" -type f 2>/dev/null | sort -V | tail -1)"; do
  [ -n "$_c" ] && [ -f "$_c" ] && _resolved="$_c" && break
done
printf -v "$OUT_VAR" '%s' "$_resolved"
unset _resolved _c
```

찾지 못하면 `$OUT_VAR`는 빈 문자열. 호출자가 빈 값 처리(스킵 + 사용자 안내)를 책임진다.

## Lookup 우선순위 근거

1. **`CLAUDE_PLUGIN_ROOT`** — 플러그인 런타임이 명시 주입할 때 가장 정확.
2. **cwd `scripts/`** — 메인 레포에서 실행 중인 경우.
3. **`.jira-context.json`의 `repoRoot`** — 워크트리에서 실행 중일 때 메인 레포 경로 복원.
4. **플러그인 캐시 최신 semver** — `~/.claude/plugins/cache/.../scripts/`. `sort -V | tail -1`로 최신 선택. `head -1`은 stale 버전을 잡으므로 금지.

## 신규 스크립트 추가

`scripts/` 하위에 신규 공용 스크립트 추가 시 별도 코드 변경 없이 자동 동작. 호출 스킬에서 `SCRIPT_NAME`만 새 파일명으로 바꿔 lookup 블록을 재사용한다.
