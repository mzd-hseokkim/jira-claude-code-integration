# AI-Native SDLC 트렌드 대비 `jira-claude-code-integration` 갭 분석

- **작성일**: 2026-05-28
- **대상 버전**: v0.44.5
- **개정**: 1차 보고서의 과잉 처방을 사용자 피드백으로 정정한 버전

---

## 1. 결론 먼저

본 플러그인은 2025~2026 AI-Native SDLC의 **1세대 목표(PDCA 자동화)**를 사실상 달성했다. 동일 카테고리 OSS 중 완성도가 가장 높음. 추가로 손댈 만한 칸은 많지 않고, **3개로 좁혀진다.**

1. **approach 산출물의 결정론적 체크리스트화** (L2/L3 한정)
2. **review의 AC 매칭을 ID 기반 옵션 모드** (L3 한정)
3. **프로젝트 메모리 핀(project memory pins)**

나머지 트렌드 항목 — 토큰/비용 관측, 거버넌스·정책 게이트, 멀티 에이전트 A2A, 머지 게이트, 트리아지 — 은 **현재 포지션에서는 야크 쉐이빙**으로 판단. 이유는 §4에 정리.

---

## 2. 시장 흐름과 본 플러그인 위치

2026년 AI-Native SDLC 시장의 큰 흐름은:

- **가치 이동**: 코드 작성은 상품화, 가치는 *스펙·전략*(입력)과 *검증·운영*(출력)으로.
- **Spec-Driven Development(SDD)**: GitHub Spec Kit 등이 사실상 출발점. 단, *형식*이 아니라 *기계가독성*이 본질.
- **Issue tracker = Agent Control Plane**: Linear, Atlassian "Agents in Jira"(2026-02 베타).
- **Worktree + Sandbox 병렬화**: VS Code 네이티브, Dagger Container Use, Claude Code `isolation: worktree`.
- **MCP(수직) + A2A(수평)**: 2025-12 / 2025-06 Linux Foundation 기부.
- **Observability**: Langfuse·Helicone·LangSmith·Phoenix가 LLM 호출 레이어에서 표준화. **SDLC 도구 레이어가 아님.**

본 플러그인의 SDLC 단계 커버리지 (v0.44.5):

| 단계 | 현황 |
|---|---|
| Requirement | `jira-task-discover` |
| Issue 생성 | `jira-task-create` (서브태스크 분해) |
| Plan/Design | `jira-task-approach` (L1/L2/L3 규모 인식) |
| Worktree/Branch | `init`/`start`, MCP 자격증명 자동 전파 |
| Implementation | `impl` |
| Test | `test` (E2E/vitest/jest) |
| Review | `jira-reviewer` 서브에이전트 + 캘리브레이션 로그 |
| PR / Local Merge | `pr` / `jira-local-merge` |
| Done / 상태 전이 | `done` |
| Reporting | 대시보드 v0.44.x (cycle/lead/throughput, SDLC 단계별) |
| Context 영속 | `.jira-context.json` |
| MCP 통합 | mcp-atlassian |

비어 있는 칸을 *전부* 채워야 하는 건 아니다. 다음 §3·§4에서 *채울 가치 있는 칸*과 *그렇지 않은 칸*을 구분.

---

## 3. 보강할 만한 갭 (3개)

### G1. approach 산출물의 결정론적 체크리스트화

**문제**  
현재 `jira-task-approach`는 한국어 산문 비중이 크다. `impl`이 approach를 입력으로 받았을 때 "이번 작업의 구현 항목 N개"를 *결정론적으로* 추출하지 못한다. 결과적으로 impl 시작 시 LLM이 산문을 다시 파싱하며 토큰을 쓰고, 항목 누락이 발생해도 review 전까지 드러나지 않는다.

**제안**  
새 파일·새 스킬 신설은 **불필요**. approach 템플릿에 마지막 섹션 하나만 강제.

```markdown
## 구현 체크리스트 (impl/review 게이트)
- [ ] I1: <한 줄 요약 — 검증 가능한 형태>
- [ ] I2: ...
```

- L1은 면제. L2부터 강제. L3에서는 누락 시 review가 차단.
- impl은 항목별 진행을 Jira 코멘트로 포스팅(`I2 완료` 식의 짧은 마커).
- review는 체크리스트 ID와 변경 파일/테스트의 매칭을 *나열*. 자연어 판정 대신 표.

**노력**: S (approach·impl·review 프롬프트 각 1문단 수정 + 템플릿 1섹션).

### G2. review의 AC ↔ test ID 매칭 옵션 모드 (L3 한정)

**문제**  
현재 review는 갭 분석을 한국어 산문 비교로 수행. reviewer가 누락 AC를 놓치면 끝. L1/L2 작업에서는 문제 안 됨(작업이 작아 reviewer가 다 본다). L3에서만 위험.

**제안**  
별도 스킬 신설은 **불필요**. `jira-task-review` 프롬프트에 L3 분기 추가:

- L3일 때, approach의 체크리스트(G1)와 변경된 test 파일/케이스를 ID 단위로 매칭한 표를 출력.
- 매칭되지 않는 체크리스트 항목이 있으면 review 결과를 `needs-changes`로 강제.

