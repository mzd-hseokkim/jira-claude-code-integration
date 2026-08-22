# jira-claude-code-integration — 하니스 개선 검토

> 2026년 6월 7일 기준, 2026년에 표준화된 하니스 엔지니어링 어휘(guides/sensors, ratchet, context reset, meta-harness 등)로 저장소를 재평가한 결과.
> 검토 대상: `mzd-hseokkim/jira-claude-code-integration` (v0.38.0, 2026-05-14)

---

## 총평

**"뒤처졌다"고 보기 어렵다.** 2026년 2~4월에 이름이 붙은 하니스 패턴 상당수(서브에이전트 격리, 훅 파이프라인, ratchet 아티팩트, 지연 컨텍스트 로딩, 관측성, drift 추적)를 그 이전에 이미 독립적으로 구현해 둔 상태다. 아래 개선 항목은 *결함 교정*이라기보다 **표준 어휘로 다시 읽었을 때 더 단단하게 만들 수 있는 지점**들이며, 일부는 이 도구의 스코프(로컬 단일 사용자 / task-specific 하니스)상 굳이 추구할 필요가 없는 것이라 명시적으로 분류했다.

---

## 개선 항목

### 1. 센서가 inferential 쪽으로 치우쳐 있음 — 우선순위: 높음

**현황**
`/jira-task review`가 gap analysis + 코드 품질 판단으로 주로 LLM 기반(inferential sensor)이다. 결정론적이고 빠른 computational sensor(린터·타입체커·테스트)가 명시적 "차단 게이트"로 보이지 않는다. `test` 단계는 있으나 그 결과가 review 진입을 hard-block 하는 구조인지 불명확.

**왜 문제인가**
- Böckeler 프레임의 두 축(guide/sensor × computational/inferential) 중 computational sensor 축이 약하다.
- 실무 권장: 싸고 빠른 computational 센서는 모든 변경마다, 비싼 inferential 센서는 통합 후에만.
- 매번 비싼 LLM 리뷰(opus)를 부르기 전에 lint/type/test로 싸게 걸러내면 토큰 비용·레이턴시가 크게 준다.

**제안**
- `review` 진입 전(또는 `test` 단계 말미) **lint/tsc/unit test 하드 패스 게이트** 추가. 실패 시 review로 못 넘어가게.
- 가능하면 PreToolUse hook 또는 `test` 스킬 내부의 결정론적 종료 코드 체크로 구현.
- 센서 출력은 LLM이 소비하기 좋게(자기 교정 지시 포함한 메시지 형태로) 포맷 — Böckeler가 말한 "긍정적 형태의 prompt injection".

---

### 2. Fresh-context evaluator의 default-FAIL 계약 부재 — 우선순위: 중간

**현황**
`jira-reviewer`를 별도 서브에이전트(opus, forced delegation)로 분리한 점은 좋다(fresh context 채점 정신에 부합). 다만 Anthropic 레퍼런스(`anthropics/cwc-long-running-agents`)의 두 무결성 장치가 명시적으로 박혀 있는지 README상 불확실하다.

**참고: Anthropic 레퍼런스의 두 장치**
- **Default-FAIL 계약**: 모든 판정 기준은 `false`에서 시작, 에이전트는 증거를 먼저 열어야만 통과로 표시 가능.
- **도구 비부여**: 평가자는 Write/Edit 도구 없이, 빌드를 보지 못한 컨텍스트에서 채점.

**제안**
- `agents/jira-reviewer.md`에 default-FAIL 원칙을 한두 줄로 명문화.
- 리뷰어 서브에이전트의 도구 권한에서 Write/Edit 제외 확인.
- 기존 reviewer calibration log(drift 추적)는 per-run 무결성을 보완하는 좋은 각도이므로 유지. (시간축 drift + per-run default-FAIL = 이중 방어)

---

### 3. 이식성(portability) 계층 분리 — 우선순위: 조건부 (Cursor 등 이식 계획이 있을 때만)

**현황**
MCP(mcp-atlassian) 연동과 CLAUDE.md는 이식성이 높지만, commands / skills / hooks / dashboard는 Claude Code 전용이다.

**참고: 이식성 등급**
- 높음: MCP 서버, AGENTS.md/CLAUDE.md, CI 체크
- 낮음: 도구 특화 규칙, 스킬

