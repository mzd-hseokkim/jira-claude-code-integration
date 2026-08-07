# Epic 스코프 기능 — 무엇이 필요한가

목표: "이번 작업은 epic v1.0이야"라고 말해두면 프로젝트 루트에 그 정보가 저장되고,
이후 `/jira-task create`가 자동으로 그 Epic 아래에 이슈를 만든다. Epic 정보가 없으면 지금과 동일하게 Epic 없이 생성.

## 1. 저장 파일

**파일**: `<repo-root>/.jira-epic.json` (신규)

`.jira-context.json`에 얹지 않는 이유:
- `.jira-context.json`은 **태스크 수명**을 따라간다. `clean`/`done`에서 정리되고 worktree마다 복제되며, `jira-context-update.py`가 스키마를 강제한다. Epic 스코프는 그보다 오래 살아야 한다 (여러 태스크에 걸침).
- aggregate 파일 최상위 오염 규칙(CLAUDE.md의 `cachedIssue` 금지)과 같은 함정을 또 만들 필요 없다.

**스키마**:
```json
{
  "epicKey": "MAE-100",
  "epicSummary": "v1.0 릴리스",
  "projectKey": "MAE",
  "setAt": "2026-08-07T10:00:00+09:00"
}
```
`epicKey`가 단일 진실. `epicSummary`/`projectKey`는 표시·검증용 캐시.

**위치 해석**: create를 worktree 안에서 실행할 수 있으므로 lookup 순서를 정해야 한다.
1. `git rev-parse --show-toplevel` (현재 워크트리 루트)
2. 없으면 `git rev-parse --git-common-dir`로 메인 repo `.git`을 찾아 그 부모 루트
worktree마다 복사하지 말고 **메인 repo 루트 1곳만 정본**으로 두는 편이 스코프 개념에 맞다.

## 2. Epic을 설정하는 진입점

지금은 이런 액션이 없다. 신규 필요:

- **스킬**: `skills/jira-task-epic/SKILL.md`
  - `set <KEY|자연어이름>` / `show` / `clear` 3개 서브액션
  - description에 자연어 트리거 넣기: `epic 설정`, `이번 작업은 epic`, `에픽 지정`, `set epic`
- **라우터**: `commands/jira-task.md`에 `epic` 액션 추가 (Argument Parsing 목록 + argument-hint + Action Routing 섹션 + description 트리거)

### Epic 이름 → 키 해석
사용자는 "v1.0"처럼 **이름**으로 말한다. 키가 아니면 JQL로 찾는다:
```
project = <JIRA_DEFAULT_PROJECT> AND issuetype = Epic AND summary ~ "v1.0" ORDER BY created DESC
```
- 0건 → 사용자에게 알림 + (선택) Epic 신규 생성 제안
- 1건 → 그대로 확정
- 2건 이상 → `AskUserQuestion`으로 선택

`JIRA_DEFAULT_PROJECT` 스코핑 규칙(CLAUDE.md)을 이 JQL에도 반드시 적용.

### 검증
- 실제 `issuetype == Epic`인지 (`jira_get_issue`) — 아니면 거부. `jira_link_to_epic`이 Epic 아니면 `ValueError`.
- `status == Done`이면 경고 후 진행 여부 확인.
- Epic 타입이 비활성화된 프로젝트(MAE 같은 한국어 company-managed)에서는 `epic-substitute` 라벨 폴백 이슈도 후보로 볼지 결정 필요.

## 3. `.gitignore` 등록

기존 패턴 그대로 재사용 (`skills/jira-task-init/SKILL.md` Step 4, `refs/worktree-creation.md`).

- init의 append 스니펫에 `.jira-epic.json` 한 줄 추가 (repo + worktree 양쪽)
- **단, epic 설정은 init보다 먼저 실행될 수 있으므로** 신규 epic 스킬 자체에서도 파일 쓰기 직전에 동일한 `grep -qF` 후 append를 수행해야 한다.

## 4. `jira-task-create` 연동 지점

`skills/jira-task-create/SKILL.md` 수정 대상:

