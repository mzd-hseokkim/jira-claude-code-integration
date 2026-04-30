# mcp-atlassian Schema Notes (IMPORTANT — 과거 실패 방지)

**반드시 아래 규칙을 지킬 것. 추측 금지.**

## `jira_create_issue` 파라미터
| 파라미터 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `project_key` | str | Yes | 프로젝트 키 (예: `PROJ`) |
| `summary` | str | Yes | 이슈 제목 |
| `issue_type` | str | Yes | `Task`, `Story`, `Bug`, `Epic`, `Subtask` 중 하나 (서브태스크는 `Subtask`, 하이픈 없음) |
| `description` | str | No | **Markdown 형식** (서버가 Jira 포맷으로 변환) |
| `assignee` | str | No | **top-level 전용**. email / display name / accountId 가능. `additional_fields`에 넣으면 **조용히 무시됨** |
| `components` | str | No | **CSV 문자열** (예: `"Frontend,API"`). 리스트 아님 |
| `additional_fields` | **str (JSON string)** | No | **dict가 아니라 JSON.dumps된 문자열**로 전달 |

## `additional_fields` JSON 문자열의 허용 키
```json
{
  "priority": {"name": "High"},
  "labels": ["frontend", "urgent"],
  "parent": "PROJ-123",
  "epic_link": "EPIC-123",
  "fixVersions": [{"id": "10020"}],
  "customfield_10010": "value"
}
```

핵심 주의:
- `priority`는 **`{"name": "..."}` 객체**. 문자열만 넣으면 안 된다.
- `parent`는 **bare 문자열 키** (`"PROJ-123"`). `{"key": "PROJ-123"}` 형태로 감싸지 말 것 — 서버가 내부적으로 감싼다.
- `parent`는 **모든 issue_type에 사용 가능** — Subtask뿐 아니라 일반 Task에도 parent-link로 동작한다.
- Epic 연결 별칭: `epicKey`, `epic_link`, `epicLink`, `epic link` 모두 허용. **Cloud team-managed 프로젝트에서는 `parent`로 자동 폴백**되므로 `{"parent": "EPIC-123"}`만으로도 에픽 연결이 된다.
- **Story·Epic 타입 비활성화 주의**: 일부 프로젝트는 Story 타입을 비활성화하거나 Epic 타입을 가공한다(특히 company-managed 마이그레이션 환경). 실패 시 본 스킬의 매핑 폴백 규칙(`Story → Task + parent`, `Epic → Task + label epic-substitute`)대로 처리한다.
- **알려지지 않은 키는 warning만 찍고 조용히 스킵**된다 — 오타 주의.

## 서브태스크 생성 패턴
```json
{
  "project_key": "PROJ",
  "summary": "로그인 API 구현",
  "issue_type": "Subtask",
  "description": "...",
  "additional_fields": "{\"parent\":\"PROJ-100\",\"priority\":{\"name\":\"High\"}}"
}
```
- `issue_type`을 `"Subtask"`로 설정하고 `parent` 없으면 서버가 `ValueError`를 낸다.
- 프로젝트가 Subtask 타입을 비활성화했을 수 있음 → 실패 시 `issue_type: "Task"` + `{"parent": "..."}`로 폴백 (일반 Task에 parent link).

## `jira_create_issue_link` 방향성 (매우 중요)
- `link_type` 파라미터는 링크 타입의 **`name`** 필드 (예: `"Blocks"`) — `"is blocked by"` 같은 **방향 구문을 넣으면 안 된다**.
- "A가 B를 블록한다"(= B가 A에 blocked by 됨) 경우:
  - `link_type = "Blocks"`
  - `inward_issue_key = "B"` ("is blocked by" 쪽을 읽는 이슈)
  - `outward_issue_key = "A"` ("blocks" 쪽을 읽는 이슈)
- 혼동 방지: `inward`는 **blocked 당하는** 쪽, `outward`는 **blocking 하는** 쪽.
- 사용 전 반드시 `jira_get_link_types`로 정확한 `name` 확인 (일부 인스턴스는 커스텀).

## `jira_link_to_epic`
- 파라미터: `issue_key`, `epic_key` (두 개 다 문자열).
- 타겟이 **실제 Epic 타입**이 아니면 `ValueError`.
- 내부적으로 4개 전략 순차 시도 (parent field → discovered customfield → hardcoded customfield 목록 → Relates-to 링크 폴백).
- `jira_create_issue`의 `additional_fields`에 `{"parent": "EPIC-KEY"}`로 인라인 처리가 실패했을 때만 fallback으로 쓴다.

## `jira_batch_create_issues` — **사용 금지**
이 스킬에서는 쓰지 않는다. 이유:
- `additional_fields` 래퍼가 없어서 스키마가 다르다 (`components`도 list로 바뀜).
- epic_link 별칭 처리 안 됨.
- Subtask parent 검증 안 됨.
- **API 응답의 에러는 로그만 찍고 호출자에게 전파되지 않아** 부분 실패가 silent해진다.
- 대신 **`jira_create_issue`를 루프로 호출**하고, 각 호출 결과를 검증한다.
