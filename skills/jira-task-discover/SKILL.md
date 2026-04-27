---
name: jira-task-discover
description: Discover requirements from a free-form natural-language topic. Searches the codebase, asks batched clarifying questions, then writes a structured requirements document with an issue-breakdown proposal. Use when user says "discover", "jira-task discover", "요구사항 분석", "디스커버리", "요구사항 문서", "주제 분석", or wants to turn a vague topic into a concrete requirements doc before creating Jira issues.
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

`jira-task-discover`는 모호한 자연어 주제를 입력받아, 코드베이스 탐색과 사용자 질문을 거쳐 명시적인 요구사항 분석 문서를 만든다. 이 스킬의 산출물은 다음 단계인 `jira-task-create`(MAE-116에서 `--from-requirements` 추가)의 입력이 된다.

**입력 (3종):**
- 위치 인자: 자연어 주제 (필수). 예: `"사용자 알림 시스템"`
- `--lite`: 질문을 3건으로 줄이고, 출력 문서를 한 페이지 분량으로 축약
- `--from <파일경로>`: 기존 요구사항 문서를 import해서 베이스로 사용

**출력 (1종):**
- `docs/requirements/<TOPIC-SLUG>.requirements.md` — 요구사항 분석 문서 (말미에 이슈 분해 제안 섹션 포함)

**비목표 (Non-goals):**
- Jira 이슈/코멘트/첨부 생성 안 함 (로컬 문서 단계로 한정)
- `.jira-context.json` 읽기/쓰기 안 함 (`completedSteps` 갱신은 MAE-118의 책임)
- 인덱스 파일(`docs/requirements/INDEX.md` 등) 자동 관리 안 함
- `templates/requirements.template.md` 생성 안 함 (MAE-117의 책임). 부재 시 인라인 fallback 사용

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

### Step 3: Batched Questions

`AskUserQuestion`을 **1회만** 호출해 다음 질문들을 한 묶음으로 배치한다.

**Default 모드 (4건):**

| # | 인덱스 | 카테고리 | 질문 |
|---|--------|---------|------|
| 1 | `Q1` | 이해관계자 | 이 기능의 주 사용자 또는 호출자는 누구입니까? |
| 2 | `Q2` | 성공 기준 | "끝났다"고 판단할 측정 가능한 기준은 무엇입니까? |
| 3 | `Q3` | 제약 | 반드시 지켜야 하는 기술/시간/비용 제약이 있습니까? |
| 4 | `Q4` | 비기능 요구사항 | 성능·보안·접근성·관측성 등에서 특별히 고려할 항목이 있습니까? |

**Q<N> 인덱스 부여 규칙:**
- 각 답변에는 위 표의 인덱스(`Q1`~`Q4`)를 그대로 부여한다. 이 인덱스는 Step 4 marker의 `source: Q<N>` 부분에 그대로 인용된다.
- `--lite` 모드: 4번(비기능 요구사항)이 생략되므로 인덱스는 `Q1`~`Q3`만 사용한다.
- `--from` 모드: 누락된 카테고리만 선별 질문하더라도 **원래 인덱스를 유지**한다 (예: NFR만 추가로 물으면 그 답변은 `Q4`. 1~3번이 import 본문에 이미 있으면 해당 답변은 `*(source: from)*` 또는 `*(source: from, Q<N>)*`).

**`--lite` 모드 (3건):** 위 표에서 4번(비기능 요구사항)을 제외하고 1~3번만 묻는다 (인덱스 `Q1`~`Q3`).

**`--from` 모드:** Step 2에서 import한 기존 문서를 분석해 누락된 카테고리만 선별 질문한다 (4건 중 일부만, 또는 전부 생략 가능). 인덱스 보존 규칙은 위 참조.

각 질문은 객관식 옵션 2-4개와 "Other → 자유 입력"을 함께 제공한다. 사용자가 모든 항목에 "Other → (빈)"으로 답하면 해당 항목은 문서에 `TBD`로 기록한다 (이때도 `Q<N>` 인덱스는 유지되어 Step 4 marker에 인용 가능).

### Step 3.5: Conflict Detection (--from mode only)

