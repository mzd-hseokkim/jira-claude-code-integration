# jira-integration · Claude Code Plugin

[![Version](https://img.shields.io/badge/version-0.73.2-blue)](.claude-plugin/plugin.json)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin-8A2BE2)](#)
[![Jira](https://img.shields.io/badge/Jira-REST_CLI-orange)](scripts/jira-cli.py)

Jira 이슈 하나를 **등급 판정 → 명세·계획 → 승인 → 테스트 먼저 → 구현 → 검증 → PR**까지 Claude Code가 처리하고, 그 과정을 전부 Jira에 기록하는 플러그인입니다. Codex CLI에도 같은 플러그인을 설치해 단계별로 쓸 수 있습니다(v0.71.0). 흐름은 전사 표준 [AI-native SDLC 프로세스](https://github.com/mzd-hseokkim/mzd-software-development-standard/tree/main/00-ai-native-sdlc-process)(v0.9.0b)를 따릅니다. 에이전트는 사람이 승인해야 하는 지점에서 멈추고, 이슈 여러 건을 돌리면 사람은 마지막에 **할 일 리포트**만 보고 결정합니다.

> **English TL;DR** — A Claude Code plugin that drives a Jira issue through the company AI-native SDLC: level (L1/L2/L3) → spec/plan in `work/<KEY>/` → human approval on the PR (`APPROVE plan <sha>`, checked by script) → failing tests first → implementation in a separate session that cannot edit tests → per-acceptance-criterion verification in a fresh session → draft PR ready for the owner to request review. No local merges; merging is the code owner's. Queue issues with `/jira-task init`, run `/jira-task loop` in passes around human gates. The same plugin also installs into Codex CLI (step commands, plus auto via `scripts/auto-codex.js`; loop and the dashboard are Claude Code only). The rest of this document is in Korean.

> **기존 사용자(v0.69 이하)**: 단계 이름과 흐름이 바뀌었습니다. [v0.69 이하에서 올라올 때](#v069-이하에서-올라올-때)를 먼저 보세요.

---

## 목차

1. [5분 퀵스타트](#1-5분-퀵스타트)
2. [동작 원리 — 사람 게이트와 두 개의 루프](#2-동작-원리--사람-게이트와-두-개의-루프)
3. [Jira 연계 모델](#3-jira-연계-모델)
4. [운영 규칙 — 꼭 알아야 할 것](#4-운영-규칙--꼭-알아야-할-것)
5. [명령어 레퍼런스](#5-명령어-레퍼런스)
6. [설정 레퍼런스](#6-설정-레퍼런스)
7. [파일과 산출물](#7-파일과-산출물)
8. [대시보드](#8-대시보드)
9. [트러블슈팅](#9-트러블슈팅)
10. [설계 문서와 개발](#10-설계-문서와-개발)

---

## 1. 5분 퀵스타트

### 준비물

| 항목 | 용도 |
|---|---|
| Claude Code 또는 Codex CLI | 플러그인 실행 환경 (Codex는 [Codex에서 쓰기](#codex에서-쓰기) 참고) |
| Python 3.10+ | `jira-cli.py`(Jira REST, 표준 라이브러리만)와 공용 스크립트 실행 |
| Git + GitHub 원격 저장소 | 브랜치·worktree·PR. 에이전트 코드는 PR로만 들어갑니다 |
| `gh` CLI (로그인) | draft PR 생성, 승인 확인, PR 상태 조회 |
| Jira Cloud 계정 + [API 토큰](https://id.atlassian.com/manage-profile/security/api-tokens) | Jira 연동 |

프로젝트 `AGENTS.md`에 표준의 "## 승인자" 표(`| 역할 | 담당 |`, 담당 칸에 `@GitHub계정`)가 있으면 승인 확인이 그 계정을 기준으로 합니다. 없으면 PR 작성자·CODEOWNERS 계정을 인정하고 경고를 남깁니다.

### 설치

```bash
claude plugin marketplace add mzd-hseokkim/jira-claude-code-integration
claude plugin install jira-integration@jira-claude-code-integration
```

Codex에서 쓰려면 [Codex에서 쓰기](#codex에서-쓰기)를 보세요.

### Jira 연결

프로젝트 루트에서 Claude Code를 열고:

```
/jira setup
```

마법사가 Jira URL·이메일·API 토큰을 묻고 연결을 검증합니다. 자격증명은 **이 워크스페이스의 `.jira-context.json`**(`jira` 블록)에 저장되며 `.gitignore`에 자동 등록됩니다 — 다른 워크스페이스와 공유되지 않습니다. 이전에 MCP 서버(`mcp-atlassian`)로 쓰던 환경이면 기존 설정에서 자동으로 옮겨옵니다.

### 첫 실행 — 이슈 큐 돌리기

```
/jira-task init MAE-100        # 부모 이슈의 하위작업들을 큐로 잡고 worktree 생성
/jira-task loop                # 등급 확정 → PR 상태 반영 → L2·L3 명세·계획 → 구현·검증
```

`loop`가 끝나면 사람이 할 일이 네 칸으로 나옵니다:

```
🔁 Loop 완료 — prep → sync → plan → build
1. 등급 확정 대기
   MAE-104  결제 수단 추가 — /jira-task start MAE-104 또는 loop prep
2. plan 승인 대기
   MAE-102  https://github.com/…/pull/31 — 승인자 @lead: PR에 `APPROVE plan <SHA>`
3. draft 해제 대기 (리뷰 요청 준비됨)
   MAE-101  https://github.com/…/pull/30 — AC 4/4 충족. 확인 후 `gh pr ready 30`
4. 격리
   MAE-103  [gate-exhausted] AC-02 미충족 — 권장: verification.md 확인 후 수정
```

승인자가 PR에 승인 코멘트를 남기고 다시 `loop`를 돌리면 그 태스크가 구현으로 넘어갑니다. 리뷰 요청(draft 해제)과 머지는 사람이 하고, 머지된 PR은 다음 `loop`(sync)가 Jira를 완료로 옮깁니다.

이슈 하나만 처리하려면 그 이슈의 worktree에서 `/jira-task auto <KEY>`를 쓰고, 단계를 직접 밟고 싶으면 `start → approach → test-write → impl → verify`를 개별 명령으로 실행합니다.

---

## 2. 동작 원리 — 사람 게이트와 두 개의 루프

### 등급별 흐름

```
L1: start(등급 확정) → test-write* → impl → verify → [사람] draft 해제 → [코드 오너] 머지 → done
L2: start → approach(spec+plan) → [사람] plan 승인 → test-write → impl → verify → [사람] draft 해제 → [코드 오너] 머지 → done
L3: start → approach(intent) → [제품 책임자] → approach(spec) → [제품 책임자] → approach(plan) → [작업 담당자] → L2와 같음
* 동작이 바뀌지 않는 L1(오타·로그 한 줄)은 사유를 남기고 test-write 생략
```

| 단계 | 하는 일 | 세션 역할 |
|---|---|---|
| start | worktree, 담당자 지정, **등급 판정 → 사람 확정** (라벨 `sdlc-L1/L2/L3`) | — |
| approach | `work/<KEY>/`에 intent·spec·plan 작성 → 커밋 → draft PR → 승인 요청 → **정지** | — |
| test-write | plan 승인을 스크립트로 확인 → 수용 조건(AC)마다 테스트 → 올바른 이유로 실패하는지 확인 → 테스트만 커밋 | `test-writer` |
| impl | 테스트를 통과시키는 구현, 계획과 달라진 점 기록, 지속 지식을 공통 문서로 옮기기 | `implementer` (테스트 수정 불가) |
| verify | 새 컨텍스트에서 AC마다 충족/미충족/미확인 판정, 검사 명령 실행, `evidence/verification.md` | `verifier` (코드 수정 불가) |
| pr | PR 본문 재생성. 사람이 draft를 풀면 Jira "검토 중" | — |
| done | GitHub에서 머지를 확인한 뒤에만 Jira "완료" | — |

### 단계 루프 (`auto`)

한 태스크를 **다음 사람 게이트까지** 진행합니다. L2·L3는 승인 전이면 approach 뒤에서, 승인 뒤면 verify 통과("리뷰 요청 준비됨")에서 멈춥니다. 각 단계는 **새 sub-agent**로 실행되어 test-write·impl·verify가 서로 다른 컨텍스트에서 돕니다 (start: haiku / approach: opus / test-write·impl: sonnet / verify: opus, L1은 sonnet).

- **검증 판정**: 검증 세션은 "증거를 열어보기 전엔 전부 미충족"(Default-FAIL)으로 판정합니다. AC별 판정 수와 Critical 건수가 구조화된 값으로 나오고, 게이트는 이 값을 코드로 판정합니다. 통과 = 미충족 0, 검사 통과, Critical 0.
- **fix 루프**: 미통과면 구현 역할의 수정 agent가 lint·typecheck·이 작업의 테스트만 도는 싼 센서 루프(최대 5회)로 수렴시킨 뒤 delta 재검증을 1회 돌립니다. 바깥 루프 상한은 2회. 수정 agent도 테스트는 못 고칩니다 — 테스트가 틀렸다고 판단하면 멈추고 사람에게 넘깁니다(`test_dispute`).
- **중단 조건**: 미충족 AC가 2건 이상이면서 30%를 넘거나 Critical ≥ 3이면 "스코프 누락"으로 보고 fix 루프에 들어가지 않습니다.

제어 흐름 전체는 프롬프트가 아니라 **Workflow 스크립트**(`scripts/auto.workflow.js`)가 결정론적으로 실행합니다.

### 태스크 루프 (`loop`)

큐를 **사람 게이트 단위 패스**로 돕니다. 인자 없이 부르면 prep → sync → plan → build.

| 패스 | 대상 | 하는 일 |
|---|---|---|
| `prep` | 등급 없는 태스크 | 등급을 표로 제안하고 한 번에 확정 |
| `sync` | PR이 있는 태스크 | 머지됨 → done, 리뷰 요청됨 → 검토 중, stacked 브랜치 재정렬, base와 충돌하는 PR 격리 |
| `plan` | L2·L3 승인 전 | 산출물 작성 → 승인 대기 |
| `build` | L1 + 승인된 L2·L3 | test-write → impl → verify → 리뷰 요청 준비됨 |

- **독립 태스크**는 최신 `origin/<base>`에서 분기합니다. Jira `is blocked by`로 큐의 다른 태스크에 의존하면 **그 태스크만** 앞 브랜치 위에 stacked PR로 쌓고, 앞 PR이 머지되면 sync가 `rebase --onto`로 base를 옮깁니다(rebase merge 기준).
- **격리**: 어떤 태스크가 게이트에 걸리거나 단계가 실패해도 그 태스크만 보류하고 계속합니다. 서로 다른 태스크가 같은 단계에서 연속 2건 실패하거나 인증·base 손상 같은 인프라 신호가 보일 때만 전체를 멈춥니다.

### 사람의 자리

| 지점 | 누가 | 근거 |
|---|---|---|
| 이슈 작성 / 큐 구성 | 사람 | 무엇을 할지는 사람이 정함 |
| 등급 확정 | 작업 담당자 | SD-COM-GAT-001·002 |
| intent·spec(L3) 승인 | 제품 책임자 | 3장 승인 지점 |
| plan 승인 | 작업 담당자 (위험 신호가 있으면 기술 책임자) | GAT-003·005 |
| draft 해제(리뷰 요청) | 작업 담당자 | ROL-005 |
| 머지 | 코드 오너 | ROL-003, AUT-005 |
| 격리 태스크 처리 | 사람 | 자동으로 못 메우는 종류의 문제 |

**승인은 PR 코멘트 한 줄**로 남깁니다: `APPROVE plan 3f1b7d5` (L3는 `APPROVE intent …`, `APPROVE spec …`). `scripts/sdlc-gate.py`가 작성자 계정이 승인자인지, 그 SHA 시점의 산출물이 지금(HEAD)과 같은지를 확인합니다. rebase로 SHA가 바뀌어도 내용이 같으면 승인은 유지됩니다. 승인 뒤 산출물을 고치면 다시 승인받아야 합니다. 에이전트는 이 형식의 글을 쓸 수 없습니다(jira-cli·hook이 거부).

---

## 3. Jira 연계 모델

### 이슈 하나 = 브랜치 + worktree + 컨텍스트 파일 + PR

| Jira | 로컬 / GitHub |
|---|---|
| 이슈 키 `MAE-123` | 브랜치 `feature/MAE-123`, PR 제목 `MAE-123 …` |
| 라벨 `sdlc-L2` | context `level`, PR 본문 "등급" |
| | worktree `../<프로젝트>_worktree/MAE-123/` |
| | 그 안의 `.jira-context.json` (진행 단계·등급·역할·캐시) |
| | 산출물 `work/MAE-123/` (저장소가 원본, Jira 첨부는 사본) |

메인 레포의 `.jira-context.json`은 **큐 전체**(`tasks[]`)를 담는 aggregate이고, 각 worktree의 것은 그 태스크 하나의 상태입니다. 둘 다 gitignore 대상입니다.

이슈 타입별 처리 단위:
- **하위작업(Subtask) · 작업(Task) · 버그 · Story** → 1건 = 1 worktree = 1 PR. 등급(L1~L3)은 이 단위에만 붙습니다. `init <부모키>`는 부모의 미완료 하위작업을 전부 큐로 잡습니다.
- **Epic** → 등급을 붙이지 않고 직접 처리하지 않습니다. `approach`가 Epic에서 호출되면 자식 작업 순서만 보여 주고 끝납니다.

### 명령별 Jira 부수효과

코멘트 제목은 영어, 본문은 한국어입니다.

| 단계 | 상태 전이 | 라벨 | 코멘트 | 첨부 |
|---|---|---|---|---|
| `init` | — | — | Worktree Initialized | — |
| `start` | 할 일 → **진행 중** (+ 담당자를 나로) | `sdlc-Lx` | Start Work, SDLC Level (등급·위험 신호·확정자) | — |
| `approach` | — | — | Approval Requested (산출물·커밋·PR) | `<KEY>.spec.md`, `<KEY>.plan.md` (L3는 intent) |
| `test-write` | — | — | Plan Approved (승인자·SHA, 스크립트가 읽은 그대로), Tests Written | — |
| `impl` | — | — | Implementation Complete | — |
| `verify` | — | — | Verification (AC 판정 요약·검증 주체 서명) | `<KEY>.verification.md` |
| `pr` | 진행 중 → **검토 중** (사람이 draft를 푼 뒤) | — | Review Requested | — |
| `done` | 검토 중 → **완료** (머지 확인 뒤) | — | Task Completed (머지 커밋 SHA) | — |

같은 산출물을 다시 올리면 본인이 올린 같은 이름의 첨부를 교체합니다. 상태명은 Jira 프로젝트의 워크플로를 따르고, 전이 전에는 항상 가능한 전이 목록을 조회합니다.

**격리는 Jira를 건드리지 않습니다.** 격리는 로컬 워크플로 상태(`.jira-context.json`의 `deferred`)일 뿐입니다.

### 이슈를 만드는 길 / 가져오는 길

```
[만드는 길]  /jira-task epic set <EPIC>  →  /jira-task discover <주제>  →  /jira-task create --from-requirements <문서>
[가져오는 길]                                                              /jira-task init <부모키 | N | 자연어>
```

- `epic set`: 프로젝트에 Epic 스코프를 고정(`.jira-epic.json`). 이후 `create`가 만드는 이슈는 자동으로 그 Epic에 연결됩니다.
- `discover <주제>`: 코드베이스를 보고 질문하며 요구사항 문서(`docs/requirements/<주제>.requirements.md`)를 씁니다. 말미에 이슈 분해 형태(`single` 작업 1건 / `story` Story+하위작업 / `tree` Epic+Story+하위작업)를 제안합니다. 분해 형태는 작업 등급(L1~L3)과 별개입니다. Jira에는 아무것도 만들지 않습니다.
- `create`: 대화로 이슈를 만들거나, `--from-requirements`로 요구사항 문서의 분해안을 그대로 등록합니다. 등급은 정하지 않습니다(start에서 확정).
- `init`: 이미 있는 이슈를 가져옵니다. 부모 키를 주면 미완료 하위작업을 의존성(`is blocked by`) 분석 후 착수 가능한 것만 큐에 넣고, 숫자를 주면 나에게 할당된 고우선순위 N건을 잡습니다. worktree는 최신 `origin/<base>`에서 분기합니다.

### 여러 명이 나눠 쓸 때 — 설계자(A) / 구현자(B)

A가 `discover`·`create`로 요구사항과 티켓을 만들고 B가 `start`/`auto`로 구현하는 분업에서는, 티켓과 요구사항 문서가 **양방향으로 고정 연결**됩니다 (v0.64.0+).

| 방향 | 남는 곳 | 형태 |
|---|---|---|
| 티켓 → 문서 | `create --from-requirements`가 만든 모든 이슈의 description 마지막 줄 | `Requirements: docs/requirements/<주제>.requirements.md (Sub-task 2.1)` |
| 문서 → 티켓 | 요구사항 문서 `Proposed Issue Breakdown`의 각 노드 라인 끝 | `- Sub-task 2.1: … [MAE-14]` |

`approach`는 ① 프롬프트에 지정된 경로 → ② description의 `Requirements:` 줄 → ③ 문서 안의 `[<KEY>]` 역참조 → ④ 파일명 폴백 순으로 문서를 확정하고, 하위작업이면 자기 노드 범위만 읽습니다. 확정할 수 없으면 **추측하지 않고** 미결 질문으로 남깁니다. 요구사항 문서 내용은 spec에 복사하지 않고 링크합니다.

팀 규약으로 정해 둘 것:

- **A는 `create` 직후 요구사항 문서를 커밋·push합니다.** 문서가 B의 base 브랜치에 없으면 `approach`는 경고 후 문서 없이 진행합니다. `docs/requirements/`를 gitignore하고 있다면 해제하세요.
- description의 `Requirements:` 줄은 지우지 않습니다. 문서를 옮기면 이 줄도 고칩니다.
- `create`(대화형)로 만든 티켓이나 v0.64.0 이전 티켓에는 출처 줄이 없습니다 — 같은 형식으로 한 줄 추가하거나 `/jira-task approach <KEY> docs/requirements/<문서>`로 지정하세요.

### 현황 보기

- `/jira-task status` — 현재 디렉터리의 활성 태스크 + Jira 최신 상태
- `/jira-task report` — 나에게 할당된 이슈를 상태별로 분류한 리포트 (Scrum이면 활성 스프린트 기준)
- [대시보드](#8-대시보드) — 모든 worktree의 진행 단계·도구 호출·Jira 상태를 실시간 카드로

---

## 4. 운영 규칙 — 꼭 알아야 할 것

### worktree에서 실행한다

`start` 이후의 단계(`approach`/`test-write`/`impl`/`verify`/`auto`)는 **그 태스크의 worktree를 현재 디렉터리로** 실행합니다. `loop`는 태스크마다 worktree 진입·복귀를 알아서 처리하므로 메인 레포에서 실행하면 됩니다. `clean`/`done`은 메인 레포에서도 됩니다.

### 작업 등급 — L1 / L2 / L3

`start`가 표준의 판정 질문으로 등급을 제안하고 사람이 확정합니다. 애매하면 높은 등급으로 정합니다.

1. 제품 동작을 새로 정하거나 바꾸는가(새 기능, 요구사항 변경)? → **L3**
2. 위험 신호가 하나라도 있는가? → **L2** — ① DB 스키마·데이터 모델 ② 외부 API 계약 ③ 트랜잭션 경계·동시성·멱등성 ④ 인증·권한·개인정보 ⑤ ADR이 필요한 결정
3. 바뀌는 내용을 한 문장으로 설명할 수 있는가? → **L1**, 아니면 L2

| 등급 | 산출물 | 승인 |
|---|---|---|
| L1 | 없음 — PR 본문 "변경 내용"과 "검증" | 머지만 (코드 오너) |
| L2 | `spec.md` + `plan.md` + `evidence/verification.md` | plan(spec 포함) — 작업 담당자, 위험 신호가 있으면 기술 책임자 |
| L3 | L2 + `intent.md` | intent·spec — 제품 책임자, plan — L2와 같음 |

이슈 라벨에 `sdlc-Lx`가 이미 있으면 다시 묻지 않습니다. 작업 중 위험 신호를 새로 발견하면 멈추고 등급을 다시 확정합니다.

### 테스트 먼저, 세션 분리

- test-write가 실패 테스트를 **구현보다 먼저, 따로** 커밋합니다(`test(<KEY>): …`).
- impl 세션은 테스트 파일을 고칠 수 없고(`guard-test-files.js` hook), 억제 주석·분석 제외 설정도 넣지 않습니다.
- verify 세션은 새 컨텍스트에서 spec과 diff만 보고 판정하며 코드를 고치지 않습니다.
- 현재 역할은 worktree `.jira-context.json`의 `activeRole`로 표시되고 hook이 읽습니다. 표준 03의 `AGENT_ROLE` 환경변수가 있으면 그쪽이 우선합니다.

커밋 단위: `docs(<KEY>)` spec·plan → `test(<KEY>)` → `feat|fix(<KEY>)` → `docs(<KEY>)` 지속 지식 옮기기 → `docs(<KEY>)` verification. 각 단계는 자기가 만든 파일만 add합니다.

### 게이트

| 게이트 | 기준 |
|---|---|
| 구현 시작 (L2·L3) | `sdlc-gate.py check <KEY> plan` 통과 — 승인자 계정, 승인 SHA 시점과 HEAD의 산출물 동일 |
| 리뷰 요청 준비됨 | 미충족 AC 0, 검사 통과(또는 검사 없음), Critical 0. 미확인 AC는 사유와 함께 허용 |
| fix 루프 진입 | 미충족 AC가 1건이거나 30% 이하, 그리고 Critical < 3 (아니면 스코프 누락으로 즉시 중단) |
| fix 루프 상한 | 바깥 2회, 안쪽 센서 루프 5회 |
| done | PR이 GitHub에서 MERGED |

### 격리 종류와 대응

| `deferredKind` | 뜻 | 권장 조치 |
|---|---|---|
| `scope-shortfall` | 미충족 AC가 많음 | 계획 수정 후 재승인, 직접 보완 후 `verify`, 또는 미충족 범위를 새 이슈로 |
| `gate-exhausted` | fix 루프로 수렴 실패 | `work/<KEY>/evidence/verification.md` 확인 → worktree에서 수정 → `verify` |
| `stage-failed` | 어떤 단계가 실패 | 실패 단계부터 직접: `/jira-task <단계> <KEY>` |
| `test-dispute` | 구현 세션이 테스트가 틀렸다고 판단 | 테스트를 고칠지 결정 → `test-write` 또는 `impl` |
| `gate-error` | 승인 확인 스크립트 오류 | AGENTS.md 승인자 표, `gh` 로그인 확인 |
| `restack-conflict` | stacked 브랜치 재정렬 충돌 | worktree에서 rebase 충돌 해결 후 `loop` 재실행 |
| `base-conflict` | 먼저 머지된 PR과 충돌해 머지 불가 | "충돌 해결해줘" — base 위로 rebase, 테스트 충돌은 테스트 작성 역할·코드 충돌은 구현 역할로 풀고 재검증 |
| `predecessor-deferred` | 앞 태스크가 격리됨 | 앞 태스크부터 해결 |
| `pr-closed` | PR이 머지 없이 닫힘 | 이슈 정리 또는 새 PR |

### 중단 후 재개

모든 단계는 `.jira-context.json`의 `completedSteps`에 기록됩니다. `auto`나 `loop`를 다시 실행하면 끝난 단계는 건너뛰고, 승인 대기였던 태스크는 승인부터 다시 확인합니다.

### v0.69 이하에서 올라올 때

v0.70에서 흐름이 전사 표준에 맞게 바뀌었고, v0.71에서 Codex 지원이 들어왔습니다.

| 예전 | 지금 |
|---|---|
| 등급을 issuetype으로 추정 | `start`가 L1·L2·L3를 제안하고 사람이 확정, Jira 라벨 `sdlc-L1`~`L3`로 기록 |
| 산출물 `docs/approach/<KEY>.md` (gitignore) | `work/<KEY>/`(intent·spec·plan·evidence)를 커밋하고 Jira에도 첨부 |
| `auto`가 계획부터 구현까지 쉬지 않고 진행 | L2·L3는 `approach` 뒤 draft PR을 열고 멈춤. 승인자가 PR에 `APPROVE plan <SHA>`를 남겨야 구현으로 넘어감 |
| `impl` → `test` | `test-write`(실패 테스트를 먼저 커밋) → `impl`(테스트 수정 불가, hook이 막음) |
| `review` | `verify` — 새 세션이 수용 조건마다 충족·미충족을 판정하고 `evidence/verification.md`를 남김 |
| `merge`(로컬 병합) | 폐지. 에이전트 코드는 PR로만 들어가고, draft 해제와 머지는 사람이 함 |
| `pr`이 PR을 만듦 | PR은 approach(L2·L3)나 impl(L1)이 draft로 만들고, `pr`은 사람이 draft를 푼 뒤 본문과 Jira 상태(검토 중)를 맞춤 |
| `done`이 완료 처리 | GitHub에서 머지를 확인한 뒤에만 완료로 옮김 |
| `loop`가 큐를 순서대로 처리 | 사람 게이트 단위 패스(prep·sync·plan·build), 의존 이슈는 stacked PR, 끝에 사람 할 일 리포트 |
| Claude Code 전용 | Codex CLI에서도 단계 명령과 auto 사용 가능 ([Codex에서 쓰기](#codex에서-쓰기)) |

새로 필요한 것: `gh` CLI 로그인, 프로젝트 `AGENTS.md`의 "## 승인자" 표(없으면 PR 작성자·CODEOWNERS를 인정하고 경고).

v0.69 이하에서 시작한 태스크(`docs/approach/` 산출물)는 옮기지 않습니다. 구버전 흐름으로 끝내거나 `start`부터 다시 하세요.

---

## 5. 명령어 레퍼런스

`/jira-task <action> [인자]`. TASK-ID는 생략하면 브랜치명(`feature/<KEY>`) → 디렉터리명 → 컨텍스트 파일 순으로 자동 감지합니다.

**이슈 만들기**

| 명령 | 설명 |
|---|---|
| `epic set <키\|이름>` / `show` / `clear` | 프로젝트 Epic 스코프 고정·조회·해제 |
| `discover <주제> [--lite] [--from <파일>]` | 요구사항 문서 + 이슈 분해 형태 제안 |
| `create [힌트]` / `create --from-requirements <문서>` | 이슈 생성 (하위작업·Blocks 링크·Epic 연결 자동) |

**큐와 자동 실행**

| 명령 | 설명 |
|---|---|
| `init [N \| 부모키 \| 자연어]` | 태스크 조회 + worktree 일괄 생성 (큐 구성) |
| `loop [prep\|plan\|build\|sync]` | 사람 게이트 단위 패스, 끝에 사람 할 일 리포트 |
| `auto <KEY>` | 한 태스크를 다음 사람 게이트까지 (worktree에서) |

**개별 단계**

| 명령 | 설명 |
|---|---|
| `start <KEY>` | 브랜치/worktree, 등급 확정, 진행 중 전이 |
| `approach <KEY>` | L2·L3 산출물 작성 → draft PR → 승인 요청 (`plan`/`design`은 별칭) |
| `test-write <KEY>` | 승인 확인 → AC별 실패 테스트 먼저 커밋 |
| `impl <KEY>` | 구현 + 지속 지식 옮기기 + lint 1회 (L1은 여기서 draft PR) |
| `verify <KEY>` | 새 컨텍스트에서 AC별 검증 → verification.md (`review`는 별칭) |
| `pr <KEY>` | PR 본문 재생성, 리뷰 요청되면 검토 중 전이 |
| `done <KEY>` | PR 머지 확인 → 완료 전이 |

`test`·`merge`는 v0.70.0에서 폐지되었습니다(각각 test-write·verify, PR 머지로 대체).

**조회와 정리**

| 명령 | 설명 |
|---|---|
| `status` | 활성 태스크 + Jira 상태 |
| `report` | 할당 이슈 현황 리포트 |
| `clean [KEY ...] \| --all \| --list` | worktree·브랜치 정리 (메인 레포에서, dry-run 후 확인) |

**그 외**

| 명령 | 설명 |
|---|---|
| `/jira setup` | Jira 연결 마법사 |
| `/jira` | 연결 상태·도움말 |
| `/jira dashboard [start\|stop\|status\|setup]` (또는 `/dashboard`) | 대시보드 제어 |

---

## 6. 설정 레퍼런스

### Jira 자격증명 — 워크스페이스 단위

플러그인의 모든 Jira 호출은 `scripts/jira-cli.py`(REST, 표준 라이브러리만)가 합니다. 자격증명은 **메인 레포 `.jira-context.json`의 `jira` 블록** 한 곳이 정본이고, worktree에서도 이 파일을 찾아 읽으므로 복제본이 생기지 않습니다.

```bash
python3 <plugin>/scripts/jira-cli.py config set https://your-domain.atlassian.net you@company.com <api-token> PROJ
python3 <plugin>/scripts/jira-cli.py config show      # 토큰은 마스킹되어 표시
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `url` | ✓ | Jira Cloud URL (끝에 `/` 없이) |
| `username` | ✓ | Atlassian 계정 이메일 |
| `apiToken` | ✓ | API 토큰 — `.jira-context.json`은 gitignore 대상이며 `config set`이 미등록이면 등록합니다 |
| `project` | | 기본 프로젝트 키. 설정하면 모든 JQL에 `project = …`가 자동 삽입되고 `create`가 프로젝트를 묻지 않음 |

조회 순서는 `jira` 블록 → 환경변수(`JIRA_URL`/`JIRA_USERNAME`/`JIRA_API_TOKEN`) → 레거시 MCP 설정 파일입니다. 블록이 없을 때 뒤의 둘에서 찾으면 자동으로 블록에 옮겨 적습니다.

### Workflow 실행 디렉터리 (auto/loop 전제)

`auto`는 플러그인의 `scripts/auto.workflow.js`를 Workflow 도구로 실행합니다. Claude Code는 `scriptPath`로 **cwd 또는 추가된 워킹 디렉터리 안의 파일**만 허용하므로, 플러그인 설치 경로가 등록돼 있어야 합니다. `/jira setup`이 자동으로 등록하며, 수동으로는:

```bash
python3 <plugin>/scripts/ensure-workflow-dir.py    # ~/.claude/settings.json의 permissions.additionalDirectories에 1회 추가
```

버전 디렉터리의 부모(`…/cache/<marketplace>/jira-integration`)를 등록하므로 플러그인을 업데이트해도 다시 할 필요가 없습니다. 등록은 **새 세션부터** 적용됩니다 — 지금 세션에서 바로 쓰려면 `/add-dir <출력된 dir>`.

### Codex에서 쓰기

같은 플러그인을 Codex CLI에도 설치할 수 있습니다. 단계 명령과 auto는 쓸 수 있고, loop·대시보드는 Claude Code 전용입니다.

```bash
codex plugin marketplace add https://github.com/mzd-hseokkim/jira-claude-code-integration
codex plugin add jira-integration@jira-claude-code-integration
```

로컬 경로로 마켓플레이스를 추가하면 작업 트리를 통째로 복사하므로 gitignore된 `.jira-context.json`(API 토큰)까지 Codex 캐시에 들어갑니다. git 주소로 추가하세요.

**보호 hook 신뢰.** Codex는 플러그인 hook을 신뢰하기 전에는 실행하지 않습니다. 설치 후 Codex에서 `/hooks`를 열어 jira-integration의 hook을 trust합니다. 그 전에는 승인 토큰 차단, 구현 세션의 테스트 수정 차단, worktree 직접 삭제 차단이 모두 꺼진 상태입니다.

**권한.** 단계마다 git commit·worktree·push와 Jira·GitHub 호출을 합니다. Codex 기본 샌드박스(workspace-write)는 `.git` 쓰기를 막고(쓰기 경로에 추가해도 막힘), 레포 밖 형제 worktree 쓰기와 네트워크도 막습니다. 둘 중 하나로 씁니다.

- 대화형으로 실행하고, git·gh·worktree 명령의 권한 상승 요청을 그때그때 승인한다.
- `codex --sandbox danger-full-access`로 실행한다. 보호 hook은 샌드박스와 별개로 계속 동작합니다.

Windows에서 `[windows] sandbox = "elevated"`가 초기 설정에 실패하면(`setup refresh had errors`) 셸과 파일 쓰기가 모두 거부됩니다. 이때는 Codex를 대화형으로 한 번 실행해 설정을 마치거나 `"unelevated"`로 바꿉니다.

**사용.** 단계 스킬을 직접 부릅니다. 예: `$jira-task-start MAE-101`. TASK-ID를 빼면 브랜치(`feature/<KEY>`)에서 찾습니다. 표준의 세션 분리를 지키려면 **test-write, impl, verify는 각각 새 Codex 세션**에서 실행합니다. verify는 같은 세션에서 구현했으면 검증하지 않고 새 세션을 요구합니다.

**auto.** Codex에는 Workflow 도구가 없어서 auto는 터미널에서 runner로 돌립니다. Codex 세션 안에서 바로 돌리지 않는 이유는 태스크 하나가 10분 안팎 걸려 세션의 셸 명령으로 돌리기엔 길기 때문입니다. `$jira-task-auto`를 부르면 실행할 명령을 경로까지 채워 알려주고 멈춥니다.

1. Codex 세션에서 `$jira-task-start MAE-101`로 등급을 확정합니다(auto는 등급을 묻지 않습니다).
2. 일반 터미널에서 worktree로 가서 runner를 실행합니다. 플러그인 경로는 `~/.codex/plugins/cache/jira-claude-code-integration/jira-integration/<버전>`입니다.

```bash
cd ../<project>_worktree/MAE-101
node "<플러그인>/scripts/auto-codex.js" MAE-101 --bypass-hook-trust
```

3. 승인 대기(L2·L3)로 멈췄다면 승인자가 PR에 승인을 남긴 뒤 같은 명령을 다시 실행합니다. 끝난 단계는 건너뛰고 이어서 진행합니다. 중간에 실패했을 때도 원인을 고치고 다시 실행하면 됩니다.

Claude Code의 auto와 같은 스크립트(`auto.workflow.js`)로 같은 지점(승인 대기, 리뷰 요청 준비됨)에서 멈춥니다. 단계마다 새 `codex exec` 세션을 `danger-full-access`로 띄우고, Claude 모델 등급은 추론 강도로 옮깁니다(haiku→low, sonnet→medium, opus→high). 모델은 Codex 설정을 따르며 `--model <이름>`으로 바꿀 수 있습니다. 보호 hook을 trust하지 않았다면 `--bypass-hook-trust`를 붙여야 구현 단계의 테스트 수정 차단이 동작합니다(이 옵션은 활성화된 다른 hook도 함께 실행합니다). 단계별 Codex 로그는 시작할 때 출력되는 임시 디렉터리에 남습니다. 사용량은 본인 Codex 계정으로 잡히고, L1 한 건이 약 16만~18만 토큰입니다(mock 실측).

### headless 실행 (`claude -p`)

`auto`·`loop`를 `claude -p`로 돌릴 때는 `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`을 함께 설정합니다. `-p`는 턴이 끝난 뒤에도 백그라운드 작업을 기다리지만, Workflow처럼 셸이 아닌 작업은 마지막 턴 뒤 10분(기본 600000)이 지나면 멈춥니다. `auto`의 Workflow는 태스크 하나로도 10분을 넘기기 쉽고, 끊기면 그 단계의 context 기록이 남지 않습니다.

```bash
CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude -p "/jira-task loop"
```

0은 상한 없이 기다린다는 뜻입니다. 프로세스 환경변수로 줘야 합니다 — `settings.json`의 `env`로 넣으면 이 값은 적용되지 않습니다(실측).

### 보호 hook (기본 활성)

| hook | 막는 것 |
|---|---|
| `guard-approval.js` | `gh pr review --approve`, gh·curl·jira-cli로 `APPROVE <artifact> <sha>` 글 쓰기 |
| `guard-test-files.js` | `activeRole=implementer`의 테스트 파일 쓰기, `verifier`의 `work/<KEY>/evidence/` 밖 쓰기 |
| `guard-worktree-remove.js` | `git worktree remove` 직접 실행 (`clean-worktree.py`만 사용) |

에이전트가 같은 계정으로 GitHub API를 직접 부르는 경로까지 막지는 못합니다. 최종 강제는 CI와 리뷰 점검표입니다.

### MCP 서버 (선택)

대화 중 `mcp__atlassian__*` 도구로 ad-hoc 질의를 하고 싶을 때만 `/jira setup --mcp`로 등록합니다. 플러그인 워크플로에는 필요 없습니다.

### Phase Gate (선택, 기본 비활성)

단계 순서를 훅으로 강제하는 기능입니다 (예: test-write 없이 impl 금지). 기본은 꺼져 있습니다. 켜려면 `hooks/hooks.json`의 `PreToolUse`에 `hooks/scripts/phase-gate.js`를 등록합니다. L1은 차단 대신 경고만 합니다. 우회: `JIRA_PHASE_GATE_BYPASS=1`(1회) 또는 `.jira-context.json`의 `bypassGate: true`. 의존 그래프는 `hooks/scripts/phase-gate.config.json`.

---

## 7. 파일과 산출물

```
<프로젝트>/
├── AGENTS.md                   # 표준 절 (승인자 표, 검사 명령) — 프로젝트가 관리
├── .jira-context.json          # aggregate — 큐 전체 (gitignore)
├── .jira-epic.json             # Epic 스코프 (gitignore)
├── work/<KEY>/                 # 작업 산출물 (커밋 — 저장소가 원본)
│   ├── intent.md               # L3
│   ├── spec.md                 # L2·L3 — 수용 조건 AC-01…
│   ├── plan.md                 # L2·L3 — 바뀌는 파일, 작업 순서, 검증 방법, 결정 기록
│   └── evidence/verification.md
├── docs/
│   ├── requirements/<주제>.requirements.md   # discover 산출물
│   ├── policies/ glossary.md domain/ architecture/ decisions/   # 지속 지식 (impl이 옮김, 프로젝트가 도입한 경우)
│   ├── review-log/                           # 검증 판정 로그 (jsonl, 메인 레포 로컬 — gitignore)
│   └── run-log/                              # auto/loop 실행 로그 (jsonl, 메인 레포 로컬 — gitignore)
└── ../<프로젝트>_worktree/<KEY>/
    ├── .jira-context.json      # 태스크 하나의 상태 (gitignore)
    └── TASK-README.md          # 이슈 요약 (gitignore)
```

- 산출물 양식은 플러그인 `templates/sdlc/`의 표준 사본입니다. 프로젝트에 `.github/pull_request_template.md`가 있으면 PR 본문은 그것을 따릅니다.
- 머지된 `work/` 폴더는 고치지 않습니다. 이전 작업의 결정을 바꾸려면 새 작업으로 처리합니다.
- `review-log`와 `run-log`는 하니스 자체의 관측 데이터라 PR에 넣지 않고 메인 레포에만 쌓습니다(`init`이 `.gitignore`에 등록). 스키마는 각 디렉터리의 README 참고.

---

## 8. 대시보드

```
/jira dashboard          # 상태 확인 후 꺼져 있으면 설치+기동
```

`http://127.0.0.1:8765`에서 워크스페이스의 모든 worktree를 카드로 보여줍니다 — Jira 상태 배지, 진행 단계(stepper: start → approach → test-write → impl → verify → pr → done), 도구 호출 수, 마지막 프롬프트/응답, 진행 중 도구, blocked/stale 배지, 이슈 간 `blocks` 링크 그래프. 플러그인 훅이 보내는 이벤트를 SSE로 받아 실시간 갱신됩니다. stale 카드는 🗑 버튼으로 worktree·브랜치를 정리할 수 있습니다.

수동 실행: `npm install && npm run dashboard:build && npm run dashboard` (포트 변경 `PORT=9000`, 브라우저 자동 열기 억제 `DASHBOARD_NO_OPEN=1`). 로그는 `logs/dashboard-server.log`. localhost 전용이며 인증이 없습니다.

훅은 `/jira dashboard`로 띄운 서버(PID 파일 `~/.claude/jira-integration/dashboard.pid`)가 살아 있을 때만 이벤트를 보내고, 아니면 바로 종료합니다. 수동 실행 서버로 이벤트를 받으려면 `DASHBOARD_INGEST_URL=http://127.0.0.1:8765/ingest`를 설정하세요.

---

## 9. 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| `jira-cli: 자격증명을 찾지 못함` | `/jira setup` 또는 `jira-cli.py config set …`. 환경변수·레거시 MCP 설정이 있으면 자동으로 옮겨옵니다 |
| `401 Unauthorized` | 토큰 만료·오타. `/jira setup`으로 재등록 |
| approach가 "원격 저장소와 gh 로그인을 준비"하라며 멈춤 | 표준은 PR로만 반영합니다. `git remote add origin …`, `gh auth login` 후 재실행 |
| 승인했는데 test-write가 "승인 대기"로 멈춤 | `sdlc-gate.py check <KEY> plan` 출력의 `rejected` 사유 확인 — 승인자 표에 없는 계정, SHA 오타, 승인 뒤 spec·plan 수정(재승인 필요) |
| 에이전트가 "테스트 파일을 고치지 않는다"며 거부됨 | 구현 세션의 정상 동작. 테스트가 틀렸으면 사유를 남기고 `/jira-task test-write <KEY>` |
| auto 실행 시 `scriptPath must be a script path this tool returned…` | 플러그인 경로가 워킹 디렉터리에 없음. `python3 <plugin>/scripts/ensure-workflow-dir.py` 후 세션 재시작(또는 `/add-dir <출력된 dir>`) |
| auto가 "cwd 불일치"로 중단 | worktree가 아닌 곳에서 실행. 해당 worktree로 이동해 재실행 (`loop`는 자동 처리) |
| worktree에서 자격증명을 못 찾음 | 메인 레포 `.jira-context.json`에 `jira` 블록이 있는지 `config show`로 확인 |
| 이슈 생성 시 "유효한 이슈 유형" 오류 | 프로젝트가 로컬라이즈된 타입명을 씀 (예: 한국어 프로젝트는 `작업`). `create`는 프로젝트 메타를 조회해 맞추지만 직접 호출 시 주의 |
| `approach`가 요구사항 문서를 못 찾음 | 문서가 base 브랜치에 커밋되지 않았거나 description에 `Requirements:` 줄이 없음. [여러 명이 나눠 쓸 때](#여러-명이-나눠-쓸-때--설계자a--구현자b) 참고 |
| 플러그인 업데이트가 반영 안 됨 | `claude plugin marketplace update jira-claude-code-integration` → `claude plugin update jira-integration@jira-claude-code-integration` → 세션 재시작 |
| `loop`가 시작부터 전체 중단 | 시스템 실패 판정(인증/gh/base). 리포트의 판정 근거를 보고 원인 해결 후 재실행 |

---

## 10. 설계 문서와 개발

이 플러그인의 설계와 개선 이력은 `tasks/`에 있습니다:

- `tasks/sdlc-alignment-design.md` — 전사 SDLC 표준 정합(v0.70.0): 등급, 산출물, 승인 확인, 역할 분리, auto·loop 재설계
- `tasks/harness-adapter-design.md` — Codex 지원(v0.71.0): 원본 하나, harness 차이, 실측 결과
- `tasks/loop-engineering-roadmap.md` — 개선 로드맵 인덱스
- `tasks/auto-workflow-design.md` — auto의 Workflow 스크립트화
- `tasks/sensor-loop-design.md` — fix 루프의 센서 루프·delta 재검증
- `tasks/loop-quarantine-design.md` — loop 격리

플러그인을 수정할 때의 컨벤션은 `CLAUDE.md`를 참고하세요.

```bash
npm test                              # hook 테스트 (phase-gate, guard-approval, guard-test-files)
python -m unittest discover tests     # 스크립트 단위 테스트 (sdlc-gate, jira-cli, context-update …)
npm run test:dashboard                # 대시보드 테스트
claude --plugin-dir .                 # 로컬 개발용 로드
```

## License

MIT
