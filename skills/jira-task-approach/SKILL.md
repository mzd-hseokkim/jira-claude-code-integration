---
name: jira-task-approach
description: "Generate a level-aware approach document (plan + design 통합). 작업 규모(L1/L2/L3)에 맞춰 분량을 조정. Triggers: jira-task approach, approach task; 접근 설계, 통합 설계."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# jira-task-approach: Generate Approach Document (level-aware)

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

`jira-task-approach`는 기존 `plan` + `design` 두 단계를 단일 단계로 통합한다. 작업 규모(L1/L2/L3)에 따라 분량과 깊이를 조정한다 — 작은 작업에 무거운 설계 문서를 쓰지 않는다.

**입력:**
- `<TASK-ID>` (필수)
- `.jira-context.json.cachedIssue` (Cache-First Fetch)
- `.jira-context.json.breakdownLevel` (있으면 우선)
- discover 산출물 `docs/requirements/<slug>.requirements.md`의 `Technical Approach Hint` 섹션 (있으면 입력)

**출력:**
- `docs/approach/<TASK-ID>.approach.md`
- Jira 코멘트 + 첨부 (가능 시)

**비목표:**
- 코드 작성/실행 (impl 단계 책임)
- 테스트 작성/실행 (test 단계 책임)

## Workflow

### Step 0: Determine Breakdown Level

레벨 결정 우선순위:

1. **`.jira-context.json.breakdownLevel`** (`"L1"` | `"L2"` | `"L3"`) — Sub 1.3에서 기록된 값. hit이면 그대로 사용.
2. **Jira issuetype 폴백 추론** — context에 값 없으면 cachedIssue의 issuetype으로:
   - `Subtask`, `Task`, `Bug` → **L1**
   - `Story` → **L2**
   - `Epic` → **L3**
   - 그 외 → **L1** (보수적)
3. **설계 차원 승급 체크** — 1~2로 정한 레벨이 L1이어도, 작업이 다음 중 하나라도 건드리면 최소 **L2로 격상**(이미 L2/L3면 유지): 데이터 모델/스키마 변경 · 트랜잭션·원자성 경계 · 외부 노출 인터페이스/API 계약 · 동시성·멱등성·순서 · 보안·권한 경계. 이 차원들이 곧 "코딩 전에 못 박아야 하는 비가역 결정"이므로 5줄 요약으로는 부족하다.
4. 결정된 레벨을 사용자에게 1줄로 알린다 — 예: `📐 Approach level: L2 (issuetype Story 폴백)` / 격상 시 사유 명시 `📐 L2 (Task지만 스키마 변경 → 격상)`.

사용자가 다음 턴에 자연어로 변경 요청 시("L1로 줄여줘") 그대로 따른다 — 별도 플래그 없음.

### Step 1: Cache-First Fetch

`.jira-context.json`의 `cachedIssue`를 먼저 확인 (CLAUDE.md "Cache-First Fetch" 참고).

- **hit 조건**: `key === <TASK-ID>` AND `summary`/`description`/`issuetype` 모두 존재 AND `fetchedAt` 존재. → fetch 생략.
- **miss**: `python3 "<scripts>/jira-cli.py" get <TASK-ID> --fields subtasks,issuelinks` (`skills/_shared/jira-cli.md`). L3는 child Story 시퀀싱이 필요하므로 `subtasks`/`issuelinks` 포함이 중요.
- 호출 후 `cachedIssue` 갱신. `fetchedAt`은 `new Date().toISOString()` (UTC `Z`).

### Step 2: Load Requirements Inputs

`docs/requirements/*.requirements.md`를 Glob으로 확인.

- 후보 파일 0건: 입력 hint 없음으로 진행.
- 후보 파일 1건: 자동 채택.
- 후보 파일 N건: cachedIssue.summary와 가장 가까운 slug를 선택. 모호하면 첫 번째 파일을 채택하고 사용자에게 알림.

채택한 파일에서 다음 섹션을 추출:
- `## Technical Approach Hint` (필수 입력 — 있으면 그대로 인용)
- `## Codebase Context` (참고)
- `## Functional Requirements` (참고)
- `## Open Questions` (남아 있는 P1/P2/[CONFLICT]가 있으면 approach 문서의 Open Items로 이월)

requirements 파일이 없으면 Step 3에서 `Source` 섹션을 `N/A — discover 생략`으로 표기.

### Step 3: Generate Approach Document

레벨별 출력 템플릿은 `Read skills/jira-task-approach/refs/level-templates.md` 후 해당 레벨 블록만 사용한다.