**제안 (이식 계획이 있을 경우에 한해)**
- 센서 로직(특히 위 1번의 computational gate)을 스킬 프롬프트가 아니라 **도구 비종속 CI 스크립트 / MCP**로 추출.
- 그러면 Claude Code ↔ Cursor 간 전환 시 portable 계층이 그대로 재사용됨.

**이식 계획이 없다면**: 현재 Claude Code 강결합 구조가 정답. 무리한 추상화는 단순성 원칙 위반.

---

### 4. 크레덴셜 격리 — 우선순위: 낮음 / 관망 (스코프상 현재 무관)

**현황**
`JIRA_API_TOKEN`이 환경변수 / `.claude/settings.local.json`에 있고 MCP 서버가 사용. 에이전트 실행 환경에서 도달 가능. (단, 로그 민감필드 자동 redact는 이미 적용되어 위생 의식은 충분)

**참고: 2026 managed-agent 보안 패턴**
토큰을 에이전트 생성 코드가 도는 샌드박스에서 도달 못 하게 하고, MCP는 프록시가 세션 토큰으로 vault에서 크레덴셜을 가져오게 함.

**판단**
이 위협 모델은 **멀티테넌트 호스팅 서비스**에 해당. 로컬 단일 사용자 dev 도구에는 과한 설계. **호스팅/멀티유저로 확장할 때만** 도입.

---

### 5. 메타-하니스 / brain-hands-session 분리 — 우선순위: 관망 (스코프상 무관)

**현황**
Claude Code에 강결합된 모놀리식 task-specific 하니스.

**참고: 2026-04 메타-하니스 사고**
session·harness·sandbox를 교체 가능한 인터페이스로 가상화(Anthropic Managed Agents). "아직 만들어지지 않은 미래의 하니스"를 수용하는 호스팅 런타임 설계.

**판단**
이건 호스팅 런타임 제공자의 문제이지, 특정 워크플로(Jira→PR)를 확실히 돌리는 task-specific 하니스의 목표가 아니다. Anthropic도 task-specific 하니스가 좁은 도메인에서 탁월하다고 명시. **추구 불필요.**

---

## 이미 잘 하고 있어 유지할 것 (회귀 방지용 체크리스트)

- **서브에이전트 격리로 단계 간 컨텍스트 오염 차단** — mid-task 컨텍스트 리셋을 bolt-on 하는 것보다 깔끔. (Opus 4.5+에서 명시적 리셋은 죽은 무게가 됨)
- **Ratchet 규율의 증거**: silent-skip guard(재fetch 검증), MCP 스키마 박제, reviewer calibration log.
- **구조화된 핸드오프**: `.jira-context.json` + smart resume + cache-first fetch.
- **지연 컨텍스트 로딩**: `skills/<name>/refs/` split, heavy SKILL -54% 리팩터, "분량=토큰비용" 명문화.
- **관측성**: 6종 훅 이벤트 → SSE 대시보드, 로그 redact.
- **phase-gate 기본 비활성 + level-aware approach(L1/L2/L3)**: 강제 선형화는 작은 fix에서 죽은 무게가 되므로 유연성 보존이 옳음. "하니스 가정은 상하므로 쳐낸다"는 최신 원칙과 같은 방향. (plan+design → approach 통합도 같은 맥락)

---

## 우선순위 요약

| 순위 | 항목 | 성격 | 트리거 조건 |
|---|---|---|---|
| 1 (높음) | review 앞단 computational gate (lint/type/test 하드 패스) | 비용·레이턴시 절감 | 즉시 |
| 2 (중간) | jira-reviewer에 default-FAIL 계약 + Write/Edit 비부여 명시 | 무결성 강화 | 즉시 |
| 3 (조건부) | 센서 로직을 도구 비종속 계층으로 추출 | 이식성 | Cursor 등 이식 계획 시 |
| 4 (낮음) | 크레덴셜 vault 격리 | 보안 | 호스팅/멀티유저 확장 시 |
| 5 (관망) | 메타-하니스 인터페이스 분리 | 아키텍처 | 해당 없음 (스코프 외) |

---

*검토 근거: Anthropic 엔지니어링 블로그(Effective Harnesses / Harness Design for Long-Running Apps / Scaling Managed Agents), Birgitta Böckeler(Martin Fowler)의 guides·sensors 프레임워크, Addy Osmani의 ratchet 원칙, anthropics/cwc-long-running-agents 레퍼런스 리포.*
