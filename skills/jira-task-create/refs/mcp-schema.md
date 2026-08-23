# jira-cli create JSON 규칙 (IMPORTANT — 과거 실패 방지)

**반드시 아래 규칙을 지킬 것. 추측 금지.** 호출 형식: `python3 "<scripts>/jira-cli.py" create @<scratchpad json 파일>` (짧으면 `create '<json>'`). 출력: `{"key","id"}`.

## `create` JSON 키
| 키 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `project` | str | No | 프로젝트 키 (예: `PROJ`). 생략 시 `JIRA_DEFAULT_PROJECT` |
| `summary` | str | Yes | 이슈 제목 |
| `issuetype` | str | Yes | `Task`, `Story`, `Bug`, `Epic`, `Subtask` 중 하나 (서브태스크는 `Subtask`, 하이픈 없음). 로컬라이즈된 프로젝트는 현지명(예: `작업`) |
| `description` | str | No | **Markdown 형식** (CLI가 wiki markup으로 변환) |
| `assignee` | str | No | `"me"` 또는 accountId |
| `parent` | str | No | **bare 문자열 키** (`"PROJ-123"`). `{"key": ...}`로 감싸지 말 것 — CLI가 감싼다 |
| `labels` | list[str] | No | 예: `["frontend", "urgent"]` |
| `priority` | str | No | **이름 문자열** (`"High"`). 객체 아님. 영어명을 거부하는 프로젝트는 생략 |

```json
{
  "project": "PROJ",
  "summary": "로그인 API 구현",
  "issuetype": "Task",
  "description": "## 배경\n...",
  "parent": "PROJ-100",
  "labels": ["backend"],
  "priority": "Medium",
  "assignee": "me"
}
```

핵심 주의:
- `parent`는 **모든 issuetype에 사용 가능** — Subtask뿐 아니라 일반 Task/Story에도 parent-link로 동작한다.
- Epic 연결은 `"parent": "EPIC-123"` 한 가지뿐이다 (epic_link 별칭 없음). 생성 후 연결은 `epic-link <KEY> <EPIC-KEY>`.
- **Story·Epic 타입 비활성화 주의**: 일부 프로젝트는 Story 타입을 비활성화하거나 Epic 타입을 가공한다(특히 company-managed 마이그레이션 환경). 실패 시 본 스킬의 매핑 폴백 규칙(`Story → Task + parent`, `Epic → Task + label epic-substitute`)대로 처리한다.
- 위 표 밖의 키는 CLI가 무시한다 — 오타 주의. 커스텀 필드가 필요하면 생성 후 `update <KEY> '<fields json>'`.

## 서브태스크 생성 패턴
```json
{
  "project": "PROJ",
  "summary": "로그인 API 구현",
  "issuetype": "Subtask",
  "description": "...",
  "parent": "PROJ-100",
  "priority": "High"
}
```
- `issuetype`이 `"Subtask"`인데 `parent`가 없으면 Jira가 400을 낸다.
- 프로젝트가 Subtask 타입을 비활성화했을 수 있음 → 실패 시 `"issuetype": "Task"` + `"parent": "..."`로 폴백 (일반 Task에 parent link).

## `link` 방향성 (매우 중요)
- 형식: `link <TYPE> <OUTWARD-KEY> <INWARD-KEY>`. `<TYPE>`은 링크 타입의 **`name`** (예: `Blocks`) — `"is blocked by"` 같은 **방향 구문을 넣으면 안 된다**.
- "A가 B를 블록한다"(= B가 A에 blocked by 됨) 경우: `link Blocks A B`
  - OUTWARD = `A` ("blocks" 쪽을 읽는 이슈)
  - INWARD = `B` ("is blocked by" 쪽을 읽는 이슈)
- 혼동 방지: INWARD는 **blocked 당하는** 쪽, OUTWARD는 **blocking 하는** 쪽.
- 사용 전 반드시 `link-types`로 정확한 `name` 확인 (일부 인스턴스는 커스텀).

## `epic-link`
- 형식: `epic-link <KEY> <EPIC-KEY>` — `parent` 필드를 Epic으로 PUT한다.
- 타겟이 **실제 Epic 타입**이 아니면 Jira가 400을 낸다.
- `create` JSON의 `"parent": "EPIC-KEY"` 인라인 처리가 실패했을 때만 fallback으로 쓴다.

## 일괄 생성 — **사용 금지**
이슈는 반드시 **`create`를 1건씩 루프로 호출**하고, 각 호출의 exit code와 출력 `key`를 검증한다. 부분 실패를 silent하게 만들지 않기 위함이다.