L1/L2는 기존 산문 비교 그대로. 작은 작업에 오버킬 적용하지 않는 것이 핵심.

**노력**: S (review 프롬프트 1문단 + 출력 형식 1표).

### G3. 프로젝트 메모리 핀 (project memory pins)

**문제**  
현재 `.jira-context.json`은 *작업 단위* 진행 기록. *프로젝트 단위*의 영속 헌법(ESM only, Conventional Commits, 금지 라이브러리, 테스트 컨벤션 등)이 매 세션마다 재설명되거나 누락된다. 결과: 토큰 낭비 + 환각 + 규약 위반 PR.

**제안**  
플러그인이 관리하는 가벼운 핀 파일. 위치는 워크트리 공유 가능한 곳:

- `.jira-pins.json` (또는 `CLAUDE.md`의 특정 섹션 컨벤션화).
- 구조: `{ pins: [{ id, scope: "project|repo", text, addedAt }] }`.
- 모든 `jira-task-*` 스킬의 시스템 프롬프트 앞단에 자동 주입.
- 추가/삭제 명령: `/jira-task pin add "..."`, `/jira-task pin list`.

**가드**: 핀이 늘어나면 토큰이 늘므로, 핀당 글자수 상한 + 총 개수 상한(예: 20개 / 합산 2KB). 초과 시 추가 거부.

**노력**: S~M (스킬 1개 + 시스템 프롬프트 주입 지점 표준화).

---

## 4. 의도적으로 *추가하지 않는* 항목

1차 보고서에서 제안했으나, 사용자 피드백을 반영해 **본 플러그인 범위 밖**으로 판단한 항목들. 향후 포지셔닝이 엔터프라이즈로 이동할 때 재검토.

### 토큰 / 비용 관측
- Claude Code 본체가 `/cost`로 이미 노출.
- 진지한 추적은 **LLM gateway**(Helicone / LiteLLM / Portkey / Langfuse) 레이어가 정답. 거기에 `x-issue-key` 메타데이터를 태깅하면 이슈당 비용도 거기서 집계됨.
- SDLC 도구가 서브에이전트의 모델 호출을 통째로 관측하는 것은 블랙박스. 이중 집계는 가치 낮음.
- **대시보드의 본업은 이미 잘하고 있는 cycle/lead/throughput.** 그쪽을 더 깊게.

### 거버넌스 / 정책 게이트 / 감사 트레일 (1차 G4)
- 본 플러그인의 사용자는 개인 + 소~중규모 팀. RBAC·audit·정책 게이트는 그 포지션에서 과적합.
- Atlassian이 "Agents in Jira"로 직접 차지하는 영역이라 경쟁도 무의미.
- 필요하면 그쪽으로 위임. 본 플러그인은 *개발자 워크플로*에 집중.

### AI 코드 보안 스캔 (1차 G5)
- CI 단계의 `npm audit` / `gitleaks` / `osv-scanner`가 표준 위치.
- 플러그인이 별도 단계로 끼우면 CI와 중복 + 신호 분산.
- 필요 시 review 단계에서 *결과를 읽어 요약*하는 정도만. 새 스킬 신설 불필요.

### 멀티 에이전트 / A2A (1차 G6)
- 글로벌 룰: Agent Team은 비용 7배. 본 플러그인의 `auto`는 이미 순차 서브에이전트로 충분.
- A2A는 외부 에이전트(예: CodeRabbit) 연동 가치가 명확해질 때 재검토.

### 머지 게이트 자동화 (1차 G8)
- GitHub Branch Protection + CI의 본업.
- 플러그인이 다시 게이트를 거는 것은 단일 책임 위반.

### 트리아지 스킬 (1차 G9)
- Atlassian Rovo·Linear AI가 직접 차지. 따라 잡기 어려움.
- 본 플러그인의 진입점은 "이미 할당된 이슈"로 충분히 명확.

### 추적성 매트릭스 (1차 G10)
- G1·G2가 들어가면 *부산물*로 자연 발생. 별도 항목 불필요.

---

## 5. 우선순위 & 로드맵

| # | 항목 | 노력 | 임팩트 |
|---|---|:---:|:---:|
| 1 | G3 프로젝트 메모리 핀 | S~M | ★★ — 토큰 절감 + 환각 감소 즉시 체감 |
| 2 | G1 approach 체크리스트 강제 (L2+) | S | ★★ — impl/review 입력 품질 상승 |
| 3 | G2 review AC↔test ID 매칭 (L3) | S | ★ — L3 작업의 누락 사고 방지 |

**Phase A (v0.45.x, ~1주)**: G3 + G1.  
**Phase B (v0.46.x, ~3일)**: G2 (G1 종속).

세 항목 모두 새 스킬 신설 없이 **기존 템플릿/프롬프트의 surgical change**로 끝난다. 플러그인 컨벤션(Simplicity First)과 정합.

---

## 6. 한 줄 정리

> 1세대 목표(PDCA 자동화)는 끝. 2세대로 가는 길은 *모든 트렌드 항목을 추가하는 것*이 아니라, **approach·review의 출력 형식을 결정론적으로 단단히 하고, 프로젝트 헌법을 한 번 꽂아두는 것**. 나머지는 LLM gateway·CI·이슈 트래커 본체의 본업.
