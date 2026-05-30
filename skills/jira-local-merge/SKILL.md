---
name: jira-local-merge
description: "Locally merge a Jira task branch into the base branch without a remote or PR. Triggers: jira-task merge, local merge; 로컬 병합, 원격 없이 병합."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_transition_issue
  - mcp__atlassian__jira_get_transitions
  - mcp__atlassian__jira_add_comment
---

# jira-local-merge: Local Branch Merge

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

remote origin 없이 feature 브랜치를 base 브랜치로 로컬 병합하고,
Jira 상태 전환 및 worktree 정리까지 일괄 처리한다.

## Prerequisites
- feature 브랜치에 커밋이 존재
- Jira MCP 서버 연결됨

## Workflow

### Context Optimization

이 스킬에서 `mcp__atlassian__jira_get_issue`를 호출하는 경우 다음 파라미터를 사용한다 (병합/전환에 필요한 메타만):
- `fields="summary,status,issuetype"`
- `comment_limit=0`

### Step 1: Load Context

`.jira-context.json`을 읽어 태스크 컨텍스트 로드:
- `taskId`, `branch`, `baseBranch`, `worktreePath`, `repoRoot`

인자로 TASK-ID가 전달된 경우 해당 값 우선 사용.

`repoRoot`가 없으면 `git worktree list`의 첫 번째 줄로 폴백:
```bash
# git worktree list 첫 번째 줄이 항상 메인 레포 경로
git worktree list | head -1 | awk '{print $1}'
```
`git worktree list --porcelain | awk 'NR==2{print $2; exit}'`도 동일 결과.
`git rev-parse --show-toplevel`은 워크트리 안에서는 워크트리 경로를 반환하므로 사용하지 않음.

`baseBranch`가 없으면 `repoRoot`에서 감지:
```bash
git -C "<repoRoot>" rev-parse --verify develop 2>/dev/null
git -C "<repoRoot>" rev-parse --verify main 2>/dev/null
git -C "<repoRoot>" rev-parse --verify master 2>/dev/null
```

### Step 2: Pre-flight Checks & Auto-commit

```bash
# 1. feature 브랜치 존재 확인
git branch --list "feature/<TASK-ID>"

# 2. 워크트리 내 미커밋 변경사항 확인
git -C "<worktreePath>" status --porcelain
```

미커밋 변경사항이 있으면 **사용자에게 묻지 않고 스마트 커밋**한다. merge 요청 자체가 "커밋도 끝났길 바란다"는 의도이므로 흐름을 끊지 않는다.

- 쓸데없는 파일(로그·임시·OS 아티팩트)은 스테이징에서 제외. `.gitignore`가 이미 거르는 항목(`.jira-context.json`, `TASK-README.md` 등)은 자연히 빠진다.
- 의미 있는 변경(소스·문서·설정)만 스테이징 후 이슈 summary 기반 메시지로 커밋.

```bash
cd "<worktreePath>"
# junk 제외하고 의미 있는 변경만 스테이징
git add -A -- . \
  ':(exclude,glob)**/*.log' ':(exclude,glob)**/*.tmp' ':(exclude,glob)**/*.swp' \
  ':(exclude)nul' ':(exclude)**/.DS_Store' ':(exclude)**/Thumbs.db'
# 스테이징된 변경이 있을 때만 커밋
if ! git diff --cached --quiet; then
  git commit -m "feat(<TASK-ID>): <issue summary>"
fi
```

스테이징할 의미 있는 변경이 없으면 커밋을 생략하고 다음 단계로 진행한다.

### Step 3: Merge Strategy (고정: --no-ff)

병합 전략은 **항상 `--no-ff`** (merge commit 생성, feature 브랜치 히스토리 보존)로 고정한다. 사용자에게 묻지 않는다 — merge를 요청했다는 것은 전략이 이미 정해져 있다는 의미다.

### Step 4: Perform Merge

**`.jira-context.json`의 `repoRoot`를 사용**한다. `git rev-parse --show-toplevel`은 워크트리 안에서 실행하면 워크트리 경로를 반환하므로 사용하지 않음.

```bash
git -C "<repoRoot>" checkout <baseBranch>
git -C "<repoRoot>" merge --no-ff feature/<TASK-ID> -m "Merge feature/<TASK-ID>: <issue summary>"
```

