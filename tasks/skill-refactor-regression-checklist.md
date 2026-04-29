# SKILL 리팩토링 회귀 검증 체크리스트 템플릿

> **Note**: 이 파일은 템플릿입니다. Story 2~5 각 리팩토링 PR에서 아래 명령으로 사본을 생성한 뒤 기록하세요.

## How to Use

**1. 사본 생성 (PR 작업 브랜치에서 실행)**

```bash
cp tasks/skill-refactor-regression-checklist.md tasks/regression-<STORY-ID>.md
```

예시: `cp tasks/skill-refactor-regression-checklist.md tasks/regression-MAE-193.md`

**2. 결과 기록 절차**

1. 해당 Story에서 변경된 SKILL 섹션만 실행한다.
2. 각 시나리오를 manual로 수행한다.
3. 통과 시 `- [ ]` → `- [x]`로 변경하고 `Result:` 줄에 `✅`를, 실패 시 `❌`를 기록한다.
4. 재현 명령·오류 메시지 등은 `Notes:` 줄에 자유롭게 기록한다.
5. 완료된 사본을 PR 본문 또는 Jira 코멘트에 첨부한다.

---

## Review SKILL

### 시나리오

- [ ] review-log append best-effort 동작 — review-log append 단계가 실패해도 전체 리뷰 워크플로가 중단되지 않고 완료된다
  - Result:
  - Notes:

- [ ] redact 적용 — 리뷰 결과 코멘트에서 민감 패턴(시크릿 등)이 redact 처리되어 출력된다
  - Result:
  - Notes:

- [ ] ApprovedFinding 0건 케이스 — 승인된 지적 사항이 없을 때 리뷰 코멘트가 정상 출력되고 오류 없이 종료된다
  - Result:
  - Notes:

---

## Init SKILL

### 시나리오

- [ ] count 모드 (`/jira-task init N`) — 숫자를 인자로 전달했을 때 상위 N개 태스크에 대해 워크트리가 생성된다
  - Result:
  - Notes:

- [ ] issue-key 모드 (`/jira-task init ISSUE-KEY`) — 특정 이슈 키를 전달했을 때 해당 태스크의 하위 태스크를 분석하여 워크트리를 생성한다
  - Result:
  - Notes:

- [ ] 자연어 모드 (`/jira-task init 설명`) — 자연어 설명을 전달했을 때 적절한 이슈를 식별하여 워크트리를 생성한다
  - Result:
  - Notes:

---

## Discover SKILL

### 시나리오

- [ ] default 모드 (`/jira-task discover 주제`) — 주제를 인자로 전달했을 때 요구사항 문서가 생성된다
  - Result:
  - Notes:

- [ ] `--lite` 모드 (`/jira-task discover --lite`) — lite 플래그 사용 시 간소화된 요구사항 수집 흐름이 실행된다
  - Result:
  - Notes:

- [ ] `--from` 모드 (`/jira-task discover --from <파일>`) — 기존 파일을 입력으로 전달했을 때 해당 내용을 기반으로 요구사항 문서가 생성된다
  - Result:
  - Notes:

- [ ] Step 4.5 confirm 분기 — 요구사항 수집 후 사용자 확인 단계에서 수정 요청 시 재수집 분기가 정상 동작한다
  - Result:
  - Notes:

---

## Create SKILL

### 시나리오

- [ ] default 모드 (`/jira-task create`) — 대화형 흐름으로 Jira 이슈가 정상 생성된다
  - Result:
  - Notes:

- [ ] `--from-requirements` 모드 (`/jira-task create --from-requirements <파일>`) — 요구사항 파일을 입력으로 전달했을 때 해당 내용을 기반으로 Jira 이슈가 생성된다
  - Result:
  - Notes:
