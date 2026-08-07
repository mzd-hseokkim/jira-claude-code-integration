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

## Step 1.5-3. 루트 노드 감지 → 분해 레벨 분기

섹션 본문의 **첫 번째 의미 있는 불릿 라인**의 토큰을 본다 (불릿 기호 `-`/`*` 무시, 공백 trim 후):

| 첫 자식 토큰 | 분해 레벨 | 후속 파서 |
|---|---|---|
| `**작업**:` 또는 `작업:` | **L1 Single** | Step 1.5-4A |
| `**Story**:` 또는 `Story:` (Epic 노드 없이) | **L2 Story-only** | Step 1.5-4B |
| `**Epic**:` 또는 `Epic:` | **L3 Tree** | Step 1.5-4C |

식별 실패 → **E11** (자연어 폴백 제안 후 사용자 confirm).

확정한 레벨을 `breakdownLevel` 메타로 보존한다 (`"L1"` | `"L2"` | `"L3"`).

## Step 1.5-4A. L1 Single 파싱

L1 출력 템플릿(discover `breakdown-level.md`):

```markdown
- **작업**: <한 줄 요약>
  - 범위: <변경 파일/모듈 한 줄>
  - 검증: <측정 가능한 완료 기준 한 줄>
```

규칙:
- `**작업**:` 라인 1건만 허용. 2건 이상이면 **E5에 준하여** 보강 입력 요청 또는 종료(L1은 단건 전제).
- 자식 라인(`범위:`, `검증:`)은 옵셔널 — 발견되면 description 본문으로 합친다.
- 의존성/링크 없음. blocks 표기 무시(L1에는 sibling이 없음).

`ImportPayload`(L1):
- `breakdownLevel: "L1"`
- `single: { summary, description? }` — `description?`은 자식 라인을 줄바꿈 합친 본문.
- `epic`/`stories[]`/`links[]`는 모두 비어 있음.

## Step 1.5-4B. L2 Story-only 파싱

L2 출력 템플릿:

```markdown
- **Story**: <스토리 한 줄 요약>
  - Sub-task 1: <서브태스크 요약>
    - 범위: <파일/모듈>
  - Sub-task 2: <서브태스크 요약>
    - 범위: <파일/모듈>
```

규칙:
- Story 노드 1건. 2건 이상이면 **E5**.
- Story의 자식만 Sub-task로 인정 (`Sub-task <N>:` 또는 `Subtask <N>:`). L2 표준은 단일 인덱스(`1`,`2`,...)지만 사용자가 L3 템플릿을 흉내 낸 dot 인덱스(`1.1`,`1.2`,...)도 관용 처리한다 — Story가 1건뿐이라 의미 충돌이 없다.
- Sub-task의 `범위:` 자식 줄은 1.5-4C와 동일하게 `scope`로 보존한다.
- 들여쓰기/불릿 규칙은 1.5-4C와 동일(2/4-space, `-`/`*` 혼용 허용).
- `(blocks: <N>)` 표기는 같은 Story의 sibling Subtask 인덱스 참조만 허용. 위반은 **E7**(skip + 경고).

`ImportPayload`(L2):
- `breakdownLevel: "L2"`
- `epic: null`
- `stories[]`: 1건 — `{index: 1, summary, description?, subtasks[]}`
- `links[]`: 같은 Story 아래 sibling 참조만.

**주의**: 본 레벨에서 자동 Epic 생성을 **하지 않는다**. (이전 E6 폴백 제거 — Scope Decision #3 참고)

## Step 1.5-4C. L3 Tree 파싱 (기존 동작)

L3 출력 템플릿(표준):

```markdown
- **Epic**: <에픽 1줄 요약>
  - **Story 1**: <스토리 요약>
    - Sub-task 1.1: <서브태스크 요약>
      - 범위: <파일/모듈>
    - Sub-task 1.2: <서브태스크 요약> (blocks: 1.1)
      - 범위: <파일/모듈>
  - **Story 2**: <스토리 요약>
    - Sub-task 2.1: <서브태스크 요약>
      - 범위: <파일/모듈>
```

**파싱 규칙:**

- **들여쓰기**: 2-space 또는 4-space 모두 허용. 같은 문서 내 혼용 시 첫 자식의 들여쓰기 폭을 기준으로 삼고, 그와 다른 라인이 등장하면 경고 (**E10**). 파싱 자체가 불가하면 종료.
- **불릿 기호**: `-` 또는 `*` 모두 허용. 같은 문서 내 혼용 허용.
- **노드 식별**:
  - `**Epic**:` 또는 `Epic:` 으로 시작 → **Epic 노드** (트리 루트, L3 정확히 1개)
  - `**Story <N>**:` 또는 `Story <N>:` → **Story 노드**
  - `Sub-task <N>.<M>:` 또는 `Subtask <N>.<M>:` → **Subtask 노드**
  - `범위:` 또는 `Scope:` → 직전 Subtask 노드의 **scope 자식 줄**. 값(파일/모듈 문자열)을 해당 subtask의 `scope`에 보존한다. Subtask 노드보다 먼저 등장하거나 Story 직속이면 무시 + 디버그 로그.
  - 그 외 일치하지 않는 라인은 무시(주석으로 간주)하되 디버그 로그 1줄을 남긴다.
- **부모 매핑**:
  - Epic 0개는 L3에서 발생할 수 없음 (Step 1.5-3에서 이미 분기). 발생 시 파서 결함으로 간주.
  - Story `<N>`의 부모는 Epic.
  - Subtask `<N>.<M>`의 부모는 Story `<N>`.
- **`(blocks: <ref>)` 표기**:
  - 위치: Story 또는 Subtask 라인의 끝.
  - 참조 형식: `<N>` (같은 Epic 아래의 Story 인덱스) 또는 `<N>.<M>` (같은 Story 아래의 Subtask 인덱스).
  - 같은 부모 아래 sibling 참조만 허용. 다른 Story의 Subtask 참조는 **E7** 처리 (해당 링크 1건만 skip + 경고).
  - 다중 참조: `(blocks: 1.1, 1.2)` 형식 허용.

`ImportPayload`(L3):
- `breakdownLevel: "L3"`
- `epic: { summary, description?, ... }` — 노드 1개
- `stories[]`/`links[]` — 기존 그대로

## Step 1.5-5. ImportPayload 공통 구조

```
ImportPayload {
  breakdownLevel: "L1" | "L2" | "L3",
  single?: { summary, description? },                        // L1만
  epic?: { summary, description?, priority?, labels? },      // L3만 (L2는 null)
  stories[]?: [{ index, summary, description?, priority?, labels?, subtasks[] }], // L2/L3
  links[]?: [{ outwardRef, inwardRef }]                      // L2/L3 (sibling 참조)
}

subtasks[] 원소: { index, summary, description?, scope? }
```

> **`scope` 필드**: `범위:` 자식 줄에서 채워지며 Step 4.9(Import Granularity Check)의 유일한 판정 입력이다. `scope`가 비어 있는 Subtask는 겹침 판정 대상에서 제외되고, 제외된 건수를 Step 4.9가 사용자에게 1줄로 알린다 (조용히 통과시키지 않는다). `scope`는 Jira description 본문에도 `범위: <값>` 한 줄로 포함시킨다.

> **priority/labels 추출 규칙**: 표준 트리 형식에는 priority/labels 표기 문법이 없다. 따라서 `priority`/`labels`는 항상 비어 있는 옵셔널 필드로 다루며, **트리에 표기가 없으면 priority는 항상 `Medium`을 사용한다** (Step 6의 `or "Medium"` 폴백). labels는 폴백 시에만 자동으로 채워진다 (예: `epic-substitute`).

## Tree → Issue Mapping

| 레벨 | 트리 노드 | Jira issue_type | parent 필드 | 폴백 |
|---|-----------|----------------|------------|------|
| L1 | 작업 | `Task` | (없음) | 실패 시 그대로 보고 |
| L2 | Story | `Story` | (없음) | 실패 시 `Task` |
| L2 | Sub-task | `Subtask` | Story-KEY | 실패 시 `Task` + parent=Story-KEY |
| L3 | Epic | `Epic` | (없음) | 실패 시 `Task` + label `epic-substitute` |
| L3 | Story | `Story` | Epic-KEY | 실패 시 `Task` + parent=Epic-KEY |
| L3 | Sub-task | `Subtask` | Story-KEY | 실패 시 `Task` + parent=Story-KEY |

**`epicScope`(`.jira-epic.json`)가 있을 때의 덮어쓰기** — 상위 개념에서 정해진 Epic이 문서 트리보다 우선한다:

| 레벨 | 변경 |
|---|---|
| L1 | 작업의 parent = `epicScope.epicKey` |
| L2 | Story의 parent = `epicScope.epicKey` (`(없음)` 대신) |
| L3 | **Epic 행 자체가 사라진다** — Epic을 새로 만들지 않고 `epicScope.epicKey`를 Epic-KEY로 사용. Story/Sub-task 행은 그대로 |

Epic 중첩 생성은 하지 않는다.

**의존성 표현:**
- `(blocks: ...)` 표기 → `link_type = "Blocks"` (실제 이름은 `jira_get_link_types`로 조회).
- "A가 B를 블록한다" → `outward_issue_key = A, inward_issue_key = B`.
- 트리 인덱스 → 실제 키 매핑 테이블은 Step 6에서 노드 생성 직후 누적(`draft_index → created_key`).
