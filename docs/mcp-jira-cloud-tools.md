# Jira Cloud MCP Tools Reference

Jira Cloud MCP 서버가 제공하는 전체 도구 목록입니다.

> **총 도구 수**: 79개

---

## 목차

- [Authentication (9)](#authentication-9)
- [Issues (12)](#issues-12)
- [Issue Links (3)](#issue-links-3)
- [Comments (2)](#comments-2)
- [Attachments (4)](#attachments-4)
- [Labels (2)](#labels-2)
- [Watchers (3)](#watchers-3)
- [Votes (3)](#votes-3)
- [Worklogs (6)](#worklogs-6)
- [Projects (2)](#projects-2)
- [Metadata (8)](#metadata-8)
- [Users (1)](#users-1)
- [Boards (3)](#boards-3)
- [Sprints (8)](#sprints-8)
- [Backlog (2)](#backlog-2)
- [Epics (4)](#epics-4)
- [Ranking (1)](#ranking-1)
- [Bulk Operations (4)](#bulk-operations-4)
- [Filters (6)](#filters-6)
- [JQL (3)](#jql-3)
- [Dashboards (5)](#dashboards-5)

---

## Authentication (9)

### `jira_auth_status`

현재 인증 상태 및 인증 유형 확인.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

### `jira_whoami`

현재 인증된 Jira 사용자 정보 확인.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

### `_internal_jira_set_auth`

Basic Auth(이메일 + API 토큰)로 Jira 연결 설정. 사용자가 명시적으로 자격 증명을 제공했을 때만 사용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `baseUrl` | string | Yes | Jira 인스턴스 URL |
| `email` | string (email) | Yes | 이메일 주소 |
| `apiToken` | string | Yes | API 토큰 |
| `persist` | boolean | No | 자격 증명 영구 저장 여부 (default: false) |

### `jira_clear_auth`

저장된 Jira 자격 증명 제거/초기화.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

### `jira_oauth_get_auth_url`

OAuth 2.0 인증 URL 생성. 사용자가 방문하여 접근을 허가.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clientId` | string | Yes | Atlassian Developer Console의 OAuth Client ID |
| `redirectUri` | string (uri) | Yes | OAuth 앱에 설정된 콜백 URL |
| `scopes` | string[] | No | 요청할 OAuth 스코프 (default: read/write:jira-work, read:jira-user, offline_access) |

### `jira_oauth_exchange_code`

사용자가 OAuth 플로우를 완료한 후 인증 코드를 액세스 토큰으로 교환.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clientId` | string | Yes | OAuth Client ID |
| `clientSecret` | string | Yes | OAuth Client Secret |
| `code` | string | Yes | OAuth 콜백에서 받은 인증 코드 |
| `redirectUri` | string (uri) | Yes | 콜백 URL |
| `siteUrl` | string (uri) | No | 특정 Jira 사이트 URL |
| `persist` | boolean | No | 토큰 영구 저장 여부 (default: false) |

### `jira_oauth_set_tokens`

이미 보유한 OAuth 토큰을 직접 설정 (이전 세션 또는 외부 OAuth 플로우에서 획득한 경우).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clientId` | string | Yes | OAuth Client ID |
| `clientSecret` | string | Yes | OAuth Client Secret |
| `accessToken` | string | Yes | 액세스 토큰 |
| `refreshToken` | string | No | 리프레시 토큰 |
| `cloudId` | string | No | Jira 사이트의 Cloud ID |
| `siteUrl` | string (uri) | No | Jira 사이트 URL (cloudId 자동 조회용) |
| `persist` | boolean | No | 영구 저장 여부 (default: false) |

### `jira_oauth_refresh`

리프레시 토큰으로 OAuth 액세스 토큰 수동 갱신.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

### `jira_oauth_list_sites`

현재 OAuth 토큰으로 접근 가능한 모든 Jira 사이트 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

---

## Issues (12)

### `jira_resolve`

**라우팅 도구**. 사용자 의도가 명확하지만 정확한 도구를 모를 때 먼저 호출.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `intent` | enum: `get_issue`, `search`, `my_issues` | Yes | 사용자 의도 |
| `issueKey` | string | No | 이슈 키 (get_issue용) |
| `jql` | string | No | JQL 쿼리 (search용) |
| `maxResults` | integer (1~50) | No | 최대 결과 수 |

### `jira_get_issue`

이슈 키로 **전체 상세 정보** 조회. 설명, 코멘트 수, 담당자, 우선순위 등 모든 필드 포함.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID (예: `PROJ-123`) |
| `fields` | string[] | No | 반환할 필드 목록 |
| `expand` | string | No | 확장 옵션 |

### `jira_get_issue_summary`

이슈의 **요약, 설명, 수락 기준**만 간단히 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

### `jira_get_my_open_issues`

**현재 사용자**에게 할당된 미완료 이슈 조회. 다른 사용자 이슈는 `jira_search_issues` 사용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `maxResults` | integer (1~50) | No | 최대 결과 수 |

### `jira_search_issues_summary`

JQL로 이슈 검색 — **key, summary, status만** 반환. 대부분의 검색에 권장 (빠르고 간결).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jql` | string | Yes | JQL 쿼리 |
| `maxResults` | integer (1~50) | No | 최대 결과 수 |

### `jira_search_issues`

JQL로 이슈 검색 — **전체 필드 상세 정보** 반환. 설명, 담당자, 우선순위 등 상세 정보가 필요할 때 사용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jql` | string | Yes | JQL 쿼리 |
| `fields` | string[] | No | 반환할 필드 |
| `expand` | string | No | 확장 옵션 |
| `maxResults` | integer (1~200) | No | 최대 결과 수 |
| `startAt` | integer | No | 시작 인덱스 (페이징) |
| `nextPageToken` | string | No | 다음 페이지 토큰 |
| `reconcileIssues` | boolean | No | 이슈 재조정 여부 |

### `jira_create_issue`

새 Jira 이슈 생성. 최소 프로젝트 키, 이슈 유형, 요약 필요.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKey` | string | Yes | 프로젝트 키 (예: `MXTS`) |
| `issueType` | string | Yes | 이슈 유형 (예: `Bug`, `Task`, `Story`) |
| `summary` | string | Yes | 이슈 제목 |
| `description` | string | No | 설명 (plain text → ADF 변환) |
| `assignee` | string | No | 담당자 계정 ID (`-1`: 자동 할당) |
| `reporter` | string | No | 보고자 계정 ID |
| `priority` | string | No | 우선순위 (예: `High`, `Medium`) |
| `labels` | string[] | No | 레이블 |
| `components` | string[] | No | 컴포넌트 이름 또는 ID |
| `fixVersions` | string[] | No | 수정 버전 |
| `affectsVersions` | string[] | No | 영향받는 버전 |
| `dueDate` | string | No | 마감일 (`YYYY-MM-DD`) |
| `environment` | string | No | 환경 설명 |
| `parentKey` | string | No | 상위 이슈 키 (서브태스크용) |
| `originalEstimate` | string | No | 예상 시간 (예: `2h`, `1d`) |
| `customFields` | object | No | 커스텀 필드 키-값 |

### `jira_update_issue`

기존 이슈 수정. 제공된 필드만 업데이트.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `summary` | string | No | 새 제목 |
| `description` | string | No | 새 설명 |
| `assignee` | string \| null | No | 담당자 (`null`: 할당 해제) |
| `priority` | string | No | 우선순위 |
| `dueDate` | string \| null | No | 마감일 (`null`: 삭제) |
| `labels` | object | No | 레이블 작업 (`add`/`remove`/`set`) |
| `components` | object | No | 컴포넌트 작업 (`add`/`remove`/`set`) |
| `fixVersions` | object | No | 수정 버전 작업 (`add`/`remove`/`set`) |
| `customFields` | object | No | 커스텀 필드 값 |
| `notifyUsers` | boolean | No | 관찰자 알림 전송 (default: true) |

### `jira_assign_issue`

이슈 담당자 할당 또는 해제.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `accountId` | string \| null | Yes | 사용자 계정 ID (`-1`: 자동, `null`: 해제) |

### `jira_get_transitions`

이슈의 사용 가능한 워크플로우 전환 목록 조회. 전환 실행 전 유효 옵션 확인용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `expand` | string | No | 확장 옵션 (`transitions.fields`: 필수 필드 포함) |

### `jira_transition_issue`

워크플로우 전환을 실행하여 이슈 상태 변경.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `transitionId` | string | Yes | 전환 ID (`jira_get_transitions`에서 획득) |
| `comment` | string | No | 전환 시 추가할 코멘트 |
| `resolution` | string | No | 해결 유형 (예: `Done`, `Fixed`) |
| `fields` | object | No | 전환에 필요한 추가 필드 |

### `jira_get_changelog`

이슈의 변경 이력 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `maxResults` | integer (1~100) | No | 최대 결과 수 (default: 20) |
| `startAt` | integer | No | 시작 인덱스 |

---

## Issue Links (3)

### `jira_get_issue_links`

특정 이슈에 연결된 모든 이슈 링크 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

### `jira_create_issue_link`

두 이슈 간 링크 생성.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inwardIssue` | string | Yes | 인바운드(from) 이슈 키 |
| `outwardIssue` | string | Yes | 아웃바운드(to) 이슈 키 |
| `linkType` | string | Yes | 링크 유형 (예: `Blocks`, `Relates`, `Duplicates`) |
| `comment` | string | No | 링크와 함께 추가할 코멘트 |

### `jira_get_link_types`

사용 가능한 이슈 링크 유형 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

---

## Comments (2)

### `jira_get_issue_comments`

특정 이슈의 코멘트 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `maxResults` | integer (1~100) | No | 최대 결과 수 |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_add_comment`

특정 이슈에 코멘트 추가.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `body` | string | Yes | 코멘트 내용 |

---

## Attachments (4)

### `jira_get_attachments`

이슈의 모든 첨부파일 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

### `jira_upload_attachment`

이슈에 파일 첨부 업로드. 로컬 파일 시스템 경로 필요.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `filePath` | string | Yes | 업로드할 파일의 절대 경로 |
| `filename` | string | No | 파일명 오버라이드 |

### `jira_get_attachment_metadata`

특정 첨부파일의 메타데이터 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | 첨부파일 ID |

### `jira_get_attachment_content`

첨부파일의 다운로드 URL 또는 내용 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | 첨부파일 ID |
| `redirect` | boolean | No | 리다이렉트 URL 반환 여부 (default: true) |

---

## Labels (2)

### `jira_get_all_labels`

Jira 인스턴스 전체에서 사용된 모든 레이블 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `maxResults` | number | No | 최대 결과 수 (default: 1000) |
| `startAt` | number | No | 시작 인덱스 (default: 0) |

### `jira_add_labels`

이슈에 레이블 추가/설정/제거.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `labels` | string[] | Yes | 대상 레이블 목록 |
| `operation` | enum: `add`, `set`, `remove` | No | 작업 유형 (default: `add`) |

---

## Watchers (3)

### `jira_get_watchers`

이슈의 관찰자 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

### `jira_add_watcher`

이슈에 관찰자 추가.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `accountId` | string | Yes | 추가할 사용자 계정 ID |

### `jira_remove_watcher`

이슈에서 관찰자 제거.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |
| `accountId` | string | Yes | 제거할 사용자 계정 ID |

---

## Votes (3)

### `jira_get_votes`

이슈의 투표 수 및 투표자 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

### `jira_add_vote`

이슈에 투표.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

### `jira_remove_vote`

이슈에서 투표 철회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

---

## Worklogs (6)

### `jira_add_worklog`

특정 이슈에 작업 시간 기록.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 (예: `PROJ-123`) |
| `timeSpent` | string | Yes | 작업 시간 (예: `1h`, `30m`, `1h 30m`, `1d`) |
| `started` | string (ISO 8601) | No | 작업 시작 시각 (default: 현재) |
| `comment` | string | No | 작업 내용 설명 |

### `jira_get_issue_worklogs`

**특정 이슈**에 기록된 작업 기록 조회. 사용자 타임시트는 `jira_get_user_worklogs` 사용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 (예: `PROJ-123`) |
| `maxResults` | integer (1~100) | No | 최대 결과 수 |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_get_user_worklogs`

**사용자별** 작업 기록 리포트 조회 (기간 지정). 타임시트, 주간/월간 요약에 사용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `since` | string | Yes | 시작 날짜 (ISO 8601 또는 상대적 표현) |
| `until` | string | No | 종료 날짜 (default: 현재) |
| `accountId` | string | No | 사용자 계정 ID (default: 현재 사용자) |
| `includeIssueDetails` | boolean | No | 이슈 상세 포함 여부 (default: false) |

### `jira_get_updated_worklog_ids`

특정 날짜 이후 생성/수정된 작업 기록 ID 목록 조회. 리포팅 용도.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `since` | string | Yes | 기준 날짜 (ISO 8601 또는 Unix 타임스탬프 ms) |
| `expand` | string | No | 확장 옵션 |

### `jira_get_deleted_worklog_ids`

특정 날짜 이후 삭제된 작업 기록 ID 목록 조회. 감사/동기화 용도.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `since` | string | Yes | 기준 날짜 (ISO 8601 또는 Unix 타임스탬프 ms) |

### `jira_get_worklogs_by_ids`

작업 기록 ID 목록으로 상세 정보 일괄 조회. `jira_get_updated_worklog_ids` 이후 사용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `ids` | integer[] | Yes | 작업 기록 ID 배열 (최대 1000) |
| `expand` | string | No | 확장 옵션 |

---

## Projects (2)

### `jira_list_projects`

접근 가능한 Jira 프로젝트 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `maxResults` | integer (1~50) | No | 최대 결과 수 |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_get_project`

특정 프로젝트의 상세 정보 및 메타데이터 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectIdOrKey` | string | Yes | 프로젝트 키 또는 ID |

---

## Metadata (8)

### `jira_get_issue_types`

사용 가능한 이슈 유형 조회. 프로젝트별 필터 가능.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKey` | string | No | 프로젝트별 필터 |

### `jira_get_priorities`

사용 가능한 우선순위 레벨 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

### `jira_get_statuses`

사용 가능한 상태 목록 조회. 프로젝트별 필터 가능.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKey` | string | No | 프로젝트별 필터 |

### `jira_get_components`

특정 프로젝트의 컴포넌트 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKey` | string | Yes | 프로젝트 키 |

### `jira_get_versions`

특정 프로젝트의 버전 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKey` | string | Yes | 프로젝트 키 |
| `released` | boolean | No | 릴리스 상태 필터 |

### `jira_get_fields`

커스텀 필드를 포함한 모든 사용 가능한 필드 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| _(없음)_ | | | |

### `jira_get_create_metadata`

프로젝트에서 이슈 생성 시 사용 가능한 이슈 유형 및 필드 메타데이터 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectIdOrKey` | string | Yes | 프로젝트 키 또는 ID |
| `issueTypeId` | string | No | 특정 이슈 유형의 필드 메타데이터 조회 |
| `maxResults` | number | No | 최대 결과 수 (default: 50) |
| `startAt` | number | No | 시작 인덱스 |

### `jira_get_edit_metadata`

특정 이슈의 편집 가능한 필드 메타데이터 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdOrKey` | string | Yes | 이슈 키 또는 ID |

---

## Users (1)

### `jira_search_users`

이름, 이메일, 사용자명으로 Jira 사용자 검색.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | 검색어 (이름, 이메일, 사용자명) |
| `projectKey` | string | No | 해당 프로젝트 접근 권한이 있는 사용자만 필터 |
| `maxResults` | integer (1~50) | No | 최대 결과 수 (default: 10) |

---

## Boards (3)

### `jira_get_boards`

모든 Scrum/Kanban 보드 조회. 프로젝트 또는 유형별 필터 가능.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectKeyOrId` | string | No | 프로젝트별 필터 |
| `type` | enum: `scrum`, `kanban`, `simple` | No | 보드 유형 필터 |
| `name` | string | No | 이름으로 필터 (포함 검색) |
| `maxResults` | integer (1~50) | No | 최대 결과 수 (default: 50) |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_get_board`

특정 보드의 상세 정보 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | integer | Yes | 보드 ID |

### `jira_get_board_configuration`

보드의 컬럼, 추정, 랭킹 등 설정 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | integer | Yes | 보드 ID |

---

## Sprints (8)

### `jira_get_sprints`

보드의 스프린트 목록 조회. 상태별 필터 가능.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | integer | Yes | 보드 ID |
| `state` | enum: `future`, `active`, `closed` | No | 스프린트 상태 필터 |
| `maxResults` | integer (1~50) | No | 최대 결과 수 (default: 50) |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_get_sprint`

특정 스프린트의 상세 정보 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sprintId` | integer | Yes | 스프린트 ID |

### `jira_create_sprint`

보드에 새 스프린트 생성.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | integer | Yes | 보드 ID |
| `name` | string | Yes | 스프린트 이름 |
| `startDate` | string (ISO 8601) | No | 시작일 |
| `endDate` | string (ISO 8601) | No | 종료일 |
| `goal` | string | No | 스프린트 목표 |

### `jira_update_sprint`

스프린트 이름, 날짜, 목표 등 수정.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sprintId` | integer | Yes | 스프린트 ID |
| `name` | string | No | 새 이름 |
| `startDate` | string (ISO 8601) | No | 시작일 |
| `endDate` | string (ISO 8601) | No | 종료일 |
| `goal` | string | No | 목표 |
| `state` | enum: `future`, `active`, `closed` | No | 상태 |

### `jira_start_sprint`

`future` 상태의 스프린트 시작.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sprintId` | integer | Yes | 스프린트 ID |
| `endDate` | string (ISO 8601) | Yes | 종료일 (시작 시 필수) |
| `startDate` | string (ISO 8601) | No | 시작일 (default: 현재) |

### `jira_complete_sprint`

활성 스프린트 완료. 미완료 이슈를 다른 스프린트로 이동 가능.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sprintId` | integer | Yes | 완료할 스프린트 ID |
| `moveIncompleteIssuesTo` | integer | No | 미완료 이슈 이동 대상 스프린트 ID (미지정 시 백로그) |

### `jira_get_sprint_issues`

스프린트의 모든 이슈 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sprintId` | integer | Yes | 스프린트 ID |
| `fields` | string[] | No | 반환할 필드 |
| `jql` | string | No | 추가 JQL 필터 |
| `maxResults` | integer (1~100) | No | 최대 결과 수 (default: 50) |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_move_issues_to_sprint`

이슈를 특정 스프린트로 이동.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sprintId` | integer | Yes | 대상 스프린트 ID |
| `issueKeys` | string[] | Yes | 이동할 이슈 키 배열 |

---

## Backlog (2)

### `jira_get_backlog_issues`

보드의 백로그 이슈 조회 (활성 스프린트에 속하지 않은 이슈).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | integer | Yes | 보드 ID |
| `fields` | string[] | No | 반환할 필드 |
| `jql` | string | No | 추가 JQL 필터 |
| `maxResults` | integer (1~100) | No | 최대 결과 수 (default: 50) |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_move_issues_to_backlog`

이슈를 스프린트에서 백로그로 이동.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKeys` | string[] | Yes | 백로그로 이동할 이슈 키 배열 |

---

## Epics (4)

### `jira_get_epics`

보드의 에픽 목록 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `boardId` | integer | Yes | 보드 ID |
| `done` | enum: `true`, `false` | No | 완료 상태 필터 |
| `maxResults` | integer (1~50) | No | 최대 결과 수 (default: 50) |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_get_epic_issues`

에픽에 속한 모든 이슈 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicIdOrKey` | string | Yes | 에픽 ID 또는 키 |
| `fields` | string[] | No | 반환할 필드 |
| `jql` | string | No | 추가 JQL 필터 |
| `maxResults` | integer (1~100) | No | 최대 결과 수 (default: 50) |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_move_issues_to_epic`

이슈를 에픽으로 이동.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `epicIdOrKey` | string | Yes | 에픽 ID 또는 키 |
| `issueKeys` | string[] | Yes | 이동할 이슈 키 배열 |

### `jira_remove_issues_from_epic`

이슈를 에픽에서 제거 (에픽 없음 상태로).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKeys` | string[] | Yes | 에픽에서 제거할 이슈 키 배열 |

---

## Ranking (1)

### `jira_rank_issues`

보드에서 이슈 순위 변경. 다른 이슈의 앞/뒤로 배치.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueKeys` | string[] | Yes | 순위를 변경할 이슈 키 배열 |
| `rankBeforeIssue` | string | No | 이 이슈 앞에 배치 |
| `rankAfterIssue` | string | No | 이 이슈 뒤에 배치 |

---

## Bulk Operations (4)

### `jira_bulk_edit_issues`

여러 이슈를 한 번에 수정. 레이블, 담당자, 우선순위, 컴포넌트, 수정 버전 지원. 비동기 처리 (`taskId` 반환).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdsOrKeys` | string[] | Yes | 대상 이슈 키/ID 배열 |
| `editedFieldsInput` | object | Yes | 수정할 필드 및 작업 |
| `editedFieldsInput.labels` | object | No | 레이블 (`add`/`remove`/`set`) |
| `editedFieldsInput.assignee` | object | No | 담당자 (`accountId`) |
| `editedFieldsInput.priority` | object | No | 우선순위 (`id`) |
| `editedFieldsInput.components` | object | No | 컴포넌트 (`add`/`remove`) |
| `editedFieldsInput.fixVersions` | object | No | 수정 버전 (`add`/`remove`) |
| `sendNotifications` | boolean | No | 알림 전송 여부 (default: true) |

### `jira_bulk_watch_issues`

여러 이슈에 관찰자를 일괄 추가. 비동기 처리 (`taskId` 반환).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdsOrKeys` | string[] | Yes | 대상 이슈 키/ID 배열 |
| `accountIds` | string[] | No | 관찰자 계정 ID (default: 현재 사용자) |

### `jira_bulk_unwatch_issues`

여러 이슈에서 관찰자를 일괄 제거. 비동기 처리 (`taskId` 반환).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueIdsOrKeys` | string[] | Yes | 대상 이슈 키/ID 배열 |
| `accountIds` | string[] | No | 제거할 계정 ID (default: 현재 사용자) |

### `jira_get_bulk_operation_progress`

비동기 일괄 작업의 진행 상황 조회 (`taskId` 사용).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | Yes | 일괄 작업에서 반환된 태스크 ID |

---

## Filters (6)

### `jira_get_filters`

저장된 필터 목록 조회. 이름별 필터 가능.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filterName` | string | No | 이름으로 필터 (포함 검색) |
| `owner` | string | No | 소유자 계정 ID로 필터 |
| `expand` | string | No | 확장 옵션 |
| `maxResults` | integer (1~50) | No | 최대 결과 수 (default: 50) |
| `startAt` | integer | No | 시작 인덱스 |

### `jira_get_filter`

특정 필터의 상세 정보 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filterId` | string | Yes | 필터 ID |
| `expand` | string | No | 확장 옵션 |

### `jira_create_filter`

새 저장 필터 생성.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | 필터 이름 |
| `jql` | string | Yes | JQL 쿼리 |
| `description` | string | No | 필터 설명 |
| `favourite` | boolean | No | 즐겨찾기 표시 |

### `jira_update_filter`

기존 필터 수정.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filterId` | string | Yes | 필터 ID |
| `name` | string | No | 새 이름 |
| `jql` | string | No | 새 JQL 쿼리 |
| `description` | string | No | 새 설명 |
| `favourite` | boolean | No | 즐겨찾기 상태 |

### `jira_get_my_filters`

현재 사용자가 소유한 필터 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `expand` | string | No | 확장 옵션 |

### `jira_get_favourite_filters`

현재 사용자가 즐겨찾기한 필터 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `expand` | string | No | 확장 옵션 |

---

## JQL (3)

### `jira_autocomplete_jql`

JQL 필드 값 자동완성 제안. 인터랙티브 JQL 쿼리 작성용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `fieldName` | string | No | 자동완성할 필드명 (예: `status`, `priority`, `assignee`) |
| `fieldValue` | string | No | 자동완성할 부분 값 |
| `predicateName` | string | No | 함수 제안용 predicate 이름 |
| `predicateValue` | string | No | predicate 부분 값 |

### `jira_validate_jql`

하나 이상의 JQL 쿼리의 구문 및 의미적 정확성 검증.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `queries` | string[] | Yes | 검증할 JQL 쿼리 배열 |
| `validation` | enum: `strict`, `warn`, `none` | No | 검증 수준 (default: `strict`) |

### `jira_parse_jql`

JQL 쿼리를 파싱하여 추상 구문 트리(AST) 구조 반환. 쿼리 구조 이해용.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `queries` | string[] | Yes | 파싱할 JQL 쿼리 배열 |
| `validation` | enum: `strict`, `warn`, `none` | No | 검증 수준 (default: `none`) |

---

## Dashboards (5)

### `jira_get_dashboards`

대시보드 목록 조회. 즐겨찾기 또는 소유 대시보드 필터 가능.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter` | enum: `favourite`, `my` | No | 즐겨찾기/소유 필터 |
| `maxResults` | number | No | 최대 결과 수 (default: 50) |
| `startAt` | number | No | 시작 인덱스 (default: 0) |

### `jira_search_dashboards`

이름, 소유자 등으로 대시보드 검색.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dashboardName` | string | No | 이름 필터 (대소문자 무시, 포함 검색) |
| `accountId` | string | No | 소유자 계정 ID 필터 |
| `groupname` | string | No | 그룹 권한 필터 |
| `orderBy` | enum | No | 정렬 (`name`, `-name`, `id`, `-id`, `owner`, `-owner`, `favourite_count`, `-favourite_count`) |
| `expand` | string | No | 확장 옵션 |
| `maxResults` | number | No | 최대 결과 수 (default: 50) |
| `startAt` | number | No | 시작 인덱스 (default: 0) |

### `jira_get_dashboard`

특정 대시보드의 상세 정보 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | 대시보드 ID |

### `jira_get_dashboard_gadgets`

대시보드의 모든 가젯 조회.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dashboardId` | string | Yes | 대시보드 ID |
| `gadgetId` | string[] | No | 가젯 ID 필터 |
| `moduleKey` | string[] | No | 가젯 모듈 키 필터 |
| `uri` | string | No | 가젯 URI 필터 |

### `jira_add_dashboard_gadget`

대시보드에 가젯 추가. `moduleKey` 또는 `uri`로 가젯 유형 지정.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dashboardId` | string | Yes | 대시보드 ID |
| `moduleKey` | string | No | 가젯 모듈 키 |
| `uri` | string | No | 가젯 URI |
| `title` | string | No | 가젯 제목 |
| `color` | enum: `blue`, `red`, `yellow`, `green`, `cyan`, `purple`, `gray`, `white` | No | 가젯 색상 |
| `position` | object (`row`, `column`) | No | 대시보드 그리드 위치 |
| `ignoreUriAndModuleKeyValidation` | boolean | No | moduleKey/uri 검증 건너뛰기 (default: false) |