`--from` 모드에서 import 본문과 Step 3 답변 사이의 모순을 자동 감지하여 Open Questions 섹션에 `[CONFLICT]` 형식으로 격상한다. LLM이 둘 중 한쪽을 임의로 채택하지 않고 사용자 결정을 대기시키기 위함이며, 후속 `jira-task-create`로 잘못된 정보가 전달되는 것을 차단한다.

#### 진입 조건

| 조건 | Step 3.5 진입 |
|------|-------------|
| `--from` 모드 + import 파일 비어있지 않음 | **진입** (정상 케이스) |
| `--from` 모드 + import 파일이 빈 파일 (Step 0에서 default 모드로 fallback됨) | 통과 (Step 0에서 이미 `--from` 효과 무효화) |
| default 모드 (no `--from`) | 통과 (비교할 import 본문 없음) |
| `--lite` 모드 단독 (no `--from`) | 통과 (비교할 import 본문 없음) |
| `--lite + --from` 모드 | **진입** (Q4 비활성 → NFR 카테고리는 자동 제외, 나머지 3 카테고리만 비교) |

진입하지 않는 경우 본 단계는 통째로 건너뛰어진다 (no-op). 별도 안내 메시지 없음.

#### 비교 대상: 4 카테고리

| 카테고리 | 출처 | conflict 인정 케이스 |
|---------|------|--------------------|
| Stakeholders (Q1) | Step 3 답변 1번 | 사용자 그룹 명칭/범위가 명확히 다름 (예: "운영자" vs "일반 사용자") |
| Goals & Success Criteria (Q2) | Step 3 답변 2번 | 측정 기준이 상충 (예: "처리량 1k/s" vs "처리량 1만/s"; "응답 200ms" vs "응답 1s") |
| Constraints (Q3) | Step 3 답변 3번 | import에 없던 새 제약이 답변으로 등장; import의 기존 제약을 답변이 명시적으로 부정 |
| Non-functional Requirements (Q4) | Step 3 답변 4번 | 성능/보안/접근성/관측성 항목이 명시적으로 충돌 |

본 단계의 비교 대상은 위 4 카테고리에 한정한다. Step 4 합성 4종(FR/Edge Cases/Out of Scope/Open Questions)은 본 단계 비교 대상이 아니다 (그들은 Step 3.5보다 늦게 합성되며 별개 책임).

#### Prose 비교 휴리스틱

- **명시적으로 다른 결론일 때만** 격상한다. 키워드 또는 의미 단위로 비교 (의미 단위 비교는 LLM 추론에 의존).
- **단순 추가 정보(non-contradictory addition)는 conflict가 아니다.** import에 없던 새 정보가 답변에 추가되어도, 기존 정보를 부정하지 않으면 격상하지 않는다 (false positive 방지).
- **다국어 혼재(import 한국어 vs 답변 영어 또는 반대)**: LLM의 의미 단위 비교에 위임한다.
- **타이핑 실수에 의한 false positive**: 본 이슈 범위 밖. 사용자가 Step 4.5 confirm gate에서 수정 가능.
- **import 본문 자체가 내부 모순**: 본 이슈 범위 밖. import 자체의 품질은 가정한다.

#### 격상 형식 표준

```
- [CONFLICT] <카테고리>: import="<원본>" vs answer="<답변>" — 어느 쪽이 정확한지 결정 필요
```

원칙:
- `<카테고리>`: 4종 중 하나 (`Stakeholders` / `Goals` / `Constraints` / `NFR`). 풀네임 길면 약어 허용 (예: `NFR`, `Goals` 등)
- `<원본>` / `<답변>`: 한 줄 요약. 원문이 길면 의미가 통하는 짧은 인용. 인용부호 안에 줄바꿈/이탤릭/볼드 금지 (가독성)
- 마지막 한국어 문구("어느 쪽이 정확한지 결정 필요")는 고정 — 사용자 결정 대기임을 명시
- **민감 정보 redact**: `<원본>`/`<답변>` 인용에 자격증명·토큰·PII가 들어 있으면 가린다 (`***` 또는 한 줄 요약으로 대체).

예시:

```
- [CONFLICT] Stakeholders: import="운영자" vs answer="일반 사용자" — 어느 쪽이 정확한지 결정 필요
- [CONFLICT] Constraints: import="응답 시간 200ms 이내" vs answer="응답 시간 1초 이내" — 어느 쪽이 정확한지 결정 필요
```

