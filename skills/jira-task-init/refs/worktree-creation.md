# Worktree Creation: Step 5 Detailed Procedure

선택된 각 태스크에 대해 아래 절차를 따른다.

## 디렉토리 준비

```bash
mkdir -p "$WORKTREE_BASE"
```

## 브랜치/Worktree 존재 여부 확인

```bash
# 1. 이미 브랜치가 있는지 확인
git branch --list "feature/<TASK-ID>"

# 2. 이미 worktree가 있는지 확인
git worktree list | grep "<TASK-ID>"
```

분기 처리:

- **브랜치와 worktree 모두 이미 존재**: "Already exists — skipped" 표시 후 다음 태스크로
- **브랜치만 존재 (worktree 없음)**: 기존 브랜치로 worktree 생성 (`-b` 플래그 없이)
  ```bash
  git worktree add "$WORKTREE_BASE/<TASK-ID>" "feature/<TASK-ID>"
  ```
- **둘 다 없음**: 새로 생성
  ```bash
  git worktree add -b "feature/<TASK-ID>" "$WORKTREE_BASE/<TASK-ID>" <base-branch>
  ```

## Worktree .gitignore 동기화

Worktree 생성 직후, worktree의 `.gitignore`에 아래 항목이 없으면 추가한다
(feature 브랜치는 base branch 시점의 `.gitignore`를 체크아웃하므로 메인 레포 변경이 반영되지 않을 수 있음):

```bash
WORKTREE_GITIGNORE="$WORKTREE_BASE/<TASK-ID>/.gitignore"
if ! grep -qF ".jira-context.json" "$WORKTREE_GITIGNORE" 2>/dev/null; then
  printf '\n# Jira integration (local dev context)\n.jira-context.json\nTASK-README.md\n' >> "$WORKTREE_GITIGNORE"
fi
if ! grep -qF ".jira-epic.json" "$WORKTREE_GITIGNORE" 2>/dev/null; then
  printf '\n# Jira integration (local epic scope)\n.jira-epic.json\n' >> "$WORKTREE_GITIGNORE"
fi
```

이미 존재하면 스킵.

## Worktree 경로 규칙

- 반드시 원본 레포의 **상위 디렉토리**에 생성
- 절대로 원본 레포 안에 생성하지 않음
- 구조:
  ```
  workspace/
  ├── my-project/                    # 원본 레포 (main 브랜치)
  └── my-project_worktree/           # 원본 레포 밖
      ├── PROJ-101/                  # feature/PROJ-101 브랜치
      ├── PROJ-102/                  # feature/PROJ-102 브랜치
      └── ...
  ```
