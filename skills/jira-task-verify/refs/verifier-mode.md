# 검증 세션 분기 + Mode A subagent prompt

> jira-task-verify SKILL.md Step 2에서 호출 prompt의 `[verify-self-mode]` 마커 유무로 분기한다.

검증은 구현한 컨텍스트와 **분리된 세션**에서 한다(SD-COM-VER-003). 분리 방식은 두 가지다.

### Mode A: Subagent 위임 (사용자가 main 세션에서 직접 호출)

**조건**: `[verify-self-mode]` 마커가 없다.
**동작**: `Agent` 도구로 `subagent_type: "jira-reviewer"`, `model: "opus"`(L1은 `"sonnet"`)를 명시해 아래 prompt로 위임한다. main 세션은 Step 3 이후(증거 저장·PR·Jira)만 한다.

`Agent` 도구가 없는 harness(Codex 등)에서는 사람이 verify를 새 세션으로 실행한 것이 곧 분리된 세션이다. 이 세션에서 이 태스크의 test-write·impl을 하지 않았으면 Mode B로 진행한다. 했으면 검증하지 말고 "새 세션을 열어 verify를 다시 실행하세요"라고 안내하고 멈춘다. Claude Code에서 Agent 호출이 실패하면 main 세션이 직접 검증하지 않고 멈춘다.

### Mode B: Self-Mode (이미 분리된 wrapper에서 호출)

**조건**: `[verify-self-mode]` 마커가 있다(예: auto가 verify 단계용으로 띄운 sub-agent). 이 wrapper가 이미 새 컨텍스트이므로 추가 Agent 없이 `agents/jira-reviewer.md`의 절차와 출력 형식을 **직접** 따른다. 3단계의 입력 "검사 결과"는 이 wrapper가 실행한 Step 1.5 결과다. 코드를 고치지 않는다.

### Delta Mode (`[verify-delta-mode]` — Mode B 전용)

**조건**: `[verify-self-mode]`와 함께 온다 — auto fix 루프의 재검증. 1회차는 항상 전체 검증이다.
**입력**: 직전 `work/<KEY>/evidence/verification.md`(L1은 context `verifyResult`) + context `fixSelfCheck.files`.
**재검증 범위**: 직전 미충족·미확인 AC 전부, 직전 Critical 전부, `fixSelfCheck.files`의 diff 라인. 검사는 Step 1.5가 매번 다시 실행한다(수정이 다른 AC를 깨뜨렸을 수 있다). 그 밖에 직전에 충족한 AC는 `(직전 검증 승계)`로 표기한다. 직전 검증이 Step 1.5의 검사 실패로 끝났으면 승계할 판정이 없으므로 전체 검증을 한다.
**출력**: 같은 형식. `verify-metrics` 카운트는 승계 + 재검증을 합산한 현재 상태다. review-log에 `deltaReview: true`를 넣는다.

## Mode A — subagent 호출 prompt

```
TASK-ID: <TASK-ID>
등급: <L1|L2|L3>
Base: <PR base — stackedOn.branch 또는 baseBranch>
Worktree: <worktree 절대경로>
Scripts: <플러그인 scripts 절대경로>
수용 조건 출처: <work/<KEY>/spec.md | 아래 L1 AC 목록>
<L1이면 이슈 AC 또는 PR 본문 "변경 내용"을 여기에 붙인다>
test 커밋: <context testWrite.commit | 없음(사유: testWriteSkipped)>
검사 결과: <통과 — `<command>` (<durationSec>초, verify-checks.py) | 명령 없음 — 직접 찾는다>

agents/jira-reviewer.md의 절차(변경 확인 → 수용 조건별 판정 → 검사 실행 → 독립 검증)와 출력 형식을 그대로 따른다.
구현 세션의 설명·Jira 코멘트는 근거로 쓰지 않는다. 파일을 고치지 않는다. 승인 어휘를 쓰지 않는다.
```

**금지**: main 세션이 Agent 없이 직접 검사를 돌리거나 diff를 평가하는 것, `model` 생략.
