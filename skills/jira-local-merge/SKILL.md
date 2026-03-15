---
name: jira-local-merge
description: Locally merge a Jira task branch into the base branch without a remote or PR. Handles merge strategy selection, Jira status transition, and MCP config removal. Outputs worktree cleanup instructions for manual execution after session ends. Use when user says "local merge", "merge task", "jira-task merge", "로컬 병합", "원격 없이 병합", or wants to merge without a remote origin.
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

## Language Rule

모든 출력을 한국어로 작성한다: 사용자 응답, 생성 문서, Jira 코멘트 내용 등 모든 텍스트가 대상이다.
예외: 코드, 변수명, 브랜치명, 파일명, 명령어는 영어를 유지한다.
Jira 코멘트: 섹션 제목(##, ###)은 영어로, 내용(설명·요약·노트)은 한국어로 작성한다.

remote origin 없이 feature 브랜치를 base 브랜치로 로컬 병합하고,
Jira 상태 전환 및 worktree 정리까지 일괄 처리한다.

## Prerequisites
- feature 브랜치에 커밋이 존재
- Jira MCP 서버 연결됨

## Workflow

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

### Step 2: Pre-flight Checks

```bash
# 1. feature 브랜치 존재 확인
git branch --list "feature/<TASK-ID>"

# 2. 워크트리 내 미커밋 변경사항 확인
git -C "<worktreePath>" status --porcelain
```

미커밋 변경사항이 있으면 사용자에게 알리고 중단. 계속할지 확인 후 진행.

### Step 3: Choose Merge Strategy

사용자에게 병합 전략 선택 요청:

```
병합 전략을 선택하세요:

1. --no-ff (기본 권장)
   merge commit을 생성, feature 브랜치 히스토리가 그대로 보존됨
   GitHub "Create a merge commit"과 동일

2. --squash
   feature 브랜치의 모든 커밋을 하나로 합쳐 병합
   GitHub "Squash and merge"와 동일

3. rebase
   feature 브랜치 커밋을 base 브랜치 위에 재배치, 선형 히스토리
   GitHub "Rebase and merge"와 동일
```

### Step 4: Perform Merge

**`.jira-context.json`의 `repoRoot`를 사용**한다. `git rev-parse --show-toplevel`은 워크트리 안에서 실행하면 워크트리 경로를 반환하므로 사용하지 않음.

#### 전략별 명령:

**--no-ff (기본)**
```bash
git -C "<repoRoot>" checkout <baseBranch>
git -C "<repoRoot>" merge --no-ff feature/<TASK-ID> -m "Merge feature/<TASK-ID>: <issue summary>"
```

**--squash**
```bash
git -C "<repoRoot>" checkout <baseBranch>
git -C "<repoRoot>" merge --squash feature/<TASK-ID>
git -C "<repoRoot>" commit -m "feat(<TASK-ID>): <issue summary>"
```

**rebase**
```bash
git -C "<repoRoot>" checkout feature/<TASK-ID>
git -C "<repoRoot>" rebase <baseBranch>
git -C "<repoRoot>" checkout <baseBranch>
git -C "<repoRoot>" merge --ff-only feature/<TASK-ID>
```

merge 충돌 발생 시 사용자에게 알리고 중단. 충돌 해결 후 재실행 안내.

### Step 5: Post Completion Report to Jira

`mcp__atlassian__jira_add_comment`로 병합 결과 게시:

```
## Task Merged Locally: <TASK-ID>

**브랜치**: feature/<TASK-ID> → <baseBranch>
**전략**: <merge strategy>
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

**주의**: `jira_transition_issue`에 `comment` 파라미터를 절대 사용하지 말 것. `comment` 필드는 Atlassian Document Format(ADF) JSON을 요구하므로 일반 텍스트를 넣으면 오류가 발생한다. 코멘트는 반드시 별도로 `jira_add_comment`를 호출하여 추가한다.

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

워크트리의 `.jira-context.json`과 `<repoRoot>/.jira-context.json` 양쪽을 업데이트:
- `completedSteps`에 `"merge"` 추가
- `status`를 `"In Review"`로 변경
- `mergedAt`에 현재 ISO 8601 타임스탬프 추가

```bash
python - "<repoRoot>/.jira-context.json" << 'PYEOF'
import json, datetime, os, sys

ctx_file = sys.argv[1]
if not os.path.isfile(ctx_file):
    print(f"No context file at {ctx_file}, skipping")
    sys.exit(0)

with open(ctx_file, "r") as f:
    ctx = json.load(f)
steps = ctx.get("completedSteps", [])
if "merge" not in steps:
    steps.append("merge")
ctx["completedSteps"] = steps
ctx["status"] = "In Review"
ctx["mergedAt"] = datetime.datetime.now().isoformat()
with open(ctx_file, "w") as f:
    json.dump(ctx, f, indent=2, ensure_ascii=False)
print(f"Context updated: {ctx_file}")
PYEOF
```

아래 형식으로 완료 요약 출력:

```
---
✅ **Local Merge Complete** — <TASK-ID>

- 병합: feature/<TASK-ID> → <baseBranch> (<strategy>)
- Jira 상태: In Review
- Worktree 정리: 세션 종료 후 수동 실행 필요 (위 안내 참고)
- feature 브랜치(feature/<TASK-ID>)는 PR 생성을 위해 보존됨
- 완료 리포트 Jira에 게시됨

**Progress**: init → start → plan → design → impl → test → review → **merge ✓** → pr → done

**Next**: 세션 종료 후 메인 레포에서 `/jira-task pr <TASK-ID>` — PR을 생성합니다
---
```
