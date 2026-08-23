---
name: jira-task-start
description: "Start working on a Jira task — creates a feature branch or worktree and transitions the issue to In Progress. Triggers: jira-task start, start task; 작업 시작, 태스크 시작."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
---

# jira-task-start: Start Working on a Jira Task

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Prerequisites
- Jira MCP server must be connected (check with `/jira`)
- Current directory should be inside a git repository
- TASK-ID must be a valid Jira issue key (e.g., PROJ-123)

## Workflow

### Step 0: Detect Mode (post-init vs fresh)

cwd에서 `.jira-context.json`을 `Read`로 읽어보고 아래로 분기 — **init이 이미 워크트리·README·context를 만들어둔 상태이면 중복 작업을 건너뛴다.**

- **post-init 모드** (hot path): 파일이 존재하고 `taskId === <TASK-ID>`이며 `worktreePath`가 디스크에 있음.
  - Step 3(worktree 생성 체크), Step 4(README 생성)를 **스킵**한다.
  - Step 6은 통째 rewrite 대신 patch (기존 필드 보존 + 추가).
- **fresh 모드**: 위 조건 미충족.
  - 모든 Step 그대로 수행.

이 분기 결정은 사용자에게 한 줄로 알려준다 — 예: `📂 post-init 모드: worktree·README·context 재생성 생략.`

### Step 1: Fetch Issue Details (cache-first)

먼저 `.jira-context.json`의 `cachedIssue`를 확인한다. **모든 필수 필드(`summary`, `description`, `priority`, `assignee`, `issuetype`)가 채워져 있고 `fetchedAt`이 있으면 fetch를 건너뛴다** — init이 만들어둔 캐시가 이미 충분한 경우.

cache miss면 `jira-cli.py`로 조회 (`skills/_shared/jira-cli.md` — MCP 도구 대신 Bash 1회):

```bash
python3 "<scripts>/jira-cli.py" get <TASK-ID> --fields subtasks,issuelinks
```

호출 후 결과를 **worktree-local** `.jira-context.json`의 `cachedIssue`에 저장한다 (CLAUDE.md "Issue Cache" 참고 — 후속 단계가 재조회를 생략할 수 있게). `fetchedAt`은 반드시 `new Date().toISOString()` (UTC `Z`) 형식.

> ⛔ **fresh 모드에서는 이 시점에 worktree-local 파일이 아직 없다 — cwd 파일에 쓰지 말고 메모리로만 유지**했다가 Step 6에서 worktree-local context를 생성할 때 기록한다. cwd의 `.jira-context.json`이 aggregate(`tasks[]` 존재)인 경우 거기에 `cachedIssue`를 쓰면 최상위가 오염된다 (절대 금지).

Display to the user:
- **Key**: Issue key
- **Summary**: Issue title
- **Status**: Current status
- **Priority**: Priority level
- **Assignee**: Who it's assigned to
- **Description**: Issue description (truncated if very long)
- **Acceptance Criteria**: If present in description
- **Sub-tasks**: If any
- **Linked Issues**: If any

### Step 1.5: Self-Assign (현재 토큰 사용자로 담당자 지정)

작업을 시작하는 계정으로 이슈 담당자를 지정한다.

1. `python3 "<scripts>/jira-cli.py" whoami` → 현재 토큰 사용자의 `accountId`·`displayName`.
2. `cachedIssue.assignee`(또는 Step 1의 현재 담당자)가 이미 이 사용자면 **호출 생략** (중복 write 방지).
3. 다르면 `python3 "<scripts>/jira-cli.py" assign <TASK-ID>` (기본 me).
4. 성공 시 `cachedIssue.assignee`를 이 사용자 표시명으로 갱신한다 (Step 1 캐시 patch에 반영 → 이후 Display·README가 본인으로 보이도록).

**비차단**: 권한 부족 등으로 실패하면 한 줄 경고만 출력하고 워크플로를 계속한다 (transition 단계와 동일 정책).
```
⚠ 담당자 자동 지정 실패 (<사유>) — 수동으로 할당하세요.
```

### Step 2: Transition to "In Progress"

```bash
python3 "<scripts>/jira-cli.py" transitions <TASK-ID>          # [{id,name,to}] — "In Progress"/"진행 중" 류를 고른다
python3 "<scripts>/jira-cli.py" transition <TASK-ID> "<id>"    # 출력 {"key","status"} = 전이 후 실제 상태 (재조회 불필요)
```

`transition` 출력의 `status`가 곧 `<fresh-jira-status>`다 (Step 6에 그대로 전달). 코멘트는 전이에 섞지 않고 Step 5에서 별도로 올린다.

If the transition fails, the issue may already be in progress or the transition name differs.
In that case, inform the user of the current status and continue with the remaining steps.

### Step 3: Create Feature Branch / Worktree (fresh mode only)

**post-init 모드면 본 Step 스킵.** Step 0에서 `.jira-context.json`의 `worktreePath`가 디스크에 존재함을 이미 확인했으므로 git 체크 자체가 불필요.

**fresh 모드**: worktree를 새로 생성:
```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$REPO_ROOT")
PROJECT_NAME=$(basename "$REPO_ROOT")
WORKTREE_BASE="$PARENT_DIR/${PROJECT_NAME}_worktree"
mkdir -p "$WORKTREE_BASE"

# base branch 감지 (develop → main → master)
git rev-parse --verify develop 2>/dev/null  # 1st
git rev-parse --verify main 2>/dev/null     # 2nd
git rev-parse --verify master 2>/dev/null   # 3rd

git worktree add -b "feature/<TASK-ID>" "$WORKTREE_BASE/<TASK-ID>" <base-branch>
```