한 카테고리에 conflict가 여러 개면 각각 별도 항목으로 격상한다 (멀티 conflict 허용, 같은 카테고리 묶기 없음).

#### Trace marker와의 상호 배타성

- `[CONFLICT]` 격상 항목은 Step 4의 trace marker(`*(source: Q<N>)*`, `*(synthesized)*` 등)를 **부착하지 않는다** — `[CONFLICT]` prefix 자체가 출처 표시 역할을 한다.
- import 본문에 이미 부착된 marker(`*(source: from)*` 등)는 비교 시 marker를 무시하고 본문만 비교한다. 격상 항목에 marker는 옮기지 않는다.

#### `--lite + --from` 정합성

`--lite` 모드는 Q4(NFR)을 비활성화하므로 `--lite + --from` 동시 사용 시 NFR 카테고리는 본 단계 비교 대상에서 자동 제외된다. 나머지 3 카테고리(Stakeholders/Goals/Constraints)는 정상 비교한다.

#### Step 4와의 협력

Step 3.5에서 격상된 `[CONFLICT]` 항목은 Step 4의 Open Questions 섹션에 자동 포함된다 (기존 TBD 항목과 함께 나열, 순서: TBD 항목 먼저 → conflict 항목 다음).

#### Step 4.5와의 협력

conflict가 1건 이상 감지되면 Step 4.5 Confirm Gate의 합성 결과 요약보다 **먼저** "Conflict Detection 결과" 섹션이 표시된다. 자세한 표시 규칙은 Step 4.5 본문 참조.

### Step 4: Generate Requirements Document

`docs/requirements/<slug>.requirements.md`를 생성한다.

**템플릿 선택:**
1. `templates/requirements.template.md`이 존재하면 그것을 베이스로 사용
2. 없으면 본 SKILL.md의 **Inline Fallback Template** 섹션 구조를 사용 (경고 출력 안 함)

**문서에 채워야 할 내용:**
- Topic, Slug, Mode (default/lite/from), Generated At
- Stakeholders (Step 3 답변 1번)
- Goals & Success Criteria (Step 3 답변 2번)
- Constraints (Step 3 답변 3번)
- Non-functional Requirements (Step 3 답변 4번, `--lite` 시 "N/A — lite mode")
- Codebase Context (Step 2 결과: 파일 경로 + 발췌 요약)
- Functional Requirements (Step 3 답변과 codebase 컨텍스트로부터 LLM이 합성)
- Edge Cases (`--lite` 시 생략)
- Out of Scope (`--lite` 시 생략)
- Open Questions (TBD로 표시된 항목 모음 + Step 3.5에서 격상된 `[CONFLICT]` 항목 자동 포함. 순서: TBD 항목 먼저 → conflict 항목 다음)

`--from <path>`가 지정된 경우: `<path>` 본문을 베이스로 위 섹션을 보강·재구성한다 (덮어쓰기 X, 보강 O).

**`--lite` 모드 분량 규칙:** 각 섹션 최대 5줄. "Edge Cases"·"Out of Scope" 섹션은 생략. 한 페이지 분량 유지.

#### Trace Marker 자동 부여 규칙

LLM 합성 항목의 출처를 사후 검증 가능하게 만들기 위해, **합성 4종 섹션**의 각 항목 끝에 출처 태그(trace marker)를 자동으로 부여한다.

**Marker 부여 대상 (합성 4종):**

| 대상 (marker 부여) | 비대상 (답변·메타 직접 매핑이라 marker 불요) |
|----|----|
| Functional Requirements | Stakeholders (= `Q1`) |
| Edge Cases | Goals & Success Criteria (= `Q2`) |
| Out of Scope | Constraints (= `Q3`) |
| Open Questions | Non-functional Requirements (= `Q4`) |
| | Codebase Context (Step 2 메타 자체) |

비대상 5종은 답변(`Q<N>`) 또는 Step 2 메타가 곧 출처이므로 marker 불요. 대상 4종(FR/Edge Cases/Out of Scope/Open Questions)에만 항목 단위 marker를 부여한다.

**Marker 형식 표준 (5 case + `--from` 변형):**

