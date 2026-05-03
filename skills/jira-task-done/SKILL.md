---
name: jira-task-done
description: "Complete a Jira task — generates a summary, transitions the issue to Done, and posts to Jira. Triggers: jira-task done, complete task; 작업 완료, 태스크 완료."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_transition_issue
  - mcp__atlassian__jira_get_transitions
  - mcp__atlassian__jira_add_comment
---

# jira-task-done: Complete a Jira Task

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Prerequisites
- A feature branch `feature/<TASK-ID>` must exist with commits
- Jira MCP server must be connected

## Workflow

### Step 1: Verify Context

Check for `.jira-context.json` to get the active task context.
If TASK-ID is provided as argument, use that instead.

`completedSteps`에 `"merge"` 또는 `"pr"`가 있으면 본 단계는 컨텍스트만으로 충분 — git 호출 불필요. 둘 다 없으면 (예외 경로: 사용자가 merge/pr 없이 done을 호출) 그때만 `git branch --list "feature/<TASK-ID>"`로 브랜치 존재 확인.

### Step 2: Fetch Current Issue Status

**Cache-first**: `.jira-context.json`의 `cachedIssue`를 먼저 확인 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략하고 캐시된 `status`만 사용. miss이면 `mcp__atlassian__jira_get_issue` 호출 (`fields="summary,status,issuetype,assignee"`, `comment_limit=0`) 후 cache 갱신. **단 done 단계는 상태 전이 직전이므로 사용자가 신선도가 의심되면 cache 무시하고 재조회할 수 있음**.

### Step 3: Summarize Changes

**기본 경로 (merge/pr 완료 후 done 호출)**: git 호출 0회.

merge 단계에서 이미 Jira 코멘트(`## Task Merged Locally`)에 변경 파일·삽입/삭제 라인 수가 게시되어 있고, plan/design/impl/test 문서에 모든 요약이 있다. Step 2의 cachedIssue 코멘트 또는 PDCA 문서를 그대로 인용한다.

**예외 경로 (merge/pr 없이 done 직접 호출)**: 그때만 squash·merge 형태에 따라 적절한 git 명령으로 stat 1회 조회.

- squash-merged onto base: `git show --stat $(git log --grep="<TASK-ID>" -1 --format=%H <base-branch>)`
- 일반 merge: `git diff --stat <base-branch>..feature/<TASK-ID>`
- 판단 기준: `<base>..feature/<TASK-ID>`가 비어 있으면 squash, 비어있지 않으면 일반.

### Step 4: Generate Completion Summary

다음 출처를 우선순위대로 인용해 완료 요약 생성 (git 재조회 금지):

1. `.jira-context.json`의 cachedIssue 코멘트 중 `## Task Merged Locally` 또는 `## Pull Request Created` (변경 파일/라인 수)
2. `docs/plan/<TASK-ID>.plan.md` (기획 요약)
3. `docs/design/<TASK-ID>.design.md` (설계 요약)
4. `docs/test/<TASK-ID>.test-report.md` (테스트 결과)

### Step 5: Post Completion Report to Jira

Step 5의 요약을 기반으로 `mcp__atlassian__jira_add_comment`에 게시:

```
## Task Completed: <TASK-ID>

**브랜치**: feature/<TASK-ID>
**커밋 수**: <count>개
**변경 파일**: <count>개 (+<추가> -<삭제>)

### Summary
- **Plan**: <기획 요약>
- **Design**: <설계 요약>
- **Changes**: <구현 변경사항 요약>

### Key Changes
<구현된 내용 간단 설명>
```

### Step 6: Transition Issue

Use `mcp__atlassian__jira_get_transitions` to fetch available transitions, then use `mcp__atlassian__jira_transition_issue` to move the issue:
- Try "In Review" first (common for PR-based workflows)
- If "In Review" is not available, try "Done"
- If both fail, inform the user of available transitions

**Important**: Do NOT pass a `comment` parameter to `jira_transition_issue`. The `comment` field requires Atlassian Document Format (ADF) JSON — passing plain text will cause an error. Add comments separately using `jira_add_comment`.

### Step 7: Cleanup MCP Config from Worktree Entry

`.jira-context.json`의 `worktreePath`를 읽어 `~/.claude.json`에서 해당 경로의 `mcpServers`를 제거한다.
entry 전체는 삭제하지 않고 `mcpServers` 키만 제거하여 Claude Code의 다른 메타데이터는 보존한다.

```bash
python - "<worktreePath from .jira-context.json>" << 'PYEOF'
import json, os, sys

worktree_path = sys.argv[1]
claude_json_path = os.path.expanduser("~/.claude.json")
with open(claude_json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

def norm(p):
    return p.replace("\\", "/").rstrip("/")

wt = norm(worktree_path)
projects = data.get("projects", {})

matched_key = None
for k in list(projects.keys()):
    if norm(k) == wt:
        matched_key = k
        break

if matched_key and isinstance(projects[matched_key], dict):
    projects[matched_key].pop("mcpServers", None)
    with open(claude_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"MCP config removed from {wt}")
else:
    print(f"No entry found for {wt}, skipping")
PYEOF
```

- `.jira-context.json`에 `worktreePath`가 없으면 스킵
- `~/.claude.json`에 해당 경로 entry가 없어도 스킵 (오류 아님)

### Step 8: Update Context & Completion Summary

워크트리의 `.jira-context.json`과 `<repoRoot>/.jira-context.json` **양쪽**을 공용 스크립트로 갱신한다 (스크립트 위치는 프로젝트 CLAUDE.md의 "Jira Context Update Script" 섹션 참고). 한쪽만 갱신하면 dashboard collector가 worktree-local 파일만 읽기 때문에 done step이 누락된 채 표시된다.

```bash
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> done "<final-jira-status>" \
    "<worktreePath>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

- `<final-jira-status>`: Step 6에서 transition한 결과 status명 (예: `"완료"`, `"Done"`)
- worktree 경로는 aggregate의 `tasks[].worktreePath`에서 조회. worktree 컨텍스트가 부재하면(이미 cleaned 등) 해당 인자만 빼고 호출 — 스크립트가 missing 파일을 자동 skip

스크립트는 다음을 일괄 처리한다:
- `completedSteps`에 `"done"` 추가 (중복 방지)
- `status`를 `<final-jira-status>`로 set
- `doneAt`에 현재 UTC ISO 8601 (Z suffix) 기록
- `cachedIssue.status` / `cachedIssue.fetchedAt`도 함께 갱신 (cachedIssue가 있을 때만)
- aggregate vs worktree 형식 자동 감지

아래 형식으로 완료 요약 출력:

```
---
✅ **Task Done** — <TASK-ID>

- Jira 상태: Done (또는 In Review)
- 완료 리포트 Jira에 게시됨
- `.jira-context.json` 업데이트됨
- 워크트리 MCP config 정리됨 (`~/.claude.json`)

**Progress**: init → start → plan → design → impl → test → review → merge → pr → **done ✓**

🎉 모든 단계가 완료되었습니다!
---
```
