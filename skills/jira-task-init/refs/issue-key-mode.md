# Issue Key Mode: Step 1-B Detailed Procedure

Step 0에서 이슈 키를 추출한 후 이 절차를 따른다.

## 1-B-1. 부모 이슈 조회

```
Use mcp__atlassian__jira_get_issue with issue_key: <ISSUE-KEY>
  fields="summary,status,issuetype,priority"
  comment_limit=0
```

이슈 타입과 요약을 확인하여 사용자에게 표시.

## 1-B-2. 하위작업 조회

```
Use mcp__atlassian__jira_search with JQL:
  parent = <ISSUE-KEY> AND status NOT IN (Done, Closed) ORDER BY priority DESC, created ASC
  fields="summary,status,priority,issuetype,assignee"
  limit=50
```

**JIRA_DEFAULT_PROJECT가 설정되어 있으면 `project = <JIRA_DEFAULT_PROJECT> AND parent = <ISSUE-KEY> AND ...` 형태로 프로젝트 조건을 포함한다.**

하위작업이 없으면 사용자에게 알리고 종료.

## 1-B-3. 의존성 분석 및 착수 가능 작업 선별

각 하위작업에 대해 issue links를 분석한다:

- `mcp__atlassian__jira_get_issue`로 각 하위작업의 상세 정보(issuelinks 포함) 조회
  - **Context optimization**: `fields="summary,status,priority,issuetype,issuelinks"`, `comment_limit=0` (이 호출은 issuelinks가 핵심이므로 반드시 fields에 포함)
- `is blocked by` (inward) 관계의 링크된 이슈가 **미완료**(status가 Done/Closed가 아닌) 상태이면 해당 작업은 **blocked**로 분류
- 블로커가 없거나 모든 블로커가 완료된 작업만 **착수 가능**으로 선별

결과를 사용자에게 표시:

```
📋 <ISSUE-KEY>: <부모 이슈 요약>

하위작업 <전체 N>건 중 착수 가능 <M>건:

| # | Key | Summary | Priority | Status | Blocked By |
|---|-----|---------|----------|--------|------------|
| 1 | PROJ-201 | 로그인 API 구현 | High | To Do | - |
| 2 | PROJ-202 | UI 컴포넌트 작성 | High | To Do | - |
| - | PROJ-203 | 통합 테스트 | Medium | To Do | PROJ-201, PROJ-202 (미완료) |
```

착수 가능한 작업이 없으면 사용자에게 알리고 종료.
착수 가능한 작업 목록을 Step 2로 전달. → Step 2로 진행.
