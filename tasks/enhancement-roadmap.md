# Enhancement Roadmap — v0.12.0 → 상용화

## 개요

외부 리뷰(v0.5.0 기준 분석을 v0.12.0에 맞춰 재정리)를 토대로, 이 플러그인을 **사내 공식 도구 후보**로 끌어올리기 위한 작업 계획.

**현재 상태 (v0.12.0)**

- 워크플로: `create → init → start → plan → design → impl → test → review → merge → pr → done`
- Hooks: `session-start`, `stop-sync` 두 개뿐
- Templates: `plan.template.md`, `report.template.md` 두 개뿐
- Reviewer: 단일 세션 내 fail→retry는 있으나 누적 calibration 없음
- 폐쇄망/Server-DC 미지원, CI 결과 fetch 없음

**상용화 관점에서의 핵심 갭** (우선순위 순)

1. 요구사항 수집/분석 단계 부재 — discovery → 요구사항 문서 → 이슈 분해의 pre-init 흐름이 없음
2. Phase gate 가드레일 없음 — design 없이 impl 가능, 단계 건너뛰기 가능
3. Reviewer calibration 없음 — 시간 갈수록 self-praise로 수렴 위험
4. Step별 template 미비 — design/test/review template 부재
5. CI/CD 사후 처리 없음 — PR 생성에서 끝남
6. Multi-worktree cross-check 수동
7. 폐쇄망/Server-DC 미지원

---

## Phase 1 — 상용화 가드레일 (우선)

상용 도입 시 가장 먼저 묻히는 부분. 코드 변경량은 적지만 효과가 큼.

### Task 1.1: 요구사항 수집/분석 단계 도입

**배경**
현재 `create`는 "Jira 이슈를 자연어로 등록"까지만 한다. 그 앞에 있어야 할 **discovery → 요구사항 문서 → 이슈 분해** 흐름이 없다. 회사가 PO/PM 분리 모델이 아니라 AI-Native SDLC를 처음부터 끝까지 가져가려면 이 단계가 가장 강력하게 보완되어야 한다.

**산출물**

- 신규 스킬: `jira-task-discover` (또는 `jira-task-requirements`)
- 신규 액션: `/jira-task discover [자연어 주제]`
- 산출 문서: `docs/requirements/<TOPIC-SLUG>.requirements.md`
- 후속 연결: discover 결과를 `jira-task-create`로 자동 전달해 에픽/스토리/서브태스크 일괄 등록

**확정된 워크플로** (2026-04-26 결정, MAE-42 ADR 참조)

```
discover (신규) → create → init → start → plan → design → impl → test → review → merge → pr → done
```

`discover`는 `create` 앞에 별도 단계로 배치한다 (옵션 A 채택).

**하위 작업**

1. **워크플로 위치 결정** ✅ — 결정 완료 (MAE-42, ADR로 기록). 옵션 A 채택.
2. **`jira-task-discover` 스킬 작성**
   - 입력: 자연어 주제 (예: "결제 모듈 리뉴얼", "사내 SSO 도입")
   - 단계:
     1. 컨텍스트 수집 — 현재 코드베이스의 관련 영역 자동 탐색 (Glob/Grep)
     2. 질문 배치(batched questions) — 모호한 부분을 한 번에 묶어 사용자에게 질문 (이해관계자, 성공 기준, 제약, 비기능 요구사항 등)
     3. 요구사항 문서 생성 — `docs/requirements/<TOPIC-SLUG>.requirements.md`
     4. 이슈 분해 제안 — 에픽 1 + 스토리 N + 서브태스크 M 구조 제안 (확정은 다음 단계)
3. **`jira-task-create`와의 연결**
   - `discover` 완료 후 `Next: /jira-task create --from-requirements <TOPIC-SLUG>` 안내
   - `create`가 요구사항 문서를 읽어 이슈 일괄 생성하도록 분기 추가
4. **Template 생성 필요** — `templates/requirements.template.md` (계획만, 본 작업에서 구현 안 함)
5. **`completedSteps` 확장** — 유효 단계에 `"discover"` 추가
6. **`commands/jira-task.md` 라우팅 추가** — `discover` 액션 분기
7. **CLAUDE.md 업데이트** — PDCA 문서 목록에 requirements 추가, 워크플로 그래프 갱신
8. **README 워크플로 다이어그램 갱신**

**고려사항**