| 위치 | 변경 |
|---|---|
| Prerequisites | `.jira-epic.json` 있으면 Epic 링크 기본값으로 사용한다고 명시 |
| Step 0 | 연결 확인 직후 `.jira-epic.json` 로드 → `epicScope` 변수 세팅 (파일 없으면 null) |
| Step 2 Phase C | `epicScope`가 있으면 **Epic 연결 질문을 건너뛴다**. 현재 "기존 에픽 선택" 서브플로(JQL + 10건 테이블 + 선택)가 통째로 skip |
| Step 5 Preview | `Epic Link` 줄에 출처 표시 — `MAE-100 (v1.0) ← .jira-epic.json` |
| Step 6-1 | `additional_fields`에 `epic_link`/`parent`로 주입 (기존 규칙 그대로, `refs/mcp-schema.md` 참조) |
| Step 6-2 | 이미 존재하는 검증/`jira_link_to_epic` 폴백 경로를 그대로 태움 |

### import 모드(`--from-requirements`) 충돌 규칙 — 결정 필요
현재 L3는 **Epic을 새로 생성**한다 (Step 6-1). `epicScope`가 있으면 셋 중 하나를 골라야 한다:
1. 스코프 Epic 아래에 Story들을 붙이고 문서의 Epic 노드는 **생성하지 않음** → L3가 사실상 L2+기존Epic으로 강등
2. Epic을 새로 만들되 스코프 Epic 아래 자식으로 → Jira는 Epic 중첩을 잘 지원하지 않음. 비추천
3. Preview에서 `AskUserQuestion`으로 물어봄

권장은 **1번 + Preview에 1줄 고지**. L2(Story-only, Epic 없음)는 스코프 Epic에 그냥 붙이면 되므로 깔끔하게 개선된다.

또한 `additional_fields`에 사용자가 명시한 Epic이 대화에 있으면 **명시값 > 파일값** 우선순위를 명문화해야 한다.

## 5. 파급 범위 (v1에 넣을지 결정 필요)

| 스킬 | 넣으면 좋은 것 | 권장 |
|---|---|---|
| `jira-task-init` | 할당 이슈 JQL에 `parent = <epicKey>` 필터 추가 | v1 제외 (init은 이미 인자 형태가 3가지라 복잡) |
| `jira-task-report` | Epic 단위 리포트 스코핑 | v1 제외 |
| `jira-task-discover` | 요구사항 문서 상단에 Epic 표기 | v1 제외 |

우선 **create 전용**으로 좁게 넣고, 실사용 후 확장하는 쪽을 권장.

## 6. 부수 작업 (누락 시 마켓플레이스 업데이트 미감지)

- `.claude-plugin/plugin.json` `version` → `0.49.0`
- `CLAUDE.md` / `AGENTS.md` — "Context 파일" 항목에 `.jira-epic.json` 추가 (gitignored, repo 루트 1곳)
- `README.md` — 액션 목록 + 사용 예시
- `skills/jira/SKILL.md`(도움말) 액션 목록
- 이 repo 자체의 `.gitignore`에도 `.jira-epic.json` 추가 (도그푸딩하므로)
- 테스트: `tests/`에 epic 파일 로드/우선순위/미존재 폴백 케이스 — 다만 스킬이 프롬프트 마크다운이라 기존 테스트는 파이썬 스크립트만 커버. 스크립트를 만들지 프롬프트로만 처리할지 결정 필요.

## 7. 결정 (2026-08-07 확정, v0.49.0에서 구현)

1. **신규 액션 `/jira-task epic`** — `set`/`show`/`clear`. 자연어 발화("이번 작업은 epic v1.0이야")도 같은 스킬로 라우팅
2. **프롬프트 bash로 처리** — 별도 `scripts/` 헬퍼 없음. 경로 결정·읽기·gitignore 블록은 `skills/_shared/epic-scope.md`에 단일 출처로 둠 (JSON 쓰기만 `Write` 도구)
3. **import L3는 문서 Epic 노드를 생성하지 않고 스코프 Epic을 씀** — 상위 개념에서 정해진 Epic을 따라간다. Epic 중첩 생성 없음
4. **create 전용** — init/report JQL은 손대지 않음