```
| 케이스 | Marker 형식 | 사용 시점 |
|--------|-------------|----------|
| 답변 1개에서 유래       | *(source: Q<N>)*                            | Q<N> 답변에서 직접 도출 |
| 답변 다수에서 유래       | *(source: Q1, Q3)*                          | 콤마 구분, 최대 3개. 4개 이상이면 가장 강한 1개만 |
| 코드 1곳에서 유래       | *(code: <path>:<line-range>)*               | Step 2 (file_path, line_range) 메타에서 직접 도출 |
| 코드 다수에서 유래       | *(code: src/a.ts:10-20, src/b.ts:5-15)*     | 콤마 구분, 최대 2개. 3개 이상이면 가장 대표적 1개만 |
| 답변 + 코드 결합        | *(source: Q<N>, code: <path>:<line>)*       | 답변과 코드 양쪽 모두에서 도출 |
| 둘 다 없음 (LLM 합성)  | *(synthesized)*                              | 답변·코드 어디에도 직접 근거가 없는 LLM 자체 합성 |
```

**`--from` 모드 변형 (1 case 추가):**

```
| 케이스 | Marker 형식 |
|--------|-------------|
| --from import 본문 그대로                        | *(source: from)*                          |
| --from import + 답변 보강                        | *(source: from, Q<N>)*                    |
| --from import + 코드 보강                        | *(source: from, code: <path>:<line>)*     |
| --from 본문 외 추가 합성 항목                    | default 모드 규칙 그대로 (Q<N> / code: / synthesized) |
```

**다중 출처 표기 원칙: 가독성보다 추적성 우선.** 단, marker가 본문보다 길어지면 가독성이 깨지므로 source 최대 3개·code 최대 2개 상한을 둔다. 초과 시 가장 강한/대표적 1개만 표기.

**`*(synthesized)*` 사용 가이드 (남용 방지):**

- **사용 가능 조건**: `Q<N>` 답변 어디에도 직접 근거가 없고, Step 2 코드 발췌(`(file_path, line_range)`) 어디에도 직접 근거가 없는 LLM 자체 합성 항목에만 사용한다.
- **권장 우선순위**: `Q<N>` 추적 > `code:` 추적 > 둘 다 결합 > `synthesized` (가능하면 `synthesized` 회피).
- **Open Questions 섹션 예외**: Open Questions는 본질이 "결정 보류"이므로 `*(source: Q<N>)*` (어느 답변이 부족했는지)가 자연스럽다. `*(synthesized)*` 사용은 지양한다.
- **Edge Cases 기본 marker**: Edge Cases는 거의 LLM 합성이라 `*(synthesized)*` 또는 `*(code: ...)*`가 일반적이다. 사용자 답변에서 직접 도출된 경우(예: "동시 호출 시 어떻게?"라는 답변)에 한해 `*(source: Q<N>)*`를 사용한다.

**`--lite` 모드 정합성:**

`--lite`는 Edge Cases/Out of Scope 섹션이 통째로 생략되므로 marker 적용 대상은 자연 축소되어 **Functional Requirements + Open Questions 2개 섹션**만 남는다. Q 인덱스 범위도 `Q1`~`Q3`로 축소된다 (`Q4` NFR 비활성화). 그 외 marker 형식·`synthesized` 가이드는 default와 동일하게 적용한다.

**파일 쓰기 시점 — 중요:** Step 4의 합성 산출물은 **메모리상 객체로만 보관**한다. 실제 `docs/requirements/<slug>.requirements.md` 파일 쓰기는 **Step 4.5 confirm 통과 후**로 지연한다. 이렇게 해야 "취소" 분기에서 cleanup 비용 없이 종료할 수 있다(임시 파일 누출 방지). 재합성 시에는 Step 2(코드베이스 컨텍스트)와 Step 3(질문 답변)의 결과를 캐시 키 `(slug, mode, fromPath, step3 answers hash)` 단위로 **재사용**하고 Step 4의 합성 부분만 다시 실행한다.

### Step 4.5: Synthesis Confirm