merge 충돌 발생 시 사용자에게 알리고 중단. 충돌 해결 후 재실행 안내.

### Step 5: Post Completion Report to Jira

`mcp__atlassian__jira_add_comment`로 병합 결과 게시:

```
## Task Merged Locally: <TASK-ID>

**브랜치**: feature/<TASK-ID> → <baseBranch>
**전략**: --no-ff
**커밋 수**: <count>개
**변경 파일**: <count>개 (+<추가> -<삭제>)

### Changes
<git log --oneline 요약>
```

### Step 6: Transition Issue

`mcp__atlassian__jira_get_transitions`로 전환 목록 조회 후 `mcp__atlassian__jira_transition_issue`로 상태 전환:
- "In Review" 우선 시도 (PR 생성 단계가 남아있으므로 Done이 아님)
- "In Review"가 없으면 가능한 전환 목록을 사용자에게 안내하고 선택 요청
- Done으로 전환하지 않는다 (PR 생성 후 `jira-task done`에서 처리)

**ADF comment 경고 및 호출 패턴**: `Read skills/_shared/transition-verify.md` 의 "ADF Comment 경고" 섹션 준수.

### Step 6.5: Verify Transition via Fresh Fetch (SSOT)

`Read skills/_shared/transition-verify.md` — fresh fetch 절차, `<final-jira-status>` 결정 규칙, fetch 실패 정책을 그대로 따른다. 결과 status를 Step 8의 `<final-jira-status>` 인자로 전달.

### Step 7: Cleanup Instructions

현재 Claude Code가 워크트리 디렉토리에서 실행 중이므로 워크트리를 직접 삭제할 수 없다.
병합이 완료된 후 사용자에게 아래 안내를 출력한다:

```
⚠️  워크트리 정리가 필요합니다.
    이 세션을 닫고 메인 레포에서 아래 명령을 실행하세요:

    git worktree remove "<worktreePath>" --force

    ⚠️  feature 브랜치(feature/<TASK-ID>)는 삭제하지 마세요.
    PR 생성에 필요합니다. PR 머지 후 삭제하세요.
```

실제 명령 실행은 하지 않는다.

### Step 8: Update Context & Completion Summary

워크트리의 `.jira-context.json`과 `<repoRoot>/.jira-context.json` 양쪽을 공용 스크립트로 갱신한다. 스크립트 경로 결정은 `Read skills/_shared/script-lookup.md` 후 lookup 블록 실행:

```bash
SCRIPT_NAME="jira-context-update.py" OUT_VAR="JIRA_CTX_UPDATE_PY"
# Read skills/_shared/script-lookup.md and execute its lookup block here
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> merge "<final-jira-status>" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

- `<final-jira-status>`: **Step 6.5에서 fresh fetch로 확보한 Jira 실제 status명** (예: `"In Review"`, `"검토중"`). transition 시도값을 그대로 쓰지 말 것.

스크립트는 다음을 일괄 처리한다:
- `completedSteps`에 `"merge"` 추가 (중복 방지)
- `status`를 `<final-jira-status>`로 set
- `mergedAt`에 현재 UTC ISO 8601 (Z suffix) 기록 — TZ-naive timestamp는 dashboard reader가 stale로 처리하므로 Z 접미사 필수
- `cachedIssue.status` / `cachedIssue.fetchedAt`도 함께 갱신 (cachedIssue가 있을 때만)
- aggregate vs worktree 형식 자동 감지 (aggregate는 `tasks[]`에서 해당 `taskId` 항목만 갱신)

아래 형식으로 완료 요약 출력:

```
---
✅ **Local Merge Complete** — <TASK-ID>

- 병합: feature/<TASK-ID> → <baseBranch> (--no-ff)
- Jira 상태: In Review
- Worktree 정리: 세션 종료 후 수동 실행 필요 (위 안내 참고)
- feature 브랜치(feature/<TASK-ID>)는 PR 생성을 위해 보존됨
- 완료 리포트 Jira에 게시됨

**Progress**: init → start → approach → impl → test → review → **merge ✓** → pr → done

**Next**: 세션 종료 후 메인 레포에서 `/jira-task pr <TASK-ID>` — PR을 생성합니다
---
```
