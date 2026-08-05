---
name: jira-task-discover
description: "Discover requirements from a free-form topic — searches codebase, asks clarifying questions, writes a structured requirements doc with issue-breakdown proposal. Triggers: discover, jira-task discover, requirements analysis; 요구사항 분석, 디스커버리, 요구사항 문서."
user-invocable: false
argument-hint: "<자연어 주제> [--lite] [--from <파일경로>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# jira-task-discover: Requirements Discovery from a Topic

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

`jira-task-discover`는 모호한 자연어 주제를 입력받아, 코드베이스 탐색과 사용자 질문을 거쳐 명시적인 요구사항 분석 문서를 만든다. 이 스킬의 산출물은 다음 단계인 `jira-task-create`(`--from-requirements`)의 입력이 된다.

**입력 (3종):**
- 위치 인자: 자연어 주제 (필수). 예: `"사용자 알림 시스템"`
- `--lite`: 질문을 3건으로 줄이고, 출력 문서를 한 페이지 분량으로 축약
- `--from <파일경로>`: 기존 요구사항 문서를 import해서 베이스로 사용

**출력 (1종):**
- `docs/requirements/<TOPIC-SLUG>.requirements.md` — 요구사항 분석 문서 (말미에 이슈 분해 제안 섹션 포함)

**비목표 (Non-goals):**
- Jira 이슈/코멘트/첨부 생성 안 함 (로컬 문서 단계로 한정)
- `.jira-context.json` 읽기/쓰기 안 함
- 인덱스 파일(`docs/requirements/INDEX.md` 등) 자동 관리 안 함
- `templates/requirements.template.md` 생성 안 함 (부재 시 에러로 종료)

## Input Model

```
$ARGUMENTS = <자연어 주제> [--lite] [--from <파일경로>]
```

**파싱 규칙:**
- 첫 번째 위치 인자(따옴표로 묶인 문자열 또는 플래그가 아닌 토큰의 연결)를 **자연어 주제**로 간주
- `--lite`: 인자 어디에 와도 됨. 값 없음 (boolean 플래그)
- `--from <파일경로>`: `--from` 다음 토큰을 파일경로로 사용. 절대/상대 경로 모두 허용
- 자연어 주제가 비어 있으면 Step 0에서 사용자에게 입력 요청
- `--lite`와 `--from`은 동시 사용 가능 (효과 합쳐짐: 질문 축소 + 기존 문서 import)

## Workflow

### Step 0: Parse Arguments

1. `$ARGUMENTS`를 토큰화한다.
2. `--lite` 토큰 존재 여부를 boolean `lite`에 저장.
3. `--from <path>` 패턴을 추출해 `fromPath`에 저장. `--from` 다음 토큰이 비었거나 다른 플래그면 에러.
4. 남은 토큰을 공백으로 합쳐 `topic`(자연어 주제)으로 사용.
5. `topic`이 비어 있으면:
   - `AskUserQuestion`으로 단답형 질문 1회: "어떤 주제로 요구사항을 만들까요? (한 문장으로 입력)"
   - 답변도 비어 있으면 종료 (에러 메시지 출력)
6. `fromPath`가 지정되었으면 파일 존재 검증:
   - 파일 부재: 에러 메시지 + 종료 (1회 안내, 자동 재시도 없음)
   - 파일이 1MB 초과: `AskUserQuestion`으로 진행 여부 confirm
   - 빈 파일: 경고 출력 후 default 모드로 fallback (자연어 주제만 사용)

### Step 1: Slug Generation & Confirm

1. `topic`을 영문 kebab-case 슬러그 1개로 변환한다.
   - 한글/비ASCII 주제: 의미를 영문으로 요약·번역 후 kebab-case화
   - 허용 문자: `[a-z0-9-]`만. 공백·특수문자·대문자는 제거 또는 변환
   - 길이 제한: 60자 이내로 절단
