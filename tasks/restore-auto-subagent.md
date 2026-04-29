# Auto 모드 sub-agent 위임 복원 계획

- **Status**: Draft
- **Created**: 2026-04-29
- **Target**: `skills/jira-task-auto/SKILL.md`
- **Related commits**:
  - `dd69a67` (v0.9.0) sub-agent 도입
  - `d475773` (v0.17.1) sub-agent 제거 — **본 작업으로 사실상 revert**
  - `ccdf3ee` (v0.17.19) review만 sub-agent 강제 위임 부분 복원
  - `89f70c0` (v0.17.20) "메인 컨텍스트 오염 hotfix" — 부모-직접 호출 방식의 부작용 인지

## 배경

v0.9.0에서 auto의 각 단계(start/plan/design/impl/test/review)를 독립 sub-agent로 실행하도록 도입했으나, v0.17.1에서 "sub-agent 베이스 컨텍스트 이중 청구" 진단 하에 부모-직접 호출 방식으로 변경했다. 이 진단은 다음 두 비용을 측정에서 누락했다:

1. **prompt cache의 효과**: sub-agent 베이스 컨텍스트는 5분 TTL 캐시의 1차 후보. 6단계 순차 실행에서 두 번째 호출부터는 cache read 가격(약 1/10). "이중 청구"는 cache miss 1회의 비용이며 누적되지 않는다.
2. **부모 컨텍스트 오염 비용**: 부모-직접 호출 방식은 plan/design/impl/test/review 각 단계의 raw 산출물(MCP 응답, Read·Grep 결과, 코드 본문)이 부모 컨텍스트에 선형 누적된다. 이는 토큰 누적 비용에 더해 instruction drift / self-praise bias / planner-implementer 편향 같은 *품질 저하*를 유발한다 — 토큰 비용으로 환산되지 않는 손실.

v0.17.19에서 review만 sub-agent로 강제 위임한 것은 self-praise bias 인지의 부분 복원. v0.17.20의 "메인 컨텍스트 오염 hotfix"는 부모-직접 호출 방식의 부작용을 명시적으로 인지한 시그널.

## 목표

v0.9.0의 sub-agent 위임 방식을 모든 6단계에 복원하되, v0.17.x 사이클에서 학습한 정교화를 결합:

1. **모든 단계 sub-agent 위임** — 6단계 모두 격리.
2. **페르소나·모델 차등** — 단계별 사고 유형에 맞춘 모델 배정.
3. **반환 계약 표준화** — sub-agent는 부모에게 *최소 요약*만 반환. 산출물 본문은 파일·Jira로만.
4. **review 강제 위임 정책 명문화** — 자기 코드 자기 리뷰를 구조적으로 차단 (v0.17.19 정책 재확인).
5. **측정 가이드 명문화** — 회귀 방지를 위해 "토큰 비용 측정 시 raw vs cache-applied 구분" 지침을 SKILL 또는 task 문서에 기록.

## 변경 사항

### 1. allowed-tools 갱신

```yaml
allowed-tools:
  - Read
  - Edit
  - Agent
  - Skill   # review 자동수정 루프 폴백용으로만 유지 (선택). 가능하면 제거.
```

v0.17.1이 도입한 `Skill` 직접 호출은 원칙적으로 제거. 단, review 자동수정 루프에서 `jira-task-test` / `jira-task-review` 재호출 경로를 sub-agent로 갈지 Skill로 갈지 결정 필요 — 본 계획은 **재호출도 sub-agent로 통일**한다 (격리 일관성). 따라서 `Skill`은 최종 제거.

### 2. Step 2 — Sub-agent 호출 패턴

각 단계를 `Agent` 도구로 위임. 호출 시 다음 표준 계약을 둔다:

**입력 계약 (부모 → sub-agent)**:
- `description`: 짧은 한 줄 ("Jira-task <step> for <TASK-ID>")
- `subagent_type`:
  - review만 `jira-integration:jira-reviewer` (이미 v0.17.19에서 정의됨)
  - 나머지는 `general-purpose` — 각 단계별 SKILL을 내부에서 호출
- `prompt`: 사용자 의도 + Jira 컨텍스트 location + "지정 단계 SKILL을 그대로 호출하고, 결과는 다음 형식으로 부모에 반환하라"는 지시
- `model`: 단계별 차등 (아래 표)

**모델 차등 (커밋 `ccdf3ee`의 review opus 고정과 동일 정책 확장)**:

| 단계 | 모델 | 이유 |
|---|---|---|
| start | haiku | 상태 전이 + 브랜치 셋업. 판단 거의 없음 |
| plan | sonnet | 문서 합성 + 스코프 결정 (opus도 가능, 비용 trade-off) |
| design | opus | 결정·아키텍처. 가장 사고 집약적 |
| impl | sonnet | 코드 생성. 토큰 다량 소비, opus는 비용 비효율 |
| test | sonnet | 실행 + 결과 정리 |
| review | opus | self-praise bias 차단 + 사고 집약적 (v0.17.19 정착) |

