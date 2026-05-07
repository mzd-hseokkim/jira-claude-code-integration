# Discover 고도화 + plan/design → approach 통합 계획

- **Status**: Draft
- **Created**: 2026-05-06
- **Target Skills**: `jira-task-discover`, `jira-task-create`, (Phase 2) `jira-task-plan`, `jira-task-design`, 신규 `jira-task-approach`
- **Origin**: 사용자 대화 — Matt Pocock의 `context-mode:grill-me` 컨셉을 discover에 흡수, 분해 레벨에 따라 plan/design을 통합하는 방향

## 배경

현 워크플로 `discover → create → init → start → plan → design → impl → ...`에서 두 가지 문제가 식별됨:

1. **discover 인터뷰가 얕음** — 4건 batched 질문 1회로 끝나 모호한 요구를 끝까지 추궁하지 못함. 결과적으로 plan/design이 요구사항 재해석에 시간을 씀
2. **plan과 design은 작은 작업에서 의식(儀式)** — 1줄 버그 수정에도 두 산출물을 강제. 본질적 정보량이 중복됨 (둘 다 "어떻게 진행/구현할지"의 다른 면)

해결 방향:
- discover를 반복 인터뷰(grill 방식)로 강화하고, 작업 분해 레벨까지 결정
- discover 산출물에 *기술 접근법* 섹션을 포함시켜 후속 단계 입력으로 충분하게 함
- plan + design을 `approach` 1단계로 통합하고, 분해 레벨에 맞게 분량을 차등화

## 결정 사항 (확정)

1. **인터뷰 정책**
   - min 4 / max 10 라운드. 6라운드 종료 시점에 "더 진행할까요?" confirm
   - R0(가정 dump) **이전에** 카테고리 사전 공지 1단락 출력
   - 카테고리: ① 이해관계자 ② 성공 기준 ③ 제약 ④ 비기능 요구사항 (`--lite`는 ④ 제외)
2. **분해 레벨 3종**: `Single` / `Story+Subtasks` / `Epic+Stories+Subtasks`
   - LLM이 신호(기능 영역 수, 모듈 면적, 이해관계자 다양성, 완료 기준 다층성)로 제안
   - 수렴 gate에서 "충분 + 분해 레벨 [X] 동의?" 단일 confirm으로 통합
   - **원칙**: Epic-Story-Task 트리 강제 금지. 작업 크기에 맞게 가장 작은 적합 형식
3. **discover의 기술적 hint**: 접근법까지 다룸 (위험 신호만이 아니라 구현 전략 윤곽)
4. **plan + design 통합**: 신규 `approach` 단계로 1개. 레벨별 분량 차등 (Single 5줄 / Story 한 페이지 / Epic은 child Story 시퀀싱)
5. **파서 3-level 지원**: `/jira-task create --from-requirements`가 Single·Story·Tree 모두 받음

## Phase 1 — discover 고도화 + create 파서 확장

**목표**: 단독으로 동작 완결. plan/design은 기존 형식 유지하므로 회귀 위험 낮음.

### 변경 파일

- `skills/jira-task-discover/SKILL.md`
  - Step 3 본문 교체: 반복 인터뷰 (R0 가정 dump → Rn follow-up). 카테고리 사전 공지 단락 추가
  - Step 5 분기 확장: Single / Story / Tree 3-level. 수렴 gate에 레벨 confirm 통합
  - Input Model에 grill 관련 플래그 없음 (default 동작)
  - Step 4와 5 사이에 신규 섹션: **Technical Approach Hint** (분해 단위별 접근법 윤곽 — Phase 2 입력)
- `skills/jira-task-discover/refs/iterative-interview.md` (신규)
  - 루프 본문, 카테고리 커버리지 체크, 라운드 상한·confirm 시점
- `skills/jira-task-discover/refs/breakdown-level.md` (신규)
  - 3레벨 신호표 + 출력 템플릿 3종
- `skills/jira-task-create/refs/from-requirements-mode.md`
  - Epic 옵셔널 허용 (Story-only 트리 그대로 받기, 자동 Epic 생성 제거)
  - Single 형식 파싱 추가 (현재 E4 자연어 폴백 → 정규 파싱)
- `skills/jira-task-create/SKILL.md`
  - 이슈 생성 시 `.jira-context.json`에 `breakdownLevel` 필드 기록 (Phase 2 입력)
- `templates/requirements.template.md`
  - 분해 섹션 3레벨 자리. Technical Approach Hint 섹션 신설
- `.claude-plugin/plugin.json`
  - version bump

### 검증 체크리스트

- [ ] default discover로 4~10 라운드 동작, 카테고리 공지 1단락 출력
- [ ] `--lite`는 max 10 유지하되 NFR 카테고리 생략
- [ ] 6라운드 종료 시 confirm prompt 발생
- [ ] Step 3.5 conflict detection은 `--from` 모드에서 그대로 동작
- [ ] Step 5에서 3레벨 중 하나로 결정, 사용자가 변경 가능
- [ ] requirements 문서 말미에 Technical Approach Hint 섹션 존재
- [ ] `/jira-task create --from-requirements` Single 파일 → 작업 1건만 생성
- [ ] `/jira-task create --from-requirements` Story-only → Epic 강제 없이 Story+Subtasks 생성
- [ ] `/jira-task create --from-requirements` Tree → 기존 동작 유지 (회귀 없음)
- [ ] `.jira-context.json`에 `breakdownLevel` 기록 확인