2. `docs/requirements/<slug>.requirements.md` 존재 여부 확인:
   - 존재하면 `<slug>-2`, `<slug>-3` ... 식으로 suffix 부여 (또는 사용자에게 overwrite 여부 confirm)
3. `AskUserQuestion`으로 슬러그 confirm 1회:
   - 옵션 A: "사용" (제안된 슬러그 그대로 진행)
   - 옵션 B: "수정" → 사용자가 직접 슬러그 입력 (단답형). 입력값도 `[a-z0-9-]`만 허용. 비어 있으면 옵션 A의 default를 강제 사용
4. 확정된 슬러그를 이후 Step에서 사용한다.

### Step 2: Codebase Context Collection

1. `topic`에서 키워드 3-5개를 추출한다.
   - 명사·기능 단어 우선. 한글 주제면 영문 대응어 포함
   - 예: "사용자 알림 시스템" → `["notification", "alert", "user", "push", "email"]`
2. 키워드별로 `Glob`/`Grep`을 사용해 관련 파일을 찾는다.
   - `Glob`: 파일명 매칭 (예: `**/*notification*`)
   - `Grep`: 본문 매칭 (대소문자 무시)
3. 결과를 합쳐 **상위 10개 파일**로 추리고, **파일당 최대 30줄**까지만 발췌한다.
4. **결과 메타 보존 형식**: 각 발췌는 `(file_path, line_range)` 튜플 형태로 보존한다. 이 메타는 Step 4 marker의 `code:` 부분에 그대로 인용된다.
   - line_range 표기: `<path>:<start>-<end>` (예: `src/notify.ts:45-60`). 단일 라인이면 `<path>:<line>` (예: `src/notify.ts:45`)
   - `Glob` 결과는 파일 단위이므로 line_range는 후속 `Grep` 매칭 줄 또는 발췌 범위를 사용
   - **민감 파일 제외**: `.env*`, `.claude/settings.local.json`, `node_modules/`, 자격증명·토큰을 포함한 파일은 발췌·메타에서 제외한다 (산출 문서가 Jira 첨부로 전송될 수 있음)
5. 결과가 0건이면 폴백: 레포 루트의 디렉터리 트리(depth 2)를 컨텍스트로 사용하고, 문서에 "관련 영역 자동 탐색 실패"로 기록.
6. `--from <path>`가 지정되었으면 해당 파일 내용을 함께 컨텍스트에 포함 (Step 4의 베이스 본문이 됨).

### Step 3: Iterative Interview

**필수**: `skills/jira-task-discover/refs/iterative-interview.md`를 Read하여 본문(R0 사전 공지 + 라운드 루프 + 종료 조건 + 커버리지 강제 라운드)을 그대로 수행한다.

요약:
- **R0 (사전 공지)**: 다룰 카테고리 1단락 출력 후 루프 진입. `--lite`는 NFR 카테고리를 안내에서 제외.
- **라운드 루프**: 매 라운드 `AskUserQuestion`으로 카테고리 1건에 대한 질문 1건. 답변은 `bucket[Q1..Q4]`에 누적. **인덱스 체계(Q1=이해관계자, Q2=성공 기준, Q3=제약, Q4=NFR)는 기존과 동일** — Step 4 trace marker 규칙 그대로 호환.
- **종료 조건**: `MIN_ROUNDS=4`, `MAX_ROUNDS=10`, `CONFIRM_AT=6` (6라운드 종료 시 계속 여부 confirm 1회). 커버리지 미충족 카테고리가 있으면 강제 1라운드 추가.
- **`--from` 모드**: import 본문에서 카테고리별 사전 채움 후 누락분만 추가 라운드. Step 3.5(`refs/conflict-detection.md`)와 협력은 기존 그대로.

`bucket` 객체가 Step 4로 전달된다. 사용자가 "Other → (빈)"으로 답한 항목은 `TBD`로 저장되어 Step 4 Open Questions로 격상된다.

