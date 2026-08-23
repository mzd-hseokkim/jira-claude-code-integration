# Loop-Engineering 개선 로드맵 — 설계 문서 인덱스

> `tasks/harness-improvement-review.md`(하니스 재평가) 후속. 5개 개선안의 설계 문서 인덱스와 상호 의존 관계.
> 상태: 설계 단계 (전 항목 미구현)

| # | 개선안 | 설계 문서 | 의존 |
|---|---|---|---|
| 1 | auto 오케스트레이션 Workflow 스크립트화 | `auto-workflow-design.md` | — |
| 2 | fix loop 내부 computational sensor 재구성 | `sensor-loop-design.md` | 1 (권장, 필수 아님) |
| 3 | loop 실패 격리 — 중단 대신 격리 후 계속 | `loop-quarantine-design.md` | 1 |
| 4 | 메타 루프 — retro 스킬 (텔레메트리 → 하니스 diff 제안) | `retro-skill-design.md` | 독립 (로그 축적 필요) |
| 5 | L1 fast path — 파이프라인 압축 + Jira 코멘트 배치 | `l1-fastpath-design.md` | 1 |
| 6 | atlassian MCP → `jira-cli.py` 대체 (세션 시작 경쟁 소멸, ToolSearch −1회/단계, 응답 압축) | `jira-cli-design.md` | 독립 |

**구현 순서 권장**: 1 → 2 → 3 → (호출 절감 v0.58.0) → **6** → 5 → 4.
- 6을 5보다 앞에 두는 이유: 6은 외부 의존을 줄이는 안정성 항목이고 실데이터가 필요 없다. 5는 run-log 베이스라인이 쌓이는 동안 기다린다.

**구현 현황 (2026-08-23)**: 1 ✅ v0.52 · run-log ✅ v0.53 · 2 ✅ v0.54 · 3 ✅ v0.55/0.56 · 호출 절감 ✅ v0.58 (impl 27→13회, 태스크 21→13분) · 6 ✅ v0.59~0.61 (jira-cli, 워크스페이스 자격증명) · 5·4 대기.
- 1이 기반: 2·3·5는 스크립트의 분기/프롬프트 수정이라 프롬프트-마크다운 위에 얹는 것보다 절반 비용.
- 4는 로그가 쌓여야 가치가 나오므로 마지막. 단, 4가 요구하는 **텔레메트리 필드 추가**(단계 소요시간 등)는 1~3 구현 시 함께 심는다 — 뒤에 심으면 그만큼 데이터 공백.

---

## graph-engineering 검토 (2026-08, 설계 변경 없음으로 판정)

2026-07 중순 등장한 "graph engineering" 담론(기원은 Steinberger의 조크 트윗, 이후 실질 수렴)을 구현 전 검토한 결과:

- **설계 변경 불필요.** 담론의 수렴 프리미티브 4종(typed state / conditional edge / checkpoint·resume / interrupt)은 1~5번 설계에 이미 전부 대응물이 있다. 핵심 명제 "loop를 노드에 넣는다"는 계층 관계도 2번(fix agent 내부 sensor loop = 노드 안의 loop) 구조와 일치.
- **1번의 기반인 Workflow 도구가 Anthropic Dynamic Workflows** — 커뮤니티가 "동적 그래프"의 공식 구현으로 해석하는 그것이다. 1번 구현 = 담론 기준 최신 구현체 채택.
- CIV 패턴(Coordinator–Implementor–Verifier, 격리 컨텍스트)은 auto–impl–jira-reviewer 구조와 동형. rubber-stamp review 실패 모드의 방어(시스템 밖 증거 = 실제 lint/테스트)는 2번이 담당.
- **유일한 미채택 그래프 요소: 태스크 간 fan-out/join** (서로소 파일군 태스크의 병렬 worktree, 전형적으로 L3 Epic 자식들). merge 순차 rebase 의존 + 토큰 배수 비용(Anthropic 자체 계측 ~15×) 때문에 보류. **트리거 조건**: 3번(격리) 정착 후에도 큐 소진 wall-clock이 병목으로 남을 때 별도 설계.
- 검토 근거 출처: Bouchard "Graph Engineering Explained", Zylos 2026-04/06 리포트(CIV·phase gate), InfoQ/Anthropic Dynamic Workflows 발표, explainx·Ghosh 계층 정리.
