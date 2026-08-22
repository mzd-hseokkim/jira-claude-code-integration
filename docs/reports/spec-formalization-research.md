# AI-Native SDLC에서 상류 문서(PRD/ADR)의 정형화 — 조사 보고서

- **작성일**: 2026-08-11
- **출발점**: Adam Chlipala, ["Rewrite All the Code, All the Time"](https://stng.substack.com/p/rewrite-all-the-code-all-the-time) (2026-08-04)
- **범위**: (1) 정형화 가능성 (2) 정형화의 경계 (3) 시장 조사 (4) 문서 종류·템플릿 카탈로그

---

## 0. 원문 논지 정리 — 오독하면 안 되는 부분

Chlipala의 주장은 "PRD를 정형화하자"가 **아니다.** 그는 준정형 스펙(EARS 등)을 **flowchart에 비유**한다 — 형식 의미론이 불분명한 과도기적 중간 산물이고, 고급 언어에 밀려 사라진 것처럼 사라질 것이라고 본다.

> `WHILE inventory of product X remains, WHEN the button for X is pressed, ... SHALL dispense one X.`
>
> 대문자 키워드만 형식적 의미를 갖고 나머지 구절은 전부 자유 자연어다. 그런데 **행동을 결정하는 건 바로 그 자유 구절**이다.

그가 세운 성공 기준은 **"인간 개입 없는 push-button 재생성"**이다. 그 기준에서 spec-driven development는 "정밀도를 높이는 다단계 번역 + 매 단계 인간 검토" = 병목이므로 실패로 판정된다. 그래서 그는 logic-based 형식 언어 + 증명으로 가야 한다고 결론짓는다.

**이건 연구 베팅이지 2026년 회사 SDLC에 적용할 방법론이 아니다.** 우리에게 필요한 기준은 "인간 개입 0"이 아니라 "AI 에이전트가 재현 가능하고 검증 가능하게 동작할 만큼"이다. 아래 논의는 전부 후자 기준이다.

부가로, 원문 댓글(Werner Kasselman)이 지적한 빈틈이 우리에게 더 실용적으로 중요하다: **"어떤 주장이, 어떤 버전에 대해, 무엇으로 검증됐는지의 기록"**이라는 제3의 산출물이 두 계약자 중 누구도 만들지 않는다는 것. 재생성 비용이 0에 수렴해도 **재검증(re-assurance) 비용은 같은 속도로 떨어지지 않는다.**

---

## 1. 정형화가 가능한가 — 조건부 가능. 단, 대상을 바꿔야 한다

"문서를 정형화한다"는 프레이밍 자체가 함정이다. **의도(intent)는 본질적으로 비형식**이고, 그걸 형식 언어에 밀어넣는 시도는 지난 40년간 반복 실패했다 (IEEE SRS, UML/MDA, CASE 도구). Thoughtworks의 Birgitta Böckeler는 현재의 SDD를 **"1990년대 Model-Driven Development의 재방영 — 단, 파싱 가능한 DSL은 빠지고 LLM 비결정성은 추가된 버전"**이라고 정리한다.

실현 가능한 프레이밍은 이것이다.

> 문서를 정형화하는 게 아니라, **문서에서 기계 검증 가능한 부분을 추출해 실행 가능한 아티팩트로 컴파일**한다.

| 문서 | 정형화 **불가** (산문으로 남긴다) | 정형화 **가능** (기계가 검증) |
|---|---|---|
| PRD / 요구사항 | 왜 만드는가, 사용자 맥락, trade-off | 문서 스키마, 요구사항 ID, 수용 기준(→테스트), 인터페이스 계약(→OpenAPI/JSON Schema/타입), 측정 가능한 NFR 목표치 |
| ADR / 설계 결정 | 결정 근거, 기각된 대안, 배경 | status/supersedes 메타, 적용 범위(glob), **제약 → lint 규칙 / 아키텍처 테스트로 컴파일** |

마지막 항목이 핵심이다. "우리는 X 라이브러리를 쓰지 않는다"는 ADR을 산문으로만 두면 에이전트가 3개월 뒤 위반한다. 같은 결정을 import 금지 lint 규칙이나 ArchUnit 스타일 테스트로 컴파일해두면 위반이 CI에서 죽는다. **ADR 본문은 사람용, 컴파일된 규칙은 에이전트용** — 둘을 한 파일에서 링크해두는 것이 현실적 최대치다.

---

## 2. 경계 — 3층 구조와 판정 기준 두 개

### 정형성 사다리 (machine-checkability 기준)

| Level | 방식 | 기계 검증성 | 저작 비용 | 대표 사용처 |
|---|---|---|---|---|
| L0 | 자유 산문 | 0 | 최저 | 대부분의 PRD |
| L1 | 키워드 규율 — [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) MUST/SHOULD/MAY + [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)(대문자만 규범적) | grep 수준 | ~0 | IETF/W3C 전역 |
| L2 | 제어 자연어 — **[EARS](https://alistairmavin.com/ears/)**, Rupp's/SOPHIST, **Planguage**(정량 NFR) | 절 트리 파싱, 1:1 테스트 매핑 | 낮음 (교육 몇 시간) | Airbus, Bosch, NASA, Rolls-Royce, Siemens / **AWS Kiro** |
| L3 | 예시 기반 실행 가능 — Gherkin/BDD, [Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/) | 실행됨 | 중간 + glue 유지비 높음 | BDD 팀 |
| L4 | **인터페이스 계약 — OpenAPI / JSON Schema / protobuf / 타입 시스템 / [Pact](https://docs.pact.io/) / property-based testing** | 완전 | 낮음 | 광범위 |
| L5 | 경량 형식 — [TLA+](https://cacm.acm.org/research/how-amazon-web-services-uses-formal-methods/), [P](https://p-org.github.io/P/), [Alloy](https://alloytools.org/), [ShardStore식 실행 가능 참조 모델](https://www.cs.utexas.edu/~bornholt/papers/shardstore-sosp21.pdf) | 모델 수준 | 높음 (주 단위) | AWS 7개 팀 |
| L6 | 검증된 구현 — Dafny, SPARK Ada, Event-B, [Cryptol+SAW (s2n)](http://www0.cs.ucl.ac.uk/staff/b.cook/CAV18_s2n.pdf) | 증명 | 매우 높음 | 암호/안전 필수 |
| L7 | 완전 기능 증명 — [seL4](https://read.seas.harvard.edu/~kohler/class/cs260r-17/klein10sel4.pdf), Coq/Lean | 완전 | 8,500 SLOC에 ~12 person-year (≈$350/SLOC) | 커널/항공 |

**핵심 참조점 — AWS ShardStore (SOSP'21 best paper)**: 40K LoC Rust에 증명 대신 *실행 가능한 참조 모델 + property test + 결정적 시뮬레이션*을 썼다. 프로덕션 도달 전 16건 차단, 그리고 **형식기법 비전문가 엔지니어가 확장 가능**했다. 완전성보다 자동화와 일반 엔지니어의 유지보수성을 택한 것 — 우리가 따라야 할 모델이다.

### 실무 3층

**Layer 1 — 스키마 층: 무조건 정형화**
섹션 구조, 필수 필드, 요구사항 ID, trace marker, 상태 머신. 저작 비용 ≈0, 에이전트 파싱 신뢰도는 크게 상승.

**Layer 2 — 검증 층: 정형화의 진짜 값어치**
요구사항 1개당 실행 가능한 수용 기준. Chlipala의 *"any program meeting them will be acceptable"*의 실용 번역이 이것이다. 완전한 형식 명세는 불가능해도 **충분히 촘촘한 실행 가능 수용 기준 집합**이 근사치 역할을 한다. 그리고 이게 재생성을 실제로 가능하게 만든다 — 코드를 버리고 다시 짜도 이 집합을 통과하면 받아들일 수 있으니까.

**Layer 3 — 산문 층: 정형화 금지**
why, 배경, trade-off, 기각안. 형식을 강요하면 정보가 죽고 유지비만 남는다.

### 판정 기준

1. **"이 문장이 틀렸을 때 기계가 알아챌 수 있나?"** — 아니오면 산문으로 둔다. 검증 불가능한 정형화는 순수 비용이고, 더 나쁘게는 *거짓 신뢰*를 만든다.
2. **drift 비용을 감당할 수 있나?** — CI에서 실행되지 않는 산출물은 2 스프린트 안에 썩는다. 이게 진짜 "cliff"다. 표기법의 난이도가 아니라 *"매 커밋 검증됨"과 "검증 안 됨" 사이의 유지보수 불연속*.

> **지배 규칙**: 모든 정형 절은 *CI가 실행하거나*, *다음 리뷰에서 삭제되거나* 둘 중 하나여야 한다. 기계가 읽지 않는 형식은 순수 부채다.

### 비안전필수 팀의 sweet spot

**L2 + L4를 목표로. 행동이 논쟁되는 곳만 L3. L5 이상은 가지 않는다.**

1. PRD 본문 = **EARS 5패턴**. 각 `WHEN/WHILE/IF` 절이 테스트 이름이자 에이전트의 자가 검증 항목이 된다.
2. NFR = **Planguage의 SCALE/METER/MUST 필드만** (나머지 20개 키워드는 버린다). 숫자를 강제하고, 그 숫자가 assertion이 된다.
3. 의무 강도 = **RFC 2119 대문자**. lint 한 줄.
4. 인터페이스 = **OpenAPI/JSON Schema/protobuf, CI 검증**. 기계 검증성이 거의 공짜인 지점 — 하중을 여기에 싣는다, 산문이 아니라.
5. 논쟁되는 것만 **Example Mapping** → 합의된 것만 Gherkin으로 승격.
6. ADR = **MADR + YAML frontmatter** (status/date/deciders/supersedes). 1페이지 상한.

### 왜 정형화가 실패하는가 (근거)

- [Cofer et al., FMICS 2013](http://loonwerks.com/publications/pdf/cofer2013fmics.pdf) — 최대 장벽은 표현력이 아니라 **교육·툴링·산업 환경**(계약, 일정, 인력 이동).
- [Toward Practical Deductive Verification (arXiv 2510.20514)](https://arxiv.org/pdf/2510.20514) — **증명 유지보수** 비용. "verification often does not pass the cost-benefit analysis."
- **Spec-code drift** — 보편적 킬러. 양방향 spec↔code 동기화를 제공하는 벤더는 아직 없다.
- **Over-specification** — *what*이 아니라 *how*를 못 박은 스펙은 유효한 구현을 막고 리팩터링마다 churn을 만든다.

---

## 3. 시장 조사 (2026-08 기준)

### 3.1 분류 — Böckeler taxonomy (그대로 채택할 가치가 있음)

[martinfowler.com, 2025-10-15](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)

- **spec-first** — 스펙은 일회용 "시동유". (Antigravity, Junie, Codex plan mode)
- **spec-anchored** — 스펙이 거버넌스 층으로 존속, 변경은 spec→code로 흐름. (Kiro, OpenSpec, BMAD) ← **신뢰할 만한 실무는 여기 있다**
- **spec-as-source** — 인간이 코드를 만지지 않음. (Spec Kit의 이념, Tessl의 제품 논지)

### 3.2 주요 플레이어

| 도구 | 주체 | 산출물 | 정형성 | 성숙도 |
|---|---|---|---|---|
| [Spec Kit](https://github.com/github/spec-kit) | GitHub | `constitution.md`/`spec.md`/`plan.md`/`tasks.md`, `/specify→/plan→/tasks→/implement` | 구조화 MD | 2025-09-02 출시, ★126k |
| [Kiro](https://kiro.dev) | AWS | `requirements.md`(**EARS**)/`design.md`/`tasks.md` + steering + hooks | **EARS** — 주류 중 최고 | 2025-07 preview → ~2026-05 GA. **AWS가 Amazon Q Developer를 접고 여기 베팅** (가입 차단 2026-05-15, EOS 2027-04-30) |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Fission-AI | **델타 스펙** — living spec 대비 ADDED/MODIFIED/REMOVED diff, propose→apply→archive | 구조화 MD + diff 의미론 | ★64.5k, brownfield 대응 강함 |
| [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | BMad Code | 에이전트 페르소나 → PRD + 아키텍처 → sharded story | 구조화 MD | ★51.7k |
| [Tessl](https://tessl.io) | Guy Podjarny (Snyk 창업자) | `.spec.md`, 코드에 `// GENERATED FROM SPEC - DO NOT EDIT` | spec-as-source 최전선 | **$125M 조달. Framework는 ~9개월째 closed beta. 2026-01-29 스킬 레지스트리로 피벗** |
| [agent-os](https://github.com/buildermethods/agent-os) | Brian Casel | mission/roadmap/tech-stack + standards | 자유 MD | ★5.25k. **v3.0에서 자체 구현 단계를 삭제** — 프론티어 모델이 대체 |
| [spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp) | Pimzino | Kiro 삼종세트 MCP 서버 | 구조화 MD | ★4.3k, **템플릿 파일 실재** |

기타: AWS **AI-DLC** 방법론(Bolts/Mob Elaboration, 10–15× 주장은 벤더 자체 수치), Google **Antigravity**(2025-11-18), JetBrains Junie Plan Mode, Replit Plan Mode, Traycer, [VSDD](https://github.com/adamdaw/VSDD)(spec+TDD+Kani/Dafny/TLA+ 게이트).

### 3.3 실제로 수렴이 일어난 곳 — 스펙이 아니라 **컨텍스트 표준**

- **[AGENTS.md](https://agents.md)** — OpenAI/Google/Cursor/Factory/Sourcegraph 공동, 2025-08. 출시 ~20k repo → 2026 중반 **60k+**, 28개 이상 도구가 준수. **2025-12-09 Agentic AI Foundation(Linux Foundation)에 기증** (MCP, goose와 함께). 이 카테고리에서 가장 확실하게 굳은 승리.
- **MCP** — 같은 AAIF 기증. 스펙을 에이전트에 먹이는 전송 계층.
- **Anthropic Skills** — `SKILL.md` + progressive disclosure, 2025-10-16. 오픈 스펙 agentskills.io (2025-12-18). **SDD가 무시하는 토큰 비용 문제를 패키징으로 푼다.**
- **Cursor rules** — `.cursorrules` deprecated → `.cursor/rules/*.mdc`. Cursor도 AGENTS.md를 읽는다.
- **[llms.txt](https://llmstxt.org)** — 경고 사례. 도메인의 ~10.1%가 갖고 있지만 **주요 크롤러 중 파싱을 약속한 곳이 없다.** 소비자 동의 없는 스펙 포맷의 실패 모드.

### 3.4 회의론 — 무게 있는 것들만

- **"Waterfall strikes back"** — François Zaninotto (Marmelab, 2025-11-12); "full circle to BDUF."
- **Dijkstra EWD667의 LLM판** — Don Syme (2025-08-27): *충분히 정밀한 스펙은 그 자체로 코드다.* Chlipala의 논지와 정확히 같은 지점을 반대편에서 짚는다.
- **토큰 비용** — Spec Kit plan 단계가 2,000+ 줄 MD 생성(406줄 중복 research 문서 포함), 매 턴 spec/plan/tasks 재독으로 **API 지출 20–40% 증가**. OpenSpec은 그 절반 수준으로 측정됨.
- **Drift** — Kiro spec-sync를 포기하는 실무자들: 스펙이 "계속 어긋나서 중복과 모순이 쌓인다."
- **독립 실증은 반대 방향을 가리킨다**: [METR RCT](https://arxiv.org/abs/2507.09089) (숙련 OSS 개발자 16명, AI 사용 시 **19% 느려짐**, 본인들은 20% 빨라졌다고 믿음) · DORA 2025("속도만 있고 안정성 없으면 가속된 혼돈") · Stack Overflow 2025(AI 정확도 신뢰 **29%**로 하락) · GitClear(copy-paste 8.3%→12.3%, 이동/리팩터 24.1%→9.5%) · Uplevel 2024(Copilot으로 **버그율 +41%**, 처리량 이득 없음).
- **tests-as-spec 반론** (Dik Rana): 에이전트가 마크다운을 몰래 고치면 안 보이지만, **테스트 파일을 지우면 리뷰에 걸린다.**

### 3.5 Signal vs Noise

**Signal — 지금 채택할 가치 있음**
1. **AGENTS.md + MCP (AAIF 거버넌스)** — 실제로 일어난 "장기 아티팩트" 승리는 *스펙*이 아니라 *컨텍스트/지시 파일*이었다.
2. **작업 분해 아티팩트** (`tasks.md`, plan mode, OpenSpec 델타) — Spec Kit의 ★126k는 진짜지만 그 가치는 재생성이 아니라 **작업 시퀀싱과 스코프 고정**이다.
3. **Anthropic Skills / 플러그인 마켓플레이스** — 토큰 비용 문제를 정면으로 다룸.
4. **Kiro의 EARS** — 자연어 모호성을 줄이려는 유일한 주류 시도. AWS가 Q Developer 설치 기반을 걸었다.

**Noise — 아직 검증되지 않음**
- **spec-as-source / 코드 일회용화.** Tessl은 이 논지로 $125M을 모았고, Framework는 9개월째 closed beta이며, 실제 출시된 제품은 조용히 **스킬 레지스트리**가 됐다. 이 조사에서 가장 큰 데이터 포인트다.
- **벤더 생산성 수치** (AI-DLC 10–15× 등) — 전부 자체 발표. 독립 근거는 반대 방향.
- **Thoughtworks Radar가 "spec-driven development"를 Vol 33(2025-11) Assess에 올렸다가 다음 볼륨에서 뺀 것** — 가장 깔끔한 외부 판정. 반면 **AGENTS.md**와 "curated shared instructions for software teams"는 살아 있는 blip.
- **작은 변경에 풀 세리머니 SDD** — 다출처 일관된 결론: 20–40% 토큰 오버헤드, "오타 수정엔 과잉."

> **결론**: 업계는 *에이전트용 구조화 컨텍스트*로 수렴했고, *재생성 가능한 진리원천으로서의 스펙*으로는 수렴하지 **않았다.** Böckeler의 **spec-anchored** 중간 층이 신뢰할 만한 실무의 위치다.

---

## 4. 문서 종류 · 템플릿 카탈로그

### 4.1 AI-native 진영

**GitHub Spec Kit** — 실 템플릿 있음 ✅
`templates/spec-template.md` (raw: `raw.githubusercontent.com/github/spec-kit/main/templates/spec-template.md`)
```
# Feature Specification: [FEATURE NAME]
## User Scenarios & Testing *(mandatory)*
### User Story 1 - [Brief Title] (Priority: P1)
### User Story 2 - [Brief Title] (Priority: P2)
### User Story 3 - [Brief Title] (Priority: P3)
### Edge Cases
## Requirements *(mandatory)*
### Functional Requirements
### Key Entities *(include if feature involves data)*
## Success Criteria *(mandatory)*
### Measurable Outcomes
## Assumptions
```
`templates/plan-template.md`: `## Summary` `## Technical Context` `## Constitution Check` `## Project Structure` `## Complexity Tracking`
`templates/constitution-template.md`: `## Core Principles` (`### [PRINCIPLE_1..5_NAME]`) → `## Governance`
`templates/tasks-template.md`: Phase 1 Setup → Phase 2 Foundational(Blocking) → Phase 3 User Story 1 🎯 MVP → … → Polish; `## Dependencies & Execution Order`, `## Implementation Strategy`

**AWS Kiro** — 공개 템플릿 파일 없음 (IDE가 생성). 구조만 문서화됨: `requirements.md`(user story + EARS 수용 기준) / `design.md`(`Architecture`, `Data Flow`, `Interfaces`, `Data Models`, `Error Handling`, `Unit Testing Strategy`) / `tasks.md`, steering = `product.md`/`structure.md`/`tech.md`. EARS 출력 형태: `WHEN [condition/event] THE SYSTEM SHALL [expected behavior]`. 문서: kiro.dev/docs/specs/ (각 페이지에 `.md` 동반본, `kiro.dev/llms.txt`)

**spec-workflow-mcp** — Kiro 삼종세트의 실제 복사 가능한 오픈 클론 ✅ (`src/markdown/templates/`)
`requirements-template.md`: `## Introduction` `## Alignment with Product Vision` `## Requirements`(`### Requirement N`) `## Non-Functional Requirements`(Code Architecture and Modularity / Performance / Security / Reliability / Usability)
`design-template.md`: `## Overview` `## Steering Document Alignment` `## Code Reuse Analysis` `## Architecture` `## Components and Interfaces` `## Data Models` `## Error Handling` `## Testing Strategy`

**OpenSpec** — 빈 템플릿 없음, 규약이 곧 포맷. `openspec/changes/<change-id>/` 아래 `proposal.md`, `design.md`(선택), `tasks.md`, `specs/<capability>/spec.md`(델타)
```
## ADDED Requirements
### Requirement: <name>
The system SHALL …
#### Scenario: <name>
- **WHEN** …
- **THEN** …
- **AND** …
```

**BMAD-METHOD** — 실 템플릿 다수 ✅ (`src/bmm-skills/`)
PRD (`plan/bmad-prd/assets/prd-template.md`): `0. Document Purpose` `1. Vision` `2. Target User`(JTBD / Non-Users(v1) / Key User Journeys) `3. Glossary` `4. Features`(`#### FR-1:`) `5. Non-Goals (Explicit)` `6. MVP Scope` `7. Success Metrics` `8. Open Questions` `9. Assumptions Index`
아키텍처 (`bmad-architecture/assets/spine-template.md`): Design Paradigm / Inherited Invariants / **Invariants & Rules (AD-n)** / Consistency Conventions / Stack / Structural Seed / Capability→Architecture Map / Deferred
스토리: `Story` `Acceptance Criteria` `Tasks/Subtasks` `Dev Notes` `Dev Agent Record`
PR/FAQ (`bmad-prfaq/assets/prfaq-template.md`) — Amazon working-backwards의 실제 구현체로 쓸 수 있는 유일한 공개 아티팩트

**Tessl** — ⚠️ 옛 Framework 포맷(`.tessl/`, 1:1 spec↔code)의 문서 페이지는 현재 404. 현 제품은 스킬/플러그인 레지스트리. SDD는 플러그인(`tessl install tessl-labs/spec-driven-development`). **공개 스펙 템플릿 없음 — 옛 포맷이 유효하다고 가정하지 말 것.**

**AGENTS.md** — 공식 템플릿 없음. 사이트 권장 섹션: "Project overview, Build and test commands, Code style guidelines, Testing instructions, Security considerations." 참조 파일: `raw.githubusercontent.com/openai/agents.md/main/AGENTS.md`

### 4.2 클래식 (전부 복사 가능) ✅

| 템플릿 | 섹션 | 출처 |
|---|---|---|
| **Nygard ADR** | Title, `## Status`, `## Context`, `## Decision`, `## Consequences` | [cognitect](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) · [joelparkerhenderson 모음](https://github.com/joelparkerhenderson/architecture-decision-record) |
| **MADR (권장)** | YAML frontmatter(status/date/decision-makers/consulted/informed) + `## Context and Problem Statement` `## Decision Drivers` `## Considered Options` `## Decision Outcome` `### Consequences` `### Confirmation` `## Pros and Cons of the Options` `## More Information` | [adr.github.io/madr](https://adr.github.io/madr/) · raw: `raw.githubusercontent.com/adr/madr/main/template/adr-template.md` (minimal 판도 있음) |
| **Y-statement** | 한 문장: *In the context of ⟨use case⟩, facing ⟨concern⟩, we decided for ⟨option⟩ and neglected ⟨alternatives⟩, to achieve ⟨quality⟩, accepting ⟨downside⟩.* | [Zimmermann](https://ozimmer.ch/practices/2022/11/22/MADRTemplatePrimer.html) |
| **arc42** | 12섹션: introduction_and_goals / architecture_constraints / context_and_scope / solution_strategy / building_block_view / runtime_view / deployment_view / concepts / **architecture_decisions** / quality_requirements / technical_risks / glossary | [arc42-template/EN](https://github.com/arc42/arc42-template/tree/master/EN) |
| **Google design doc** | Context and scope / Goals and non-goals / The actual design(system-context-diagram, APIs, data storage, degree of constraint) / Alternatives considered / Cross-cutting concerns | [Malte Ubl](https://www.industrialempathy.com/posts/design-docs-at-google/) (산문, 파일 아님) |
| **C4** | system context → container → component → code (+ landscape, dynamic, deployment). **Structurizr MCP 서버 존재** | [c4model.com](https://c4model.com/) |
| **Oxide RFD** | AsciiDoc 속성 `:authors: :state: :discussion: :labels:`; state = prediscussion→ideation→discussion→published→committed→abandoned | [RFD 1](https://rfd.shared.oxide.computer/rfd/0001) |
| **EARS** | ubiquitous `The <system> shall …` / event `WHEN <trigger> …` / state `WHILE <state> …` / optional `WHERE <feature> …` / unwanted `IF <trigger>, THEN …` / complex(중첩) | [alistairmavin.com/ears](https://alistairmavin.com/ears/) |
| **Gherkin** | Feature, Rule, Scenario/Example, Given/When/Then/And/But, Background, Scenario Outline, Examples | [cucumber docs](https://cucumber.io/docs/gherkin/reference/) |

**미검증 / 주의**
- **ISO/IEC/IEEE 29148 SRS** — 유료 표준. 무료 복사 가능 아웃라인 없음. arc42 + Spec Kit spec 템플릿으로 대체 권장.
- **Planguage** — 키워드 집합(Tag/Gist/Scale/Meter/Must/Plan/Stretch/Wish/Past/Record/Source/Owner…)은 널리 인용되나 1차 출처 미확인.
- **Amazon PR/FAQ** — Amazon 공식 템플릿 없음. BMAD의 `prfaq-template.md`가 최선의 구체 아티팩트.

---

## 5. 우리 파이프라인에 대한 적용 (jira-integration)

### 현재 위치

우리는 이미 **spec-anchored**다. 그리고 몇 가지 지점에서는 Spec Kit/Kiro보다 앞서 있다.

- `requirements.template.md`의 **trace marker** — `*(source: Q2, code: src/notify.ts:45-60)*`. Spec Kit에도 Kiro에도 없다.
- **Goals ↔ FR 매핑 표** + 고아 Goal/FR 격상 규칙. 요구사항 커버리지를 기계적으로 검사 가능한 형태.
- **`N/A — <사유>` 강제, TBD 금지** → Open Questions로 격상. 침묵을 허용하지 않는 구조.
- **P1/P2/P3 + `[CONFLICT]` 마커** — 차단성 분류.
- **분해 레벨 L1/L2/L3** — 작은 변경에 풀 세리머니를 강제하지 않는다. 업계가 반복 지적하는 "20–40% 토큰 오버헤드" 문제를 이미 회피하고 있다.
- **worktree 단위 change-scoped 문서** — Kiro의 living-spec보다 OpenSpec의 델타 모델에 가깝고, drift 저항성이 더 좋다.

### 갭 — 우선순위 순

**P1. ADR/결정 기록이 아예 없다.** `templates/`에 decision record가 없다. 아키텍처 결정이 approach 문서에 녹아 사라지고, 다음 태스크의 에이전트는 그 결정을 모른다. → MADR + YAML frontmatter 도입, 1페이지 상한.

**P2. 프로젝트 전역 불변식(constitution)이 없다.** Spec Kit의 `constitution.md`, BMAD의 `Invariants & Rules (AD-n)`, Kiro의 steering(`product/tech/structure.md`)에 해당하는 것. CLAUDE.md가 부분적으로 대신하지만, *모든 생성물이 반드시 지켜야 할 검증 가능한 불변식* 목록은 아니다.

**P3. 정형화한 것을 검증하는 CI가 없다.** 템플릿 규약(trace marker 존재, Goals↔FR 고아 없음, N/A 사유 필수)은 지금 프롬프트로만 강제된다 = LLM 재량. → `requirements.md` linter. 이게 §2의 지배 규칙을 우리 파이프라인에 적용하는 것이고, **다른 어떤 정형화 항목을 추가하기 전에 먼저 해야 한다.**

**P4. FR이 자유 산문이다.** EARS 5패턴 도입이 비용 대비 효과가 가장 큰 다음 수. 각 `WHEN/WHILE/IF` 절 → 테스트 이름 → review 단계의 자가 검증 항목.

**P5. NFR 표에 측정 방법이 없다.** `| 항목 | 값 | 비고 |`에 Planguage의 SCALE/METER를 붙인다. Goals 섹션은 이미 `<지표명> · <현재값> → <목표값> · <측정방법>` 형식을 쓰고 있으니 같은 규율을 NFR로 확장.

**P6. 적대적 분리 강화.** Chlipala의 두 계약자 실험의 실용 번역. `jira-reviewer`로 부분 구현돼 있으나, 더 강하게 가려면 **수용 기준/테스트를 구현 에이전트에게서 격리**한다. 구현 에이전트가 테스트를 보면 *테스트를 통과시키는 코드*를 짜지 *스펙을 만족하는 코드*를 짜지 않는다.

**P7. 재검증 기록.** 원문 댓글이 짚은 빈틈. "어떤 주장이, 어떤 버전에 대해, 무엇으로 검증됐는지"의 기록. `test-report.template.md`가 근접하지만 요구사항 ID와 연결돼 있지 않다. FR-n ↔ 테스트 ↔ 커밋 SHA를 잇는 것이 완성형.

### 권장 순서

```
P3 (linter)  →  P1 (ADR)  →  P4 (EARS)  →  P5 (NFR 계량)  →  P2 (constitution)  →  P7 (재검증 기록)  →  P6 (적대적 분리)
```

검증기를 먼저 만들고 그다음에 정형화 항목을 늘린다. 순서를 뒤집으면 검증되지 않는 형식이 쌓여 부채가 된다.