#### 3.0 L3 Empty-Child Guard

레벨이 **L3**일 때만 적용. Step 1에서 fetch/cache한 `cachedIssue`의 `subtasks` + `issuelinks`(`is blocked by` 역방향 포함)를 합쳐 child Story 후보 수를 센다. 0건이면 빈 시퀀싱 표만 만들어지므로 **여기서 조기 종료**한다.

- 사용자에게 안내 출력:

  ```
  ⚠️  L3 Epic의 child Story가 0건입니다.
  먼저 `/jira-task create` 또는 Jira에서 child issue를 분해 등록한 뒤 다시 실행하세요.
  ```

- 문서 생성/Jira 코멘트/첨부 모두 **건너뛴다**.
- `.jira-context.json`의 `completedSteps`에 `"approach"`를 **추가하지 않는다** (실행되지 않은 것으로 간주).
- 정상 종료(에러 아님). 후속 Step 3.1~5는 수행하지 않는다.

L1/L2 또는 child 1건 이상의 L3는 본 가드를 통과하여 3.1로 진입한다.

#### 3.1 디렉토리 + 베이스 템플릿 복사

```bash
mkdir -p docs/approach
perl -0777 -pe 's/<!--.*?-->//gs' templates/approach.template.md \
    > docs/approach/<TASK-ID>.approach.md
```

#### 3.2 레벨별 본문 채우기

`refs/level-templates.md`에서 결정된 레벨의 출력 형식만 복사하여 본문 영역을 채운다. 다른 레벨 블록은 사용하지 않는다.

- **L1 Single (5줄)**: 변경 영역, 핵심 결정, 검증, 리스크, 롤백 — 각 1줄.
- **L2 Story (한 페이지)**: Approach Summary, Architecture sketch, Implementation Plan(파일별), Key Decisions, Test Plan, Risks. 각 섹션 5-10줄 이내.
- **L3 Epic (시퀀싱만)**: child Story 목록 + 의존/순서/병렬 가능 여부. 상세 설계는 자식 Story가 담당하므로 본 문서에서는 다루지 않는다.
  - child Story 식별: cachedIssue의 `subtasks` + `issuelinks` (`is blocked by` 역방향 포함).

#### 3.3 공통 메타 채우기

문서 헤더의 placeholder 일괄 치환:
- `{task_id}` → 실제 TASK-ID
- `{summary}` → cachedIssue.summary
- `{level}` → `L1` | `L2` | `L3`
- `{level_name}` → `Single` | `Story` | `Epic`

### Step 4: Post Summary to Jira

`python3 "<scripts>/jira-cli.py" comment <TASK-ID> @<scratchpad md 파일>` (본문은 아래 markdown — `skills/_shared/jira-cli.md`):

```
## Approach Document Created

- **Level**: <L1/L2/L3> (<Single/Story/Epic>)
- **핵심**: <Approach Summary 1줄>

상세 내용은 첨부된 `<TASK-ID>.approach.md`를 참고하세요.
```

### Step 4.5: Attach Approach Document to Jira

공용 스크립트로 첨부 업로드:

```bash
SCRIPT_NAME="jira-attach.sh" OUT_VAR="JIRA_ATTACH_SH"
# Read skills/_shared/script-lookup.md and execute its lookup block here
[ -n "$JIRA_ATTACH_SH" ] && bash "$JIRA_ATTACH_SH" <TASK-ID> docs/approach/<TASK-ID>.approach.md
```

실패 시 로컬 파일 경로 안내 후 계속 진행.

### Step 5: Completion Summary

`skills/_shared/context-update.md` 패턴으로 worktree-local + aggregate `.jira-context.json`을 갱신 (approach는 Jira transition 없음 → `STATUS="-"`):

```bash
SCRIPT_NAME="jira-context-update.py" OUT_VAR="JIRA_CTX_UPDATE_PY"
# Read skills/_shared/script-lookup.md and execute its lookup block here
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> approach "-" \
    "<worktree>/.jira-context.json" \
    "<repoRoot>/.jira-context.json"
```

이후 출력:

```
---
✅ **Approach Complete** — <TASK-ID>

- 레벨: <L1/L2/L3>
- 산출물: `docs/approach/<TASK-ID>.approach.md`
- Jira 코멘트 게시됨
- Jira 첨부파일 업로드됨 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → **approach ✓** → impl → test → review → merge → pr → done

**Next**: `/jira-task impl <TASK-ID>` — approach 기반으로 구현을 시작합니다
---
```