**모두(冒頭) — Conflict Detection 결과 표시:** Step 3.5에서 감지된 `[CONFLICT]` 항목이 1건 이상이면 합성 결과 요약보다 **먼저** "Conflict Detection 결과" 섹션을 표시한다. 표시 형식은 격상된 `[CONFLICT]` 항목들의 bullet 목록이며, 4건 이상 시 "상위 3개 + 외 N건" 형태로 축약한다 (요약 표시 규칙과 동일). 사용자는 이 섹션을 검토 후 `proceed`/`revise`/`cancel` 결정을 내린다. conflict 0건이면 본 섹션은 표시하지 않는다.

Step 4가 메모리상에 만든 합성 산출물(Functional Requirements / Edge Cases / Out of Scope / Open Questions)을 사용자에게 한 번 검증받는다. LLM hallucination·임의 분해 끊김·모순 입력으로 인한 품질 저하를 차단하기 위한 단일 confirm gate이다.

#### 요약 표시 규칙

- 각 confirm 대상 섹션은 **3줄 이내**로 요약 표시한다 (단순 입력에서 사용자 마찰 최소화).
- 항목이 4개 이상이면 **상위 3개 + "외 N건"** 형태로 축약한다.
- 표시 순서는 항상: Functional Requirements → Edge Cases → Out of Scope → Open Questions (해당 모드에서 생성된 섹션만).

#### 모드별 confirm 대상 매핑

| 모드 | confirm 대상 섹션 |
|------|------------------|
| default | Functional Requirements / Edge Cases / Out of Scope / Open Questions |
| `--lite` | Functional Requirements / Open Questions (Edge Cases·Out of Scope는 lite에서 생성하지 않으므로 자동 제외) |
| `--from` | default와 동일 — 단, "import 베이스 위에서 합성·보강된 부분"임을 안내 문구 1줄로 표기 (실제 마커 적용은 Trace Marker MAE-169로 위임) |

`--lite` 모드에서도 Functional Requirements와 Open Questions는 confirm 대상으로 유지한다 — hallucination 위험이 가장 큰 두 섹션이므로 lite gate 무의미화를 방지한다.

#### AskUserQuestion 호출 (의사코드)

```
AskUserQuestion(
  question: "합성 결과를 검토해주세요. 어떻게 할까요?",
  options: [
    { id: "proceed", label: "그대로 진행", default: true },
    { id: "revise",  label: "수정 요청" },
    { id: "cancel",  label: "취소" }
  ],
  context: "<요약 표시 규칙에 따른 섹션별 3줄 이내 요약>"
)
```

사용자에게 노출되는 라벨은 한국어("그대로 진행" / "수정 요청" / "취소")로 고정한다. 내부 식별자는 `proceed` / `revise` / `cancel`을 사용한다.

#### 분기 처리 절차

**proceed (그대로 진행)**
1. Step 4 산출물을 `docs/requirements/<slug>.requirements.md`에 파일로 쓴다 (이때까지 파일 시스템에는 어떤 부분 결과도 쓰지 않은 상태).
2. Step 5(Issue Breakdown Section) 진입.

**revise (수정 요청)**
1. 자유 입력 1줄을 수신한다: "어느 섹션의 어느 항목을 어떻게 수정할까요?"
2. 입력이 빈 문자열 또는 공백뿐이면 직전 합성 결과 그대로 confirm 단계로 복귀한다(재합성 X — Edge Case 회피).
3. 재합성 카운터(`resynthesisCount`)를 증가시킨다.
4. Step 2(코드베이스 컨텍스트)·Step 3(질문 답변) 캐시는 재사용하고, Step 4의 합성 부분만 사용자 수정 요청을 반영해 재실행한다.
5. 갱신된 합성 산출물로 Step 4.5를 다시 진입한다.
6. 재합성 결과가 직전 결과와 **완전히 동일**하면 사용자에게 "변경 없음" 안내를 1줄 표시하고 카운터는 계속 증가시킨다(무한 루프 회피).

**cancel (취소)**
1. 메모리상의 합성 산출물을 폐기한다(Garbage Collection 대상으로 두기만 하면 충분).
2. 파일 시스템에는 아직 쓰지 않은 상태이므로 별도 cleanup이 불필요하다.
3. 한국어 종료 메시지 1줄을 출력한다: "요구사항 문서 생성을 취소했습니다."
4. 비정상 종료 코드 없이 정상 종료한다.

#### 무한 루프 방지 가드

