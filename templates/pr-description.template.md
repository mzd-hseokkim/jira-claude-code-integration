# PR Title

`{TASK-ID}: {Jira summary}`

---

<!--
Section contract (PR body 본문):
- 필수(required): Summary, Jira Issue, Changes, Acceptance Criteria, Test Plan
- 옵셔널(optional): Key Changes (Changes 안에 통합 가능), Screenshots (UI 없으면 생략), Notes

가변 섹션 마커 규약: `<!-- optional: <조건 또는 사유> -->` (헤더 직전 줄). 자동 처리 X, 사람/LLM 참고용.
-->

## Summary

{Jira 이슈 description 요약. 2-4줄.}

## Jira Issue

- **Key**: [{TASK-ID}]({JIRA_HOST}/browse/{TASK-ID})
- **Type**: {Story / Bug / Task / Subtask}
- **Priority**: {priority}

## Changes

{`git diff --stat` 기반 변경 파일 요약. 1-3줄.}

<!-- optional: 변경이 많을 때 핵심 항목만 bullet으로 강조. Changes 안에 녹여도 무방. -->
### Key Changes

- {주요 변경사항 1}
- {주요 변경사항 2}

## Acceptance Criteria

- [ ] {Jira 이슈의 acceptance criteria 1}
- [ ] {Jira 이슈의 acceptance criteria 2}

## Test Plan

{테스트 리포트가 있으면 `docs/test/<TASK-ID>.test-report.md` 요약.
없으면 수동 테스트 체크리스트.}

<!-- optional: UI 변경이 있을 때만. -->
## Screenshots

{이미지 또는 링크}

<!-- optional: 리뷰어가 알아두면 좋은 추가 맥락. -->
## Notes

- {note}