### Step 3.5: Conflict Detection (--from mode only)

**필수**: `--from` 모드에서만 진입. `skills/jira-task-discover/refs/conflict-detection.md`를 Read하여 본문을 그대로 수행한다.

진입 조건: `--from` 플래그가 있고 import 파일이 비어있지 않으면 진입. 그 외 모든 모드는 통과(no-op).
격상 형식: `[CONFLICT] <카테고리>: import="<원본>" vs answer="<답변>" — 어느 쪽이 정확한지 결정 필요`
Step 4와의 협력: 격상된 `[CONFLICT]` 항목은 Step 4의 Open Questions에 자동 포함 (TBD 항목 뒤에 나열).

### Step 4: Generate Requirements Document

`docs/requirements/<slug>.requirements.md`를 생성한다.

**템플릿 선택:**
`templates/requirements.template.md`을 Read하여 베이스로 사용한다. 파일이 없으면 즉시 에러로 종료하고 "플러그인 자산 손상 — git restore templates/requirements.template.md"을 안내한다.

**문서에 채워야 할 내용:**
- Topic, Slug, Mode (default/lite/from), Generated At
- Stakeholders (Step 3 답변 1번)
- Goals & Success Criteria (Step 3 답변 2번)
- Constraints (Step 3 답변 3번을 **Technical / Schedule / Cost / Regulatory 4 sub-section**으로 분류. 답변에 명시되지 않은 카테고리는 `N/A — 해당 없음` 한 줄로 명시 — 누락 금지.)
- Non-functional Requirements (Step 3 답변 4번을 **6 카테고리 표**로 정리: 성능 / 가용성 / 보안 / 확장성 / 관측성 / 호환성. 각 항목은 값 또는 `N/A — <사유>`. `TBD`는 사용 금지 — 모르면 Open Questions로 격상. `--lite` 시 본 섹션 전체를 `N/A — lite mode` 한 줄로 대체.)
- Codebase Context (Step 2 결과: 파일 경로 + 발췌 요약)
- Functional Requirements (Step 3 답변과 codebase 컨텍스트로부터 LLM이 합성)
- **Goals ↔ FR 매핑** (Functional Requirements 합성 직후 도출. 표 형식 `| Goal | 만족하는 FR | 비고 |`. 모든 Goal에 최소 1개 FR 매핑이 원칙. 매핑되지 않는 Goal은 `[P1]`로 Open Questions에 격상. 매핑되지 않는 FR은 Out of Scope 후보 또는 Goal 누락 신호.)
- Edge Cases (`--lite` 시 생략)
- Out of Scope (`--lite` 시 생략)
- Open Questions (TBD로 표시된 항목 모음 + Step 3.5에서 격상된 `[CONFLICT]` 항목 + Goals↔FR 매핑 누락 항목 자동 포함. 순서: TBD 항목 먼저 → 매핑 누락 → conflict 항목)
- Technical Approach Hint (요구사항 문서 말미 섹션. plan/design 단계가 사라지고 approach로 통합됨에 따라 구현 방향의 1차 힌트를 여기에 둔다. Codebase Context · Functional Requirements · Constraints를 입력으로 LLM이 합성하며, 코드 스니펫 금지 — 의사결정/접근 옵션/주의사항 위주. `--lite` 시 3-5줄 요약. 자세한 작성 가이드는 템플릿 안내 주석 참조.)

`--from <path>`가 지정된 경우: `<path>` 본문을 베이스로 위 섹션을 보강·재구성한다 (덮어쓰기 X, 보강 O).

**`--lite` 모드 분량 규칙:** 각 섹션 최대 5줄. "Edge Cases"·"Out of Scope" 섹션은 생략. 한 페이지 분량 유지.

#### Trace Marker 자동 부여 규칙

**필수**: `skills/jira-task-discover/refs/trace-markers.md`를 Read하여 marker 형식·부여 대상·`synthesized` 가이드를 확인한다.