## Phase 2 — plan + design → approach 통합

**목표**: 워크플로 단계 축소(13→12), 산출물 중복 제거. 시스템 와이드 변경.

### 변경 파일

- `skills/jira-task-approach/SKILL.md` (신규)
  - level-aware 분량: Single 5줄 / Story 한 페이지 / Epic은 child Story 시퀀싱만
  - `.jira-context.json.breakdownLevel` 우선, 없으면 Jira issuetype에서 폴백 추론
  - Cache-First Fetch 패턴 준수
- `skills/jira-task-approach/refs/level-templates.md` (신규)
  - 3레벨 출력 템플릿
- `templates/approach.template.md` (신규)
- `skills/jira-task-plan/`, `skills/jira-task-design/` 제거
- `templates/plan.template.md`, `templates/design.template.md` 제거
- `commands/jira-task.md`
  - action 라우팅: `plan`/`design` → `approach`로 alias 처리하며 deprecation 안내 1회 출력
  - argument-hint, action 목록, auto 시퀀스 설명, report 워크플로 단계 모두 갱신
- `hooks/scripts/phase-gate.config.json`
  - `plan`/`design` 단계 제거, `approach` 1단계 신설
  - `approach.requires = ["start"]`, `impl.requires = ["approach"]`
  - artifacts glob: `docs/approach/{TASK_ID}.approach.md`
- `hooks/scripts/phase-gate.scenarios.test.js`, `phase-gate.test.js`
  - 시나리오 갱신
- `hooks/scripts/dashboard-ingest.sh`, `dashboard-ingest.test.sh`
  - 단계 라벨 갱신
- `scripts/dashboard/` (UI)
  - 단계 컬럼/뱃지 표기 갱신
- `skills/jira-task-auto/SKILL.md`
  - 시퀀스 `start → plan → design → impl` → `start → approach → impl`
- `skills/jira-task-report/SKILL.md`
  - 워크플로 단계 라벨 갱신
- `scripts/jira-context-update.py`
  - 유효 step 화이트리스트: `plan`/`design` 제거, `approach` 추가
  - 기존 task의 `plan`+`design` completed 흔적은 `approach` 충족으로 간주하는 마이그레이션 로직 (one-shot)
- 모든 스킬의 Completion Summary `Progress` 라인 일괄 갱신 (`discover → create → init → start → approach → impl → test → review → merge → pr → done`)
- `CLAUDE.md` Repository Layout 섹션, 유효 단계 목록 갱신
- `README.md` 사용자 문서 갱신
- `.claude-plugin/plugin.json` version bump

### 마이그레이션

- 기존 in-flight task 보호:
  - `.jira-context.json.completedSteps`에 `plan`+`design`이 둘 다 있으면 `approach` 충족으로 간주
  - `docs/plan/<TASK>.plan.md` 또는 `docs/design/<TASK>.design.md`이 존재하면 phase-gate가 `approach` 통과 처리
- deprecation 윈도우: 1 minor 버전 동안 `/jira-task plan`·`/jira-task design`이 approach로 라우팅되며 안내 메시지 출력. 이후 제거

### 검증 체크리스트

- [ ] approach 스킬이 3레벨 모두 정상 산출
- [ ] phase-gate가 plan/design 부재 상태에서 approach 충족 시 impl 진입 허용
- [ ] 기존 plan/design 흔적이 있는 task가 approach 충족으로 인식됨
- [ ] auto 시퀀스가 새 단계로 동작
- [ ] dashboard에 새 단계 라벨 표시
- [ ] report가 새 단계 순서로 출력
- [ ] `/jira-task plan TASK-123` 호출 시 approach로 라우팅 + deprecation 메시지

## Phase 분할 근거

- Phase 1만으로 동작 완결 — plan/design은 기존 흐름 유지. 단독 검증 가능
- Phase 2는 phase-gate·라우팅·대시보드까지 시스템 와이드. 한 번에 묶으면 회귀 추적 어려움
- Phase 1 사용해보면서 Technical Approach Hint 섹션이 실제로 approach 입력으로 충분한지 측정 가능. 부족하면 Phase 2 설계가 달라짐

## Open Questions

- approach 스킬에서 사용자 confirm 시점은? (전체 합성 후 1회 vs 레벨 결정 직후 + 합성 후 2회)
- `--lite`/`--from`/(Phase 2의) approach가 모두 동시 사용될 때의 상호작용 매트릭스 정의 필요
- Phase 2 deprecation 윈도우 길이 (1 minor 충분한지, 즉시 제거 가능한지)
- 기존 `tasks/improve-plan-template.md`·`tasks/improve-design-template.md`는 Phase 2에서 폐기 처리 — 별도 정리 필요