**(선택 — MCP 서버를 쓰는 경우에만)** jira-cli는 메인 레포 `.jira-context.json`의 `jira` 블록을 worktree에서도 찾아 읽으므로 CLI만 쓰면 전파가 필요 없다 — 이 경우 이 단계를 건너뛴다. MCP 서버를 등록해 쓰는 환경에서만 메인 레포의 atlassian MCP 설정을 worktree로 전파한다 (worktree는 별도 프로젝트 루트로 인식되어 MCP 설정이 자동 상속되지 않음 — init Step 5.5와 동일). 스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
REPO_ROOT_ABS="<REPO_ROOT 절대경로>"
WORKTREE_ABS="<워크트리 절대경로>"

SCRIPT_NAME="propagate-mcp-config.sh" OUT_VAR="PROPAGATE_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here

if [ -n "$PROPAGATE_SH" ]; then
  bash "$PROPAGATE_SH" "$REPO_ROOT_ABS" "$WORKTREE_ABS"
else
  echo "propagate-mcp-config.sh not found — skipping MCP propagation. Run /jira setup in the worktree if needed." >&2
fi
```

### Step 4: Generate Task Context README (fresh mode only)

**post-init 모드면 본 Step 스킵.** init이 이미 만든 `TASK-README.md`를 덮어쓰지 않는다. 보강이 필요하면 사용자가 직접 수정.

**fresh 모드**: `TASK-README.md`를 worktree 디렉토리(또는 branch는 project root)에 생성:

```markdown
# <TASK-ID>: <Summary>

## Issue Details
- **Status**: In Progress
- **Priority**: <priority>
- **Assignee**: <assignee>
- **Branch**: feature/<TASK-ID>
- **Started**: <current date/time>

## Description
<issue description from Jira>

## Acceptance Criteria
<extracted from description if available>

## Related Issues
<linked issues if any>
```

### Step 5: Post Comment to Jira

```bash
python3 "<scripts>/jira-cli.py" comment <TASK-ID> "## Start Work
브랜치 \`feature/<TASK-ID>\`에서 개발을 시작했습니다. 작업 디렉토리: \`<worktree-path or branch>\`"
```

### Step 6: Patch Local Context

`skills/_shared/context-update.md` 패턴으로 worktree-local + aggregate 두 파일을 한 번에 갱신한다. LLM 인라인 JSON patch 금지 — 누락/덮어쓰기 사고 방지.

호출 직전 `skills/_shared/script-lookup.md`로 `JIRA_CTX_UPDATE_PY` 절대경로를 해석:

```bash
SCRIPT_NAME="jira-context-update.py" OUT_VAR="JIRA_CTX_UPDATE_PY"
# Read skills/_shared/script-lookup.md and execute its lookup block here
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> start "<fresh-jira-status>" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

- `<fresh-jira-status>`: Step 2 `transition` 출력의 `status` (전이 후 실제 status명 (예: `"In Progress"`, `"진행 중"`). transition 시도값을 그대로 쓰지 말 것.
- `<repoRoot>`: worktree-local 파일의 `repoRoot` 필드. 없으면 `git worktree list | head -1`로 폴백.

스크립트는 `completedSteps`에 `"start"` 추가, `status` 갱신, `startAt` 기록, `cachedIssue.status`/`fetchedAt` 갱신을 일괄 처리한다.

`cachedIssue` 본문은 Step 1 fetch 결과로 worktree-local 파일에 미리 patch해두어야 스크립트가 status/fetchedAt만 깔끔히 갱신한다.

파일이 없는 경우(fresh 모드)에만 새로 만든 뒤 위 스크립트를 호출한다.

### Step 7: PDCA 권고

Completion Summary 직전에 다음 형식의 권고 블록을 출력한다. 이슈 요약·설명·타입·범위를 바탕으로 LLM이 판단한다 — 별도 휴리스틱 표나 분류기를 사용하지 않는다.

- **판단 대상**: `approach`, `test` 두 단계만. `impl`/`review`/`merge`/`done`은 항상 필수이므로 판단 대상에서 제외.
- **판단 근거**: 작업 성격(신규 기능 / 리팩토링 / 버그픽스 / 문서·설정 변경), 변경 범위, 리스크.
- **저장하지 않는다**: `.jira-context.json`이나 다른 곳에 기록하지 않는다. 한 세션 안에서만 의미를 가지며, 통신은 응답 텍스트로 끝낸다.
- **사용자 오버라이드**: 사용자가 다음 턴에 자연어("test는 넣어줘")로 알려주면 그대로 따른다. 별도 플래그·저장 없음.

출력 형식 예:

```
🔍 PDCA 권고
- 필수: approach, impl, review, merge
- 스킵 가능: test (사유: SKILL.md 텍스트 추가뿐, 동작 변경 없음)
```

스킵 가능 단계가 없으면 "스킵 가능: 없음"으로 출력. 권고는 본 응답 1회만 노출하고, 후속 단계가 자동으로 다시 출력하지 않는다.

### Step 8: Completion Summary

아래 형식으로 완료 요약 출력:

```
---
✅ **Start Complete** — <TASK-ID>

- 이슈 상태: In Progress
- 담당자: <본인 표시명> (자동 지정)
- 브랜치: feature/<TASK-ID>
- Worktree: <path>
- Jira 코멘트 게시됨

**Progress**: init → **start ✓** → approach → impl → test → review → merge → pr → done

**Next**: `/jira-task approach <TASK-ID>` — level-aware approach 문서를 작성합니다 (Step 7의 권고에 따라 다른 단계로 바로 갈 수도 있음)
---
```