요약: 합성 4종(FR / Edge Cases / Out of Scope / Open Questions) 각 항목 끝에 출처 marker를 부여. 비대상(Stakeholders, Goals, Constraints, NFR, Codebase Context)에는 marker 불요.

**파일 쓰기 시점 — 중요:** Step 4의 합성 산출물은 **메모리상 객체로만 보관**한다. 실제 `docs/requirements/<slug>.requirements.md` 파일 쓰기는 **Step 4.5 confirm 통과 후**로 지연한다. 재합성 시 Step 2·Step 3 캐시는 재사용하고 Step 4 합성만 재실행한다.

### Step 4.5: Synthesis Confirm

**필수**: `skills/jira-task-discover/refs/synthesis-confirm.md`를 Read하여 본문을 그대로 수행한다.

Step 4 합성 산출물(FR / Edge Cases / Out of Scope / Open Questions)을 사용자에게 검증받는 단일 confirm gate이다.
분기: `proceed` → Step 5 진입 + 파일 쓰기. `revise` → 재합성(최대 3회). `cancel` → 메모리 폐기 후 정상 종료.

### Step 5: Issue Breakdown + Technical Approach Hint Section

**진입 조건:** Step 4.5 confirm을 통과(`proceed`)한 합성 결과 + 확정 분해 레벨을 입력으로 받아 본 단계를 실행한다. Step 4에서 생성한 문서의 **말미 두 섹션**(Proposed Issue Breakdown, Technical Approach Hint)을 채운다. **Jira 이슈를 만들지 않는다 — 문서에만 기록한다.**

**필수**: `skills/jira-task-discover/refs/breakdown-level.md`를 Read하여 3 레벨 정의·신호표·출력 템플릿을 확인한다. 본 SKILL.md에는 정의를 인라인하지 않는다.

분해 레벨은 3종 (L1 Single / L2 Story+Subtasks / L3 Epic+Stories+Subtasks). LLM이 합성 결과를 보고 1개를 추천하고, 그 추천은 **Step 4.5 synthesis-confirm gate에 함께 노출되어 사용자 검증을 받는다** (별도 confirm gate를 두지 않음 — 수렴 gate 통합).

#### Step 5 절차

1. `breakdown-level.md`의 **서브태스크 도출 순서**(파일군 나열 → 묶기 → 덩어리 1개=서브태스크 1개 → 경계 규칙 검산)를 먼저 수행한다. Step 2 Codebase Context가 이 단계의 입력이다. 그런 다음 Step 4.5에서 확정된 레벨의 출력 템플릿 1개를 골라 `Proposed Issue Breakdown` 섹션을 채운다 — 각 Sub-task의 `범위:` 줄은 필수다.
2. `Technical Approach Hint` 섹션을 채운다 — Codebase Context · Functional Requirements · Constraints를 입력으로 LLM이 합성. 코드 스니펫 금지. 항목: 핵심 구현 포인트 / 검토할 접근 옵션 / 주의 지점. `--lite`면 3-5줄 요약.
3. Step 6 Next 안내는 확정 레벨에 따라 권장 명령을 분기 출력한다 (L1: `/jira-task create <힌트>`, L2/L3: `/jira-task create --from-requirements ...`).

### Step 6: Completion Summary

아래 형식으로 완료 요약을 출력한다 (다른 jira-task-* 스킬과 동일 패턴):

