# 요구사항 문서 ↔ 티켓 연결 규약

요구사항 문서(`docs/requirements/<slug>.requirements.md`)가 내용의 **정본**이다. 티켓과 approach는 문서를 복제하지 않고 아래 두 표기로 가리킨다. `jira-task-create`(import 모드)가 쓰고 `jira-task-approach`가 읽는다.

## 출처 줄 (티켓 → 문서)

이슈 description의 **마지막 줄**:

```
Requirements: <레포 루트 기준 상대 경로> (<노드>)
```

`<노드>`는 `Proposed Issue Breakdown`의 트리 표기 그대로: `작업` / `Story` / `Story <N>` / `Sub-task <N>` / `Sub-task <N>.<M>` / `Epic`. 레포 밖 문서면 줄을 생략한다.

## 이슈 키 표기 (문서 → 티켓)

`Proposed Issue Breakdown`의 노드 라인 **맨 끝**에 ` [<KEY>]` (`(blocks: ...)`가 있으면 그 뒤):

```
- Sub-task 1.2: 로그인 폼 검증 (blocks: 1.1) [MAE-14]
```

생성하지 않은 노드(`epicScope`로 대체된 Epic, 생성 실패 노드)에는 표기하지 않는다.

## 공유 전제

문서는 커밋되어 작업자의 base 브랜치에 있어야 한다 (worktree는 커밋된 파일만 본다). 출처 줄이 가리키는 파일이 없으면 읽는 쪽은 경고 후 hint 없이 진행한다 — 다른 문서를 추측해 고르지 않는다.
