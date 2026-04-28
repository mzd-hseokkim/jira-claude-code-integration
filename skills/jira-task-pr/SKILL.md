---
name: jira-task-pr
description: Create a pull request for a Jira task and link it back to the issue. Generates PR title/description from Jira context and posts the PR link to Jira. Use when user says "create PR", "pull request", "PR 만들어", "PR 등록", "jira-task pr", or wants to create a pull request for a completed task.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_add_comment
  - mcp__atlassian__jira_transition_issue
  - mcp__atlassian__jira_get_transitions
---

# jira-task-pr: Create Pull Request for Jira Task

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Prerequisites
- **메인 레포에서 실행**: worktree가 아닌 원본 레포 디렉토리에서 실행해야 함
- `/jira-task merge`가 먼저 완료되어야 함 (feature 브랜치가 로컬 base에 병합된 상태)
- `gh` CLI 설치 및 인증됨 (`gh auth status`로 확인)
- Feature branch `feature/<TASK-ID>`에 커밋이 있어야 함
- Remote에 push 되어 있어야 함

## Workflow

### Step 1: Gather Context

1. `.jira-context.json`에서 활성 태스크 정보 읽기
2. **Cache-first**: `.jira-context.json`의 `cachedIssue` 확인 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략 후 캐시된 description/issuetype을 PR 본문 생성에 사용. miss이면 `mcp__atlassian__jira_get_issue` 호출 (`fields="summary,status,description,issuetype,labels"`, `comment_limit=0` — PR 본문 생성에 필요한 항목만) 후 cache 갱신.
3. **Jira 호스트 URL 추출**: `get-issue` 응답의 `self` 필드(예: `https://company.atlassian.net/rest/api/...`)에서 호스트 부분을 추출하여 Jira 이슈 링크 생성에 사용. 예: `https://company.atlassian.net/browse/<TASK-ID>`. cache hit이라 신선한 응답이 없으면 `JIRA_URL` 환경변수에서 추출하거나 `.mcp.json`의 `JIRA_URL`을 fallback으로 사용.
4. Base branch 확인:
   ```bash
   git rev-parse --abbrev-ref HEAD  # 현재 브랜치 확인
   ```

### Step 2: Verify Prerequisites

```bash
# gh CLI 확인
gh auth status

# 커밋 확인
git log --oneline <base-branch>..feature/<TASK-ID>

# Remote push 상태 확인
git status -sb
```

Push가 안 되어 있으면:
```bash
git push -u origin feature/<TASK-ID>
```

### Step 3: Generate PR Content

산출물 작성 전 반드시 Read tool로 `templates/pr-description.template.md`를 읽고 contract(필수/옵셔널 분류, 옵셔널 마커 규약)를 따른다.

**PR Title**: `<TASK-ID>: <Jira 이슈 summary>`

**PR Body**: template의 섹션 구조를 따라 Jira 이슈 정보(description, type, priority, acceptance criteria), `git diff --stat`, 테스트 리포트 요약을 채워 넣는다.

### Step 4: Create PR

```bash
gh pr create \
  --title "<TASK-ID>: <summary>" \
  --body "<generated body>" \
  --base <base-branch> \
  --head feature/<TASK-ID>
```

PR URL을 캡처.

선택적 옵션 (사용자에게 확인):
- `--reviewer <reviewer>` : 리뷰어 지정
- `--label <label>` : 라벨 추가
- `--assignee @me` : 본인 할당
- `--draft` : Draft PR로 생성

### Step 5: Post PR Link to Jira

`mcp__atlassian__jira_add_comment`로 Jira에 PR 링크 게시:

```
## Pull Request Created

**PR**: <PR URL>
**브랜치**: feature/<TASK-ID> → <base-branch>
**변경 파일 수**: <count>개

<PR 설명 요약>
```

### Step 6: Transition Issue (Optional)

사용자에게 확인 후 이슈 상태를 "In Review"로 전환:
```
먼저 mcp__atlassian__jira_get_transitions으로 전환 목록 조회 후
mcp__atlassian__jira_transition_issue with transitionId: <In Review transition ID>
```

**주의**: `jira_transition_issue`에 `comment` 파라미터를 절대 사용하지 말 것. `comment` 필드는 ADF JSON을 요구하므로 일반 텍스트를 넣으면 오류가 발생한다. 코멘트는 별도로 `jira_add_comment`를 호출하여 추가한다.

### Step 7: Completion Summary

`.jira-context.json`의 `completedSteps`에 `"pr"` 추가 후, 아래 형식으로 완료 요약 출력:

```
---
✅ **PR Created** — <TASK-ID>

- PR URL: <PR URL>
- Title: <TASK-ID>: <summary>
- Base: <base-branch> ← feature/<TASK-ID>
- Files: <count> changed
- Jira 코멘트 게시됨

**Progress**: init → start → plan → design → impl → test → review → merge → **pr ✓** → done

**Next**: PR 머지 후 `/jira-task done <TASK-ID>` — 태스크를 완료 처리합니다
---
```