```
---
✅ **Discovery Complete** — <TOPIC>

- 요구사항 문서 생성: `docs/requirements/<slug>.requirements.md`
- 모드: default | lite | from | lite+from
- 코드베이스 컨텍스트: <발췌 파일 N개> (또는 "관련 영역 미발견")
- 이슈 분해 제안: <L1: "단일 작업 1건" / L2: "스토리 1 + 서브태스크 N" / L3: "에픽 1 + 스토리 N + 서브태스크 M">

**Progress**: **discover ✓** → create → init → start → approach → impl → test → review → merge → pr → done

**Next** (Step 5에서 확정된 분해 레벨에 따라 1줄 출력):
- L1 Single: `/jira-task create <한 줄 힌트>` — 분석서를 참고로 Jira 작업 1건을 등록합니다 (import 파서가 Single을 아직 못 받음)
- L2 Story+Subtasks / L3 Epic+Stories+Subtasks: `/jira-task create --from-requirements docs/requirements/<slug>.requirements.md` — 이 분석서로 Jira 이슈를 일괄 등록합니다
---
```

`.jira-context.json`은 건드리지 않는다.

## Error Handling

| 시나리오 | 처리 전략 |
|---------|----------|
| 자연어 주제 누락 | Step 0에서 `AskUserQuestion`으로 입력 요청. 답변도 비면 종료 |
| `--from` 파일 부재 | 경로와 함께 에러 메시지 출력 후 종료 (자동 재시도 없음) |
| `--from` 파일이 비어 있음 | 경고 출력 후 default 모드로 진행 (자연어 주제 기반) |
| `--from` 파일이 1MB 초과 | `AskUserQuestion`으로 진행 여부 confirm |
| 슬러그 confirm 거부 | 사용자가 직접 입력 1회 허용. 그것도 비면 default 슬러그 강제 사용 |
| 슬러그 중복 (같은 파일 존재) | `<slug>-2`, `<slug>-3` 자동 부여 또는 overwrite 여부 confirm |
| 키워드 추출 결과 0개 | repo root의 디렉터리 트리(depth 2)로 폴백, 컨텍스트 섹션에 "관련 영역 자동 탐색 실패" 명시 |
| Glob/Grep 결과 0건 | 컨텍스트 섹션에 "관련 영역 미발견" 기록 후 진행 (블로킹하지 않음) |
| 사용자가 모든 답변에 "Other → (빈)" 응답 | 해당 항목을 문서에 `TBD`로 기록하고 진행 |
| 탐색 결과가 컨텍스트 폭주 | 파일 10개·파일당 30줄 상한 강제. 초과 시 절단 |
| 템플릿 파일 부재 (`templates/requirements.template.md`) | 즉시 에러로 종료. "플러그인 자산 손상 — git restore templates/requirements.template.md" 안내 |
| `--lite`와 `--from` 동시 사용 | 두 효과 모두 적용 (질문 3건 또는 그 이하 + import 베이스) |
| 슬러그에 위험 문자 (`/`, `..`, 공백, 한글) | kebab-case 강제. 영문/숫자/하이픈만 허용. 변환 실패 시 사용자 직접 입력 요청 |
| Step 4.5에서 재합성 한도(`RESYNTHESIS_LIMIT=3`) 초과 | `revise` 옵션 제거 후 `proceed`/`cancel` 2분기로 강제 confirm. 사용자에게 "재합성 한도(3회)에 도달했습니다. 그대로 진행하거나 취소를 권장합니다." 안내 |
| Step 4.5 `cancel` 선택 | 메모리상 합성 산출물 폐기. 파일 시스템에는 아직 쓰지 않은 상태이므로 cleanup 불필요. 한국어 종료 메시지 1줄("요구사항 문서 생성을 취소했습니다.") 출력 후 정상 종료 |

## Non-goals

- Jira 이슈 생성/코멘트/첨부 — `discover`는 로컬 문서 단계로 한정. 이슈 등록은 `jira-task-create`의 책임
- `.jira-context.json` 읽기/쓰기 — 본 스킬은 Jira 컨텍스트에 의존하지 않으며 갱신도 하지 않음
- `templates/requirements.template.md` 파일 생성 — 본 스킬은 템플릿을 소비만 함
- 인덱스 파일 자동 관리 (`docs/requirements/INDEX.md` 등)
- 외부 API/네트워크 호출 (LLM 추론 외)