- 요구사항 문서가 너무 무거우면 작은 티켓에서 오버킬. `--lite` 모드(질문 3개 이하, 한 페이지 문서)로 가벼운 경로도 제공 검토.
- 이미 PO/PM이 작성한 요구사항이 있는 경우 `discover --from <파일경로>` 로 import 가능하게.
- 기존 `init`/`create` 흐름과의 충돌 없음을 확인.

---

### Task 1.2: Phase gate hooks

**배경**
현재 `hooks/`에는 `session-start.js`, `stop-sync.js` 둘뿐이다. "design 없이 impl 진입", "test 통과 없이 PR 생성", "미승인 phase 건너뛰기" 같은 violation을 코드 레벨에서 막는 가드가 없다. 회사 공식 도구로 쓰려면 필수.

**산출물**

- 신규 hook: `PreToolUse` 기반 phase gate
- 신규 스크립트: `hooks/scripts/phase-gate.js`
- `hooks/hooks.json`에 등록

**하위 작업**

1. **Phase 의존 그래프 정의**
   - `start` 선행: 없음 (init 이후 어느 시점이든)
   - `plan` 선행: `start`
   - `design` 선행: `plan`
   - `impl` 선행: `design` (문서 존재 + completedSteps 포함)
   - `test` 선행: `impl`
   - `review` 선행: `test`
   - `merge` 선행: `review` 통과
   - `pr` 선행: `merge`
   - `done` 선행: `pr`
   - 의존 그래프를 `hooks/scripts/phase-gate.config.json`에 외부화 (회사별/프로젝트별 커스터마이즈 여지)
2. **`phase-gate.js` 작성**
   - PreToolUse hook으로 `Skill` 도구 호출을 인터셉트
   - 호출되는 스킬 이름이 `jira-task-*` 패턴이면 phase 추출
   - `.jira-context.json`의 `completedSteps`와 의존 그래프 비교
   - 위반 시: 차단 + 명확한 안내 메시지 ("design 단계가 필요합니다. /jira-task design <ID>를 먼저 실행하세요")
3. **Bypass 메커니즘**
   - 명시적 우회 플래그 (예: 환경변수 `JIRA_PHASE_GATE_BYPASS=1`) — 디버깅용
   - 또는 `.jira-context.json`에 `bypassGate: true` 필드 — 영속적 우회
   - 우회 시 콘솔에 경고 출력
4. **테스트 시나리오**
   - design 없이 impl 호출 → 차단되어야 함
   - 정상 순서 호출 → 통과해야 함
   - bypass 플래그 → 통과 + 경고
   - context 파일 없음 → 안내 후 통과 (첫 진입 보호)
5. **`hooks/hooks.json` 업데이트** — PreToolUse 등록
6. **문서화** — README에 "Phase Gate" 섹션, bypass 방법 명시

**고려사항**

- Phase gate가 너무 빡빡하면 사용자 경험 악화. **차단보다는 강한 경고 + 확인 프롬프트** 방식도 검토 (단, hook은 stdin으로 사용자 입력 못 받음 → 차단/통과만 가능).
- Multi-worktree 환경에서 worktree마다 다른 `.jira-context.json`을 봐야 함. cwd 기반 탐색.

---

### Task 1.3: Step별 Template 정비

**배경**
`templates/`에 `plan.template.md`, `report.template.md`만 있다. `design`, `test-report`, `review-report`, `requirements` (Task 1.1), `pr-description` template이 없다. "문서 형식이 모두 opinionated"가 되려면 step별 template이 강제 형식으로 박혀 있어야 하고, 각 step이 그 template을 채우는 contract로 동작해야 한다.

**⚠️ 본 작업은 계획만. 실제 template 작성은 별도 Task로 분리.**

**하위 작업 (계획 수준)**

1. **각 단계별 template 생성해야 함** — 대상:
   - `requirements.template.md` (Task 1.1과 연동)
   - `design.template.md`
   - `test-report.template.md`
   - `review-report.template.md`
   - `pr-description.template.md`
2. **티켓 유형(Story/Bug/Task)별 가변 섹션 정책 결정** — UIX/데이터/SW/HW 4분할은 유형에 따라 적용 (Bug에는 UIX 섹션이 보통 불필요)
3. **각 스킬이 template을 직접 참조하도록 수정** — 현재는 SKILL.md 인라인에 섹션 정의가 들어 있음. template으로 외부화
4. **Template 변경 시 스킬과의 일관성 검증 방법** — CI 단계에 lint 추가 검토

---

### Task 1.4: Reviewer Calibration Log (1단계 — 누적만)

