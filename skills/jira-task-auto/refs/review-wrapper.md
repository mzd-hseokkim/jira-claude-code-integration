# Review Wrapper 설계 근거

> jira-task-auto SKILL.md의 review 단계 wrapper 설계와 scope shortfall 분기에 대한 배경 설명.

## Wrapper subagent_type을 `general-purpose`로 두는 이유

review wrapper를 `jira-integration:jira-reviewer`로 두면 inner reviewer와 2단 nesting이 발생해 부팅이 두 번 든다. wrapper는 `general-purpose`로 두고 실제 리뷰는 `jira-task-review` Skill 내부에서 자체적으로 띄우는 inner `jira-reviewer` subagent에 맡긴다.

review의 self-praise bias 차단은 `jira-task-review` Skill 내부 `Reviewer Independence Rule`이 담당하므로, wrapper 단계에서 reviewer 페르소나를 강제할 필요가 없다.

## Scope Shortfall 분기 근거

matchRate가 낮거나 Critical이 많으면 scope 자체가 누락된 상태. fix sub-agent 한 번에 부족분을 다 메우기 어렵고, fix loop이 동일하게 실패하며 시간만 소진된다. 이런 경우 사용자가 의식적으로 추가 작업을 결정해야 한다.

따라서:
- matchRate < 70% **또는** Critical ≥ 3 → fix loop 진입 **금지**, 즉시 중단(Scope Shortfall Bail).
- 그 외 → 기존 Trivial Fix Path(최대 2회 자동 수정 루프) 진행.
- 신호 추출 실패(parse error) → fail-safe로 fix loop 진입.