- 재합성 최대 횟수 `RESYNTHESIS_LIMIT = 3` (사용자 마찰 vs 정확도 균형값).
- `resynthesisCount`가 `RESYNTHESIS_LIMIT`에 도달하면, 다음 confirm에서는 `revise` 옵션을 **제거**하고 `proceed` / `cancel` 2분기로 축약한다.
- 사용자에게 "재합성 한도(3회)에 도달했습니다. 그대로 진행하거나 취소를 권장합니다." 안내를 1줄 출력한다.

#### 비대화형 환경 안전장치

본 스킬은 `user-invocable: false`로 항상 사용자 세션 내에서 호출되지만, 안전장치로 `AskUserQuestion` 응답이 부재한 경우 default `proceed`를 적용한다.

#### Functional Requirements 0건 경고

합성된 Functional Requirements가 0건이면(예: 모든 답변이 "Other → 빈" 극단 케이스), 요약 표시 위에 다음 경고 1줄을 추가한다:

> "⚠️ 합성된 항목이 없습니다. 그대로 진행하면 빈 문서가 생성됩니다."

이 경고는 `proceed`의 default를 변경하지 않는다(사용자 결정에 위임).

### Step 5: Issue Breakdown Section

**진입 조건:** Step 4.5 confirm을 통과(`proceed`)한 합성 결과를 입력으로 받아 본 단계를 실행한다. Step 4에서 생성한 문서의 **마지막 섹션**으로 다음 트리를 추가한다. **Jira 이슈를 만들지 않는다 — 문서에만 기록한다.**

```markdown
## Proposed Issue Breakdown

- **Epic**: <에픽 1줄 요약>
  - **Story 1**: <스토리 요약>
    - Sub-task 1.1: <서브태스크 요약>
    - Sub-task 1.2: <서브태스크 요약>
  - **Story 2**: <스토리 요약>
    - Sub-task 2.1: <서브태스크 요약>
```

규칙:
- 에픽 1개 + 스토리 N개 (보통 2-5) + 스토리당 서브태스크 1-5개
- 각 항목은 명사구 또는 동사구 한 줄 요약
- 우선순위·의존성 추정은 선택. 명시할 수 있으면 `(blocks: ...)` 등으로 표기
- 사용자가 다음 단계에서 `/jira-task create --from-requirements <경로>`로 이 트리를 그대로 Jira에 등록할 수 있도록 작성

### Step 6: Completion Summary

아래 형식으로 완료 요약을 출력한다 (다른 jira-task-* 스킬과 동일 패턴):

```
---
✅ **Discovery Complete** — <TOPIC>

- 요구사항 문서 생성: `docs/requirements/<slug>.requirements.md`
- 모드: default | lite | from | lite+from
- 코드베이스 컨텍스트: <발췌 파일 N개> (또는 "관련 영역 미발견")
- 이슈 분해 제안: 에픽 1 + 스토리 N + 서브태스크 M

**Progress**: **discover ✓** → create → init → start → plan → design → impl → test → review → merge → pr → done

**Next**: `/jira-task create --from-requirements docs/requirements/<slug>.requirements.md` — 이 분석서로 Jira 이슈를 등록합니다
---
```

`.jira-context.json`은 건드리지 않는다 (`completedSteps`에 `"discover"` 추가는 MAE-118의 책임).

## Inline Fallback Template

`templates/requirements.template.md`이 부재할 때 Step 4가 사용하는 마크다운 구조의 전문(全文)이다.