**배경**
`auto` 모드의 fail→retry는 단일 세션 루프일 뿐, 누적 학습이 없다. 시간이 갈수록 reviewer 품질이 평탄해지면서 self-praise로 수렴할 위험이 있다 (Anthropic harness paper 핵심 메시지).

**본 Task에서는 "log를 쌓는 것"까지만 한다. prompt 자동 calibration은 Phase 3.**

**산출물**

- 신규 디렉토리: `docs/review-log/`
- 파일 형식: `docs/review-log/<TASK-ID>.review.json` (per-task) + `docs/review-log/_index.jsonl` (전체 누적)

**하위 작업**

1. **로그 스키마 정의**
   - 필드: `taskId`, `timestamp`, `reviewerVersion` (해당 시점 SKILL.md 해시), `findings` (배열), `severity`, `falsePositive` (사용자가 사후 표시 가능), `userOverride` (리뷰어 결론을 사용자가 뒤집은 경우)
2. **`jira-task-review` 스킬 수정**
   - review 종료 시점에 결과를 `docs/review-log/<TASK-ID>.review.json`에 append
   - `_index.jsonl`에도 한 줄 추가 (기간별 분석 용이)
3. **사용자 피드백 채널**
   - 사용자가 "이 finding은 false positive였다"를 표시할 수 있는 경량 명령 — `/jira-task review-feedback <TASK-ID>` (CLI 인터랙션)
   - 또는 review-log JSON 파일을 사용자가 직접 편집 (간단한 경로)
4. **로그 분석 스크립트** — `scripts/analyze-review-log.py`
   - 누적 finding 빈도, false positive 비율, severity 분포 출력
   - calibration 시점에 reviewer prompt 업데이트 근거로 사용 (Phase 3에서 활용)
5. **gitignore 정책 결정** — review-log는 commit할지, 로컬에만 둘지
   - 권장: commit (팀 단위 학습 자산), 단 사용자 식별 정보 없을 때만

**고려사항**

- 로그 양 폭증 방지 — 90일 이상 된 로그는 압축/아카이브.
- 민감 정보 (코드 스니펫에 비밀번호 등) 자동 마스킹 검토.

---

## Phase 2 — Workflow 깊이

기능적 차별화. Phase 1 끝난 후 착수.

### Task 2.1: Test Scaffold 자동 생성 (RED→GREEN)

**배경**
현재 `design` 단계에서 "테스트 케이스 명세"는 강제하고 있으나, 실제 failing test 파일은 `impl` 단계에서 만들어진다. generator가 자기 코드 통과시키려고 테스트를 약하게 짤 가능성이 있다. design 단계에서 failing test를 먼저 scaffold하면 impl이 spec을 맞추는 순서가 된다.

**하위 작업**

1. **`jira-task-design` 스킬 확장**
   - design 문서의 Test Plan 섹션을 파싱해 실제 테스트 파일 생성 (initially failing)
   - 프레임워크 자동 감지 — Playwright(E2E), Jest/Vitest(unit), pytest 등
   - 생성 위치는 프로젝트 컨벤션 따름 (Glob으로 기존 테스트 위치 탐색)
2. **`impl` 단계 동작 변경**
   - "design에서 만든 failing test가 GREEN이 되면 완료"가 명시적 종료 조건
   - 테스트 통과 전에 `completedSteps`에 `impl` 추가 금지
3. **fallback** — 테스트 프레임워크 미감지 시 명세 문서만 만들고 사용자에게 안내

---

### Task 2.2: Multi-Worktree Cross-Check 자동화

**배경**
README에 "design time에 file overlap 체크"라고 적혀 있으나 실제 design SKILL에는 cross-worktree 자동 검사 로직이 없다. 사용자가 직접 `git diff --name-only`를 돌려야 한다.

**하위 작업**

1. **Active worktree 탐색 로직** — `git worktree list --porcelain` 파싱
2. **각 worktree의 변경 파일 set 수집** — `git diff --name-only main...HEAD` per worktree
3. **Cross-check 알고리즘** — 현재 task의 design 문서가 다룰 예정인 파일 (Implementation Plan 섹션) vs 다른 worktree의 변경 파일 set 교집합
4. **충돌 발견 시 design 문서에 "Conflict Risk" 섹션 자동 추가** — 어느 worktree의 어느 파일과 겹치는지, 협의 필요 표시
5. **`jira-task-design` 스킬에 통합**

---

### Task 2.3: CI 결과 Fetch + 1차 Self-Heal

