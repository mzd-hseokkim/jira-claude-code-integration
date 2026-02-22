# mcp-atlassian Jira Tools Reference

MCP 서버: `atlassian` (패키지: [mcp-atlassian](https://github.com/sooperset/mcp-atlassian))
실행: `uvx mcp-atlassian`

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `JIRA_URL` | Yes | Jira Cloud URL (예: `https://company.atlassian.net`) |
| `JIRA_USERNAME` | Yes | Atlassian 계정 이메일 |
| `JIRA_API_TOKEN` | Yes | Atlassian API 토큰 |
| `JIRA_PERSONAL_TOKEN` | Server/DC | Server/Data Center용 PAT (USERNAME+TOKEN 대체) |

---

## 스킬에서 사용하는 도구 (allowed-tools prefix: `mcp__atlassian__`)

### Issue 조회

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_get_issue` | 이슈 상세 조회 | `issue_key` |
| `jira_search` | JQL로 이슈 검색 | `jql`, `max_results` |
| `jira_get_all_projects` | 전체 프로젝트 목록 | - |
| `jira_get_project_issues` | 프로젝트 이슈 조회 | `project_key` |
| `jira_get_transitions` | 이슈 상태 전환 목록 조회 | `issue_key` |

### Issue 생성/수정

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_create_issue` | 새 이슈 생성 | `project_key`, `summary`, `issue_type`, `description` |
| `jira_update_issue` | 이슈 수정 (담당자, 필드 등) | `issue_key`, `fields` |
| `jira_delete_issue` | 이슈 삭제 | `issue_key` |
| `jira_batch_create_issues` | 이슈 일괄 생성 | `issues` |
| `jira_transition_issue` | 이슈 상태 전환 | `issue_key`, `transition_id` |

### 댓글

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_add_comment` | 이슈에 댓글 추가 | `issue_key`, `comment` |

### 첨부파일

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_download_attachments` | 이슈 첨부파일 다운로드 | `issue_key`, `target_dir` |

> **참고**: 첨부파일 **업로드**는 지원하지 않음. Playwright 스크린샷 등은 로컬에서 직접 확인.

### Sprint & Agile

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_get_agile_boards` | 보드 목록 조회 | `project_key` (optional) |
| `jira_get_sprints_from_board` | 보드의 스프린트 조회 | `board_id`, `state` (active/closed/future) |
| `jira_get_sprint_issues` | 스프린트 이슈 조회 | `sprint_id` |
| `jira_get_board_issues` | 보드 이슈 조회 | `board_id` |
| `jira_create_sprint` | 스프린트 생성 | `board_id`, `name`, `start_date`, `end_date` |
| `jira_update_sprint` | 스프린트 수정 | `sprint_id`, `state`, `name` |

### 이슈 링크

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_create_issue_link` | 이슈 간 링크 생성 | `link_type`, `inward_issue`, `outward_issue` |
| `jira_remove_issue_link` | 이슈 링크 제거 | `link_id` |
| `jira_link_to_epic` | 에픽에 이슈 연결 | `issue_key`, `epic_key` |
| `jira_get_issue_link_types` | 링크 타입 목록 조회 | - |

### 사용자/워크로그

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_get_user_profile` | 사용자 정보 조회 (인증 확인용) | `account_id` (optional) |
| `jira_add_worklog` | 작업 시간 기록 | `issue_key`, `time_spent` |
| `jira_get_worklog` | 작업 로그 조회 | `issue_key` |

### 개발 정보 (Cloud only)

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_get_issue_development_info` | 연결된 PR/브랜치/커밋 조회 | `issue_key` |
| `jira_get_issues_development_info` | 일괄 개발 정보 조회 | `issue_keys` |
| `jira_batch_get_changelogs` | 이슈 변경 이력 조회 | `issue_keys` |

### 버전/필드

| 도구 | 설명 | 주요 파라미터 |
|------|------|--------------|
| `jira_get_project_versions` | 프로젝트 버전 목록 | `project_key` |
| `jira_create_version` | 버전 생성 | `project_key`, `name` |
| `jira_batch_create_versions` | 버전 일괄 생성 | `versions` |
| `jira_search_fields` | 필드 검색 | `query` |

---

## mcp-jira-cloud → mcp-atlassian 도구명 변경 대조표

| mcp-jira-cloud | mcp-atlassian |
|---|---|
| `jira_search_issues` | `jira_search` |
| `jira_get_boards` | `jira_get_agile_boards` |
| `jira_get_sprints` | `jira_get_sprints_from_board` (boardId 필요) |
| `jira_whoami` / `jira_auth_status` | `jira_get_user_profile` |
| `jira_upload_attachment` | ❌ 미지원 |
| `jira_get_issue_comments` | ❌ 미지원 (jira_get_issue 응답에 포함) |
| `jira_assign_issue` | `jira_update_issue` (fields.assignee) |
| 기타 (`jira_get_issue`, `jira_add_comment`, `jira_transition_issue`, etc.) | 동일 |