**반환 계약 (sub-agent → 부모)**:

```
{
  step: <단계명>,
  result: success | failed,
  artifactPath: <docs/.../<TASK-ID>.<type>.md 등> | null,
  jiraCommentPosted: yes | no,
  nextStepHint: <옵션, sub-agent가 부모에게 전달하고 싶은 다음 단계 권고 1줄>,
  failureReason: <result=failed일 때만, 한 줄>
}
```

부모는 `result`와 `failureReason`만 본다. 산출물 본문은 부모 컨텍스트로 들어오지 않음 (path 추적만).

### 3. Step 3 — Review Quality Gate (수정 루프 sub-agent화)

기존 v0.17.1 방식: 부모가 직접 `Edit`로 review 지적사항 수정 → `Skill`로 test/review 재호출.

변경 후: **수정도 sub-agent에 위임**. 부모는 review 산출물의 *판정 결과만* 보고 다음 sub-agent에 "리뷰 지적사항 반영 후 재테스트·재리뷰"를 통째로 위임.

**자동 수정 루프 (회차별)**:

1. **수정 sub-agent 호출** (`general-purpose`, sonnet — impl과 동일):
   - prompt: "docs/review/<TASK-ID>.review.md를 읽어 Critical/Warning과 Gap Analysis 미충족 항목을 직접 수정. 수정 범위는 리뷰 지적 사항으로 한정. 완료 후 .jira-context.json에서 test/review를 completedSteps에서 제거."
2. **test sub-agent 재호출**.
3. **review sub-agent 재호출** (`jira-integration:jira-reviewer`, opus).
4. completedSteps에 review 추가됐으면 통과, 아니면 다음 회차.

**최대 2회**. 그 후 중단 + 사용자 보고 (현행 유지).

부모 컨텍스트는 review 산출물 path만 추적. 본문은 안 봄.

### 4. 회귀 방지 가이드 (필수)

SKILL 본문 마지막에 다음 한 블록 추가 (또는 별도 docs로):

```markdown
## Design Rationale: Sub-agent Delegation

**왜 sub-agent로 위임하는가**

1. **컨텍스트 격리** — 6단계 raw 산출물(MCP 응답, 코드 본문, 탐색 결과)이 부모에 누적되면 instruction drift 발생.
2. **페르소나 격리** — plan을 짠 인스턴스가 그대로 impl을 하면 합리화 편향. reviewer는 self-praise bias.
3. **모델 차등** — 단계별로 적합한 모델 배정 가능 (sub-agent 모델 override).

**토큰 비용 측정 시 주의**

sub-agent 베이스 컨텍스트는 prompt cache의 1차 대상이다. 측정에서 cache hit 비율을 무시하면 sub-agent가 "더 비싸 보이는" 착시가 발생한다. 회귀 평가 시:

- raw token이 아닌 *청구 token* 기준으로 측정.
- 단일 단계가 아닌 *6단계 풀 사이클* 기준으로 측정.
- 부모-직접 호출 모드의 *컨텍스트 누적 비용*을 함께 측정.

이 지침은 v0.17.1의 토큰 진단 오류(컨텍스트 누적 + 캐시 효과 누락)를 다시 반복하지 않기 위함이다.
```

## 비목표

- jira-reviewer 외의 별도 sub-agent 정의 신설. 본 작업에선 `general-purpose` + 단계별 SKILL 호출 패턴을 사용. 추후 단계별 specialized agent(예: `jira-implementer`, `jira-planner` 부활)는 별도 task.
- merge / pr / done 단계의 sub-agent화 (현행대로 auto 범위 외).
- 모델 차등 비용 분석. 본 계획은 표만 제시, 실측은 별도 task.

## 검증 기준

1. **격리 검증**: auto 실행 후 부모 세션의 컨텍스트 사용량이 단일 단계 분량 + 요약 누적에 머물러야 한다 (모든 raw 산출물이 누적되지 않음).
2. **페르소나 검증**: review 단계가 plan/impl을 수행한 동일 인스턴스에서 실행되지 않아야 한다 (sub-agent 분리 = 자동 보장).
3. **재개 검증**: 중간 단계에서 중단된 task의 auto 재실행 시, completedSteps 기반 skip이 sub-agent 위임 모드에서도 정확히 작동.
4. **회귀 가이드 가시성**: SKILL 본문에 Design Rationale 블록이 포함되어, 차후 누군가 다시 토큰만 보고 제거하려 할 때 즉시 발견 가능.

## Resolved Decisions

- **재호출도 sub-agent로 통일** (Skill 직접 호출 폴백 미사용) — 격리 일관성 우선.
- **review는 `jira-integration:jira-reviewer` 강제** (v0.17.19 정책 재확인). 나머지는 `general-purpose` + 단계별 SKILL.
- **모델 차등 적용**. 단계별 표 위와 같이.
- **반환 계약**: sub-agent는 path/result/요약만 반환, 본문 미반환.
- **버전**: 0.21.0 (auto 동작 모드 변경 — minor bump).