```markdown
# Requirements: <Topic>

- **Slug**: <slug>
- **Mode**: <default | lite | from | lite+from>
- **Generated At**: <ISO8601 timestamp>
- **Source**: jira-task-discover

## Stakeholders

<Step 3 답변 1번. 주 사용자/호출자/관계자>

## Goals & Success Criteria

<Step 3 답변 2번. 측정 가능한 완료 기준. 각 줄을 다음 형식으로:
`<지표명> · <현재값> → <목표값> · <측정방법>`>

- 응답 시간 · 800ms → 200ms · p95 latency 모니터링
- 합성 정확도 · 70% → 90% · 샘플 50건 manual review

## Constraints

<Step 3 답변 3번. 기술/시간/비용/규제 제약>

## Non-functional Requirements

<Step 3 답변 4번. --lite 모드면 "N/A — lite mode">

## Codebase Context

<Step 2 결과. 파일별 경로 + 30줄 이내 발췌 요약. 없으면 "관련 영역 미발견">

## Functional Requirements

<답변과 컨텍스트로부터 합성한 기능 요구사항. 번호 매김. 각 항목 끝에 trace marker 부착>

1. <Req-1> *(source: Q2, code: src/notify.ts:45-60)*
2. <Req-2> *(source: Q1)*
3. <Req-3> *(code: src/foo.ts:12-30)*
4. <Req-4> *(synthesized)*

## Edge Cases

<-- --lite 모드면 이 섹션 통째로 생략. 각 항목 끝에 trace marker 부착 -->

- <Edge case 1> *(synthesized)*
- <Edge case 2> *(code: src/notify.ts:80-95)*

## Out of Scope

<-- --lite 모드면 이 섹션 통째로 생략. 각 항목 끝에 trace marker 부착 -->

- <Item 1> *(source: Q3)*
- <Item 2> *(synthesized)*

## Open Questions

<TBD로 답변된 항목 또는 답변 부족으로 결정 보류된 항목. 각 항목 앞에 우선순위 마커 부착 (P1: 다음 단계 차단 / P2: 확인 필요 / P3: 참고). 어느 답변이 부족했는지 source: Q<N>로 표기. --from 모드에서 import 본문과 답변이 모순된 경우 [CONFLICT] prefix로 격상 (Step 3.5 참조). [CONFLICT] 항목은 우선순위 마커와 trace marker 모두 부착하지 않음.>

- [P1] <Q1> *(source: Q4)*
- [P2] <Q2> *(synthesized)*
- [P3] <Q3> *(source: Q2)*
- [CONFLICT] Stakeholders: import="운영자" vs answer="일반 사용자" — 어느 쪽이 정확한지 결정 필요

## Proposed Issue Breakdown

- **Epic**: <에픽 요약>
  - **Story 1**: <스토리 요약>
    - Sub-task 1.1: <서브태스크 요약>
    - Sub-task 1.2: <서브태스크 요약>
  - **Story 2**: <스토리 요약>
    - Sub-task 2.1: <서브태스크 요약>
```

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
| 템플릿 파일 부재 (`templates/requirements.template.md`) | Inline Fallback Template 사용. 경고 출력 안 함 (정상 흐름) |
| `--lite`와 `--from` 동시 사용 | 두 효과 모두 적용 (질문 3건 또는 그 이하 + import 베이스) |
| 슬러그에 위험 문자 (`/`, `..`, 공백, 한글) | kebab-case 강제. 영문/숫자/하이픈만 허용. 변환 실패 시 사용자 직접 입력 요청 |
| Step 4.5에서 재합성 한도(`RESYNTHESIS_LIMIT=3`) 초과 | `revise` 옵션 제거 후 `proceed`/`cancel` 2분기로 강제 confirm. 사용자에게 "재합성 한도(3회)에 도달했습니다. 그대로 진행하거나 취소를 권장합니다." 안내 |
| Step 4.5 `cancel` 선택 | 메모리상 합성 산출물 폐기. 파일 시스템에는 아직 쓰지 않은 상태이므로 cleanup 불필요. 한국어 종료 메시지 1줄("요구사항 문서 생성을 취소했습니다.") 출력 후 정상 종료 |

## Non-goals

- Jira 이슈 생성/코멘트/첨부 — `discover`는 로컬 문서 단계로 한정. 이슈 등록은 `jira-task-create`(MAE-116)의 책임
- `.jira-context.json` 읽기/쓰기 — 본 스킬은 Jira 컨텍스트에 의존하지 않으며 갱신도 하지 않음
- `completedSteps`에 `"discover"` 추가 — MAE-118에서 처리
- `commands/jira-task.md`의 `discover` 액션 라우팅 — MAE-119에서 처리. 본 스킬은 직접 Skill 도구 호출로도 동작
- `templates/requirements.template.md` 파일 생성 — MAE-117의 책임. 본 스킬은 부재 시 인라인 fallback으로 동작
- 인덱스 파일 자동 관리 (`docs/requirements/INDEX.md` 등)
- 외부 API/네트워크 호출 (LLM 추론 외)