**배경**
현재 `pr` 이후 끝. CI fail이어도 플러그인은 모름. 풀 라이프사이클을 표방하려면 최소한 "PR 후 CI 결과 polling → fail이면 1회 자동 수정 시도" 정도는 필요.

**하위 작업**

1. **GitHub Actions API 통합** — `gh run list --branch feature/<TASK-ID>`, `gh run view <id>`
2. **신규 액션 `/jira-task verify <TASK-ID>`** — PR의 CI 상태 확인
3. **자동 호출 시점** — `pr` 완료 후 짧은 polling 모드 (옵션, 기본 off — 사용자가 의도해야 작동)
4. **Fail 시 self-heal 시도**
   - 로그 파싱 → 실패 원인 추정
   - design 문서와 비교해 1차 수정 시도
   - 수정 후 push → 재 polling
   - 2회 실패 시 사용자에게 에스컬레이션
5. **타사 CI 시스템 추상화** — GitHub Actions 외 GitLab CI, Jenkins 어댑터 인터페이스 정의 (구현은 GitHub만 우선)

---

## Phase 3 — 차별화 / 장기

### Task 3.1: Reviewer Prompt Auto-Calibration

Task 1.4에서 쌓은 review-log를 분석해 reviewer SKILL.md를 주기적으로 업데이트.

**하위 작업**

1. **분석 주기 결정** — 명시적 명령(`/jira-task calibrate-reviewer`) 또는 로그 N건 누적 시 자동 트리거
2. **분석 로직** — false positive가 잦은 finding 패턴, 사용자가 자주 뒤집은 결론
3. **Reviewer SKILL.md 자동 패치 제안** — diff 형태로 사용자에게 제시, 승인 시 적용
4. **버전 관리** — calibration 이력을 `docs/review-log/_calibration-history.md`에 기록

---

### Task 3.2: Discovery 모드 강화

Task 1.1의 `discover` 단계 고도화.

**하위 작업**

1. **이해관계자 인터뷰 시뮬레이션** — 페르소나별 질문 (개발자/운영/보안/사용자)
2. **유사 과거 요구사항 검색** — `docs/requirements/` 누적분에서 유사 케이스 탐색
3. **NFR(비기능 요구사항) 체크리스트 자동 적용**

---

### Task 3.3: 폐쇄망 / Server-DC / 사내 Git 지원

**하위 작업**

1. **Jira Server/DC PAT 인증 분기** — `setup` wizard에 Cloud/Server 선택
2. **사내 Git 호스팅 어댑터** — GitLab, Gitea, Bitbucket Server (PR 생성/CI 연동)
3. **인터넷 격리 환경에서의 의존성** — uvx 대신 사내 PyPI 미러 가이드
4. **문서** — 폐쇄망 셋업 가이드 (`docs/setup-airgapped.md`)

---

## 비코드 작업

### Task X.1: README 비교표 갱신 / 포지셔닝

**하위 작업**

1. **경쟁자 추가** — cc-sdd, claude-code-harness, sdlc-studio, Vantor 등
2. **2축 비교표** — Jira integration 깊이 / 풀 라이프사이클 깊이
3. **자기 포지션 명시** — "Jira-native full-cycle harness"

---

## 작업 순서 요약

```
Phase 1 (상용화 가드레일)
  1.1 요구사항 단계 ───────┐
  1.2 Phase gate hooks      ├─ 병렬 가능
  1.3 Template 정비 (계획만)┘
  1.4 Reviewer log 누적

Phase 2 (Workflow 깊이)
  2.1 Test scaffold (1.3 의존)
  2.2 Cross-worktree check
  2.3 CI fetch + self-heal

Phase 3 (차별화)
  3.1 Reviewer auto-calibrate (1.4 의존)
  3.2 Discovery 고도화 (1.1 의존)
  3.3 폐쇄망 지원

비코드
  X.1 README 갱신 (언제든 가능)
```

---

## 무시한 외부 리뷰 항목

- **"테스트가 design에서 spec 안 뽑는다"** — 이미 design SKILL.md L54-58에서 테스트 케이스 명세를 강제 중. 단 실제 test scaffold는 안 만들어서 Task 2.1로 살림.
- **"워크플로가 init부터 시작이라 요구사항 단계가 없다"** — 절반만 유효. init 이전이 빈 건 맞지만, 이는 Task 1.1로 보완. 단 "Jira 티켓이 존재하는 시점부터 시작"이라는 본 플러그인의 기본 전제 자체는 유지 (PO/PM 분리 모델에서 표준적).
