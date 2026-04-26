# MAE-115: [1.1.2] jira-task-discover 스킬 작성

## Issue Details
- **Key**: MAE-115
- **Summary**: [1.1.2] jira-task-discover 스킬 작성
- **Type**: Subtask
- **Priority**: 주요
- **Status**: 진행 중
- **Assignee**: Kim Hyungsuk
- **Branch**: feature/MAE-115
- **Worktree**: /Users/hyungsukkim/WORK/workspace/jira-claude-code-integration_worktree/MAE-115
- **Initialized**: 2026-04-26
- **Parent**: MAE-104 (Phase 1.1)

## Description

`jira-task-discover` 신규 스킬 작성. 자연어 주제를 입력받아 4단계로 요구사항 문서를 생성한다.

### 4-Step Workflow

1. **컨텍스트 수집** — 현재 코드베이스의 관련 영역 자동 탐색 (Glob/Grep)
2. **질문 배치(batched questions)** — 모호한 부분을 한 번에 묶어 사용자에게 질문 (이해관계자, 성공 기준, 제약, 비기능 요구사항 등)
3. **요구사항 문서 생성** — `docs/requirements/<TOPIC-SLUG>.requirements.md`
4. **이슈 분해 제안** — 에픽 1 + 스토리 N + 서브태스크 M 구조 제안 (확정은 다음 단계)

## Acceptance Criteria

- [ ] `skills/jira-task-discover/SKILL.md` 작성
- [ ] 4단계 워크플로 모두 구현
- [ ] `--lite` 모드 지원 (질문 3개 이하, 한 페이지 문서)
- [ ] `--from <파일경로>`로 기존 요구사항 import 가능

## Blocks (Phase 1.1 후속 sub-tasks)

- MAE-116 — [1.1.3] jira-task-create와의 연결 (--from-requirements)
- MAE-117 — [1.1.4] templates/requirements.template.md 생성 (계획만)
- MAE-118 — [1.1.5] completedSteps에 "discover" 추가
- MAE-119 — [1.1.6] commands/jira-task.md 라우팅 추가 (discover 액션)

## Workflow

1. `cd /Users/hyungsukkim/WORK/workspace/jira-claude-code-integration_worktree/MAE-115` 로 이동
2. `/jira-task plan MAE-115` — 4단계 워크플로 상세 기획
3. `/jira-task design MAE-115` — SKILL.md 구조 설계
4. `/jira-task impl MAE-115` — 스킬 작성
5. `/jira-task test MAE-115` — 검증
6. `/jira-task review MAE-115` — 리뷰
7. `/jira-local-merge MAE-115` — 로컬 병합
8. `/jira-task done MAE-115` — 완료 처리

## Reference

- 부모 에픽: MAE-40 (v0.13 → 상용화 Roadmap)
- ADR: MAE-42 (옵션 A: discover를 create 앞 별도 단계로 배치)
- 워크플로: `discover (신규) → create → init → start → plan → design → impl → test → review → merge → pr → done`
