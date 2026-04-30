# Step 1.5: Parse Requirements Document (★ import 모드 전용)

**진입 조건**: `importMode = true` (Step 0에서 결정).
**복귀 지점**: 파싱 성공 시 Step 5(Final Preview)로 점프. Step 1~4는 skip.

import 모드에서는 본 단계가 자동 분해 판단(Step 3/4)을 대체한다. 트리는 여기서 확정된다.

## Step 1.5-1. 파일 검증

1. `Read` 도구로 `importPath` 파일을 연다.
   - 파일 부재 → **E2** 처리 후 종료.
   - 파일 크기 1MB 초과 → 경고 + `AskUserQuestion`으로 진행 confirm (discover 패턴과 일관).
2. 본문이 빈 문자열이거나 공백만 있음 → **E3** 처리 후 종료.

## Step 1.5-2. `Proposed Issue Breakdown` 섹션 추출

1. 본문에서 `## Proposed Issue Breakdown` 헤딩을 정확히 찾는다 (대소문자 정확 매칭).
2. 헤딩이 없으면 → **E4** 처리 (자연어 모드 폴백 제안 후 사용자 confirm).
3. 헤딩 발견 후 다음 `## ` 헤딩 또는 EOF 직전까지의 텍스트를 섹션 본문으로 잘라낸다.

## Step 1.5-3. 트리 파싱 (상태머신 기반)

**입력 트리 형식 (표준):**

```markdown
- **Epic**: <에픽 1줄 요약>
  - **Story 1**: <스토리 요약>
    - Sub-task 1.1: <서브태스크 요약>
    - Sub-task 1.2: <서브태스크 요약> (blocks: 1.1)
  - **Story 2**: <스토리 요약>
    - Sub-task 2.1: <서브태스크 요약>
```

**파싱 규칙:**

- **들여쓰기**: 2-space 또는 4-space 모두 허용. 같은 문서 내 혼용 시 첫 자식의 들여쓰기 폭을 기준으로 삼고, 그와 다른 라인이 등장하면 경고 (**E10**). 파싱 자체가 불가하면 종료.
- **불릿 기호**: `-` 또는 `*` 모두 허용. 같은 문서 내 혼용 허용.
- **노드 식별**:
  - `**Epic**:` 또는 `Epic:` 으로 시작 → **Epic 노드** (트리 루트)
  - `**Story <N>**:` 또는 `Story <N>:` → **Story 노드**
  - `Sub-task <N>.<M>:` 또는 `Subtask <N>.<M>:` → **Subtask 노드**
  - 일치하지 않는 라인은 무시(주석으로 간주)하되 디버그 로그 1줄을 남긴다.
- **부모 매핑**:
  - Epic은 트리 1개당 1개. 0개이면 **E6** 처리 (파일명 슬러그 기반 기본 Epic 자동 생성 + confirm).
  - Story `<N>`의 부모는 Epic.
  - Subtask `<N>.<M>`의 부모는 Story `<N>`.
  - Story가 0개이고 Subtask만 존재하는 경우 → 보강 입력 요청 또는 종료 (**E5** 인접).
- **`(blocks: <ref>)` 표기**:
  - 위치: Story 또는 Subtask 라인의 끝.
  - 참조 형식: `<N>` (같은 Epic 아래의 Story 인덱스) 또는 `<N>.<M>` (같은 Story 아래의 Subtask 인덱스).
  - 같은 부모 아래 sibling 참조만 허용. 다른 Story의 Subtask 참조는 **E7** 처리 (해당 링크 1건만 skip + 경고).
  - 다중 참조: `(blocks: 1.1, 1.2)` 형식 허용.

## Step 1.5-4. 파싱 결과 정리 (`ImportPayload`)

파싱 결과를 다음과 같은 내부 표 구조로 정리한다 (개념적 자료 구조 — LLM이 머릿속에서 들고 있는다):

- `epic`: `{summary, description?, priority?, labels?}` — 노드 1개
- `stories[]`: 각 항목은 `{index, summary, description?, priority?, labels?, subtasks[]}`
  - `subtasks[]`: 각 항목은 `{index, summary, description?, priority?, labels?, blocks: [<ref>]}`
- `links[]`: blocks 관계 리스트 `{outwardRef, inwardRef}` (트리 인덱스 표기, 생성 후 실제 키로 해석)

> **priority/labels 추출 규칙**: 표준 트리 형식에는 priority/labels 표기 문법이 없다. 따라서 `priority`/`labels`는 항상 비어 있는 옵셔널 필드로 다루며, **트리에 표기가 없으면 priority는 항상 `Medium`을 사용한다** (Step 6의 `or "Medium"` 폴백). labels는 폴백 시에만 자동으로 채워진다 (예: `epic-substitute`).

## Tree → Issue Mapping

| 트리 노드 | Jira issue_type | parent 필드 | 폴백 |
|-----------|----------------|------------|------|
| Epic | `Epic` | (없음) | 실패 시 `Task` + label `epic-substitute` |
| Story | `Story` | Epic-KEY | 실패 시 `Task` + parent=Epic-KEY |
| Sub-task | `Subtask` | Story-KEY | 실패 시 `Task` + parent=Story-KEY |

**의존성 표현:**
- `(blocks: ...)` 표기 → `link_type = "Blocks"` (실제 이름은 `jira_get_link_types`로 조회).
- "A가 B를 블록한다" → `outward_issue_key = A, inward_issue_key = B`.
- 트리 인덱스 → 실제 키 매핑 테이블은 Step 6에서 노드 생성 직후 누적(`draft_index → created_key`).
