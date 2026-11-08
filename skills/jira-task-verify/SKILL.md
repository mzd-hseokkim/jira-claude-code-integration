---
name: jira-task-verify
description: "Verifier session: judge each acceptance criterion with evidence in a fresh context, run the project's checks, write evidence/verification.md, and mark the PR ready for the owner's review request. Triggers: jira-task verify, verify task, review task; 검증, 코드 리뷰, 리뷰 해줘."
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
---

# jira-task-verify: 수용 조건별 검증

**공용 규약**: `skills/_shared/conventions.md`를 먼저 Read한다 — 언어, TASK-ID 감지, harness 차이 (한국어 출력, Jira 코멘트 제목은 영어).

## Overview

새 컨텍스트의 검증 세션(역할 `verifier`)이 수용 조건마다 충족 / 미충족 / 미확인을 근거와 함께 판정한다(SD-COM-VER-001·003). 미충족이 있으면 PR은 draft로 남고 리뷰를 요청하지 않는다(VER-002). 통과해도 draft는 사람이 푼다(ROL-005).

검증 세션 분기(Mode A 위임 / Mode B self / Delta)와 subagent prompt는 `Read skills/jira-task-verify/refs/verifier-mode.md`.

## Workflow

### Step 0: 진입 조건과 역할 표시

1. context `completedSteps`에 `impl`이 없으면 멈추고 `/jira-task impl <TASK-ID>`를 안내한다.
2. 역할 표시 (`JIRA_CTX_UPDATE_PY`는 prompt에 경로가 없을 때만 `skills/_shared/script-lookup.md`로 찾는다):
   ```bash
   date +%s   # VERIFY_START — 출력값 기억 (review-log totalSec)
   python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> - - "<worktree>/.jira-context.json" --patch '{"activeRole":"verifier"}'
   ```

### Step 1: 입력 준비 (main 세션)

- 등급: context `level`. base: context `stackedOn.branch` 또는 `baseBranch`.
- 수용 조건: L2·L3는 `work/<TASK-ID>/spec.md`. L1은 `cachedIssue`의 AC(없으면 PR 본문 "변경 내용"의 바뀌는 동작).
- test 커밋: context `testWrite.commit`(rebase 뒤라면 검증 세션이 커밋 메시지로 다시 찾는다), 생략 사유 `testWriteSkipped`.

### Step 1.5: 검사 실행 (스크립트 판정, LLM 검증 전)

검사 통과 여부는 스크립트의 exit code로 정한다. 명령은 프로젝트 `AGENTS.md`가 정한다(표준 ai-kit의 "## 검사").
```bash
python3 "<scripts>/verify-checks.py" "<worktree>" > "<scratchpad>/verify-checks.json"; echo "exit=$?"   # Bash timeout 600000
```
- **exit 0** (`pass`): Step 2로. JSON의 `command`·`durationSec`을 검증 세션에 넘긴다.
- **exit 2** (`none`, 명령 없음): Step 2로. 검증 세션이 기존 방식으로 명령을 찾고, "직접 확인할 것"에 "AGENTS.md에 검사 명령 없음"을 넣는다.
- **exit 1** (`fail`): Step 2를 하지 않는다. `outputTail`을 읽어 원인을 나눈다.
  - **실행 환경 문제**(Docker 미실행, JDK·런타임·bash 없음, 의존성 내려받기·네트워크 실패처럼 코드를 고쳐도 풀리지 않는 것. Bash 도구가 시간 초과로 끊겨 `exit=` 줄이 없을 때도 여기에 넣고 원인을 "검사 시간 초과"로 적는다): 검증이 일어나지 않았으므로 Step 3~5(review-log 포함)를 하지 않고 역할 표시만 지운 뒤(`--patch '{"activeRole":null}'`) 원인 한 줄과 명령을 알리고 멈춘다. "환경을 고친 뒤 `/jira-task verify <TASK-ID>`를 다시 실행하세요". auto wrapper면 result=failed, failureReason="검사 환경 문제: <원인>".
  - **코드 문제**: 아래를 검증 결과로 삼아 Step 3부터 진행한다(결과: 검증 미통과).
    - `verify-metrics`: acTotal=<AC 수>, acMet 0, acUnmet 0, acUnverified=<AC 수>, checksPassed false, criticalCount 1, warningCount 0, infoCount 0. `verify-timings`: checksSec=`durationSec`, 나머지 null.
    - 수용 조건별 판정: 모두 "미확인 — 검사 실패로 판정하지 않음". 실행한 검사: 명령, exit code, 실패한 task·테스트 이름과 메시지(5줄 이내). 독립 검증 Critical 1건: "검사 실패: <요약>". 직접 확인할 것: "검사 실패 — 수용 조건 판정 전".
    - auto `unmet`: 실패한 task·테스트마다 한 줄씩 `검사 실패: <task·테스트 이름> — <메시지>` (수정 agent가 이것만 보고 고친다).
    - review-log findings: `[{"severity":"Critical","file":"<실패 위치 | 빈 값>","line":0,"category":"checks","message":"검사 실패: <요약>"}]`.
    - 서명 줄: `Checked by verify-checks.py (검사 실패로 LLM 검증 생략)`.

### Step 2: 검증 (Mode A / Mode B)

Step 1.5가 `pass`·`none`일 때만 한다. `refs/verifier-mode.md`대로 분기한다. 결과(`verify-metrics` 블록 + 본문)가 검증의 단일 출처다 — main 세션이 판정을 고치거나 덧붙이지 않는다. subagent가 실패하면 재시도하거나 사용자에게 알린다(main 세션이 대신 검증하지 않는다).

### Step 3: 증거 저장

- **L2·L3**: 플러그인 `templates/sdlc/verification.md`를 Read해 `work/<TASK-ID>/evidence/verification.md`를 쓴다(표준 사본 표시·안내 주석은 지운다). "수용 조건별 판정" 표, "실행한 검사"(명령과 결과 요약), "독립 검증"(양식대로 목록 한 줄씩: `- [Critical|Warning] <파일:라인> — <요약>. 처리: <작업 담당자 판단 대기 | 수정함 | 후속 이슈>`)에 결과를 옮긴다. `verify-metrics`·`verify-timings` 블록은 파일 맨 위에 그대로 두고, 제목 바로 아래에 "결과"와 "직접 확인할 것"을 둔다. 화면 캡처 등은 같은 `evidence/`에 둔다.
  ```bash
  # 재검증(fix 루프, base 충돌 해결 뒤)이면 기존 verification.md를 새 결과로 덮어쓰고 새 커밋으로 남긴다
  git add work/<TASK-ID>/evidence/
  git commit -m "docs(<TASK-ID>): verification"
  git push
  ```
- **L1**: 파일을 만들지 않는다. 결과는 PR 본문 "검증"과 context `verifyResult`에 남긴다.

### Step 4: review-log 기록 (생략 금지, 실패만 비차단)

```bash
date +%s   # VERIFY_END
set +e
SUBAGENT_RESULT_JSON='{"result":"<검증 통과|검증 미통과>","findings":[{"severity","file","line","category","message"}...],"timings":{"acSec":..,"checksSec":..,"qualitySec":..,"totalSec":<END-START>}}' \
  bash "<scripts>/append-review-log-wrapper.sh" "<TASK-ID>"
set -e
```
실패해도 계속한다. Delta 재검증이면 JSON에 `"deltaReview":true`.

### Step 5: PR·Jira 반영

1. `Read skills/_shared/pr-body.md` 후 PR 본문 "검증"을 갱신한다(L1은 검사 명령과 결과, L2·L3는 verification.md 링크와 AC 판정 요약).
2. Jira:
   ```bash
   python3 "<scripts>/jira-cli.py" attach <TASK-ID> work/<TASK-ID>/evidence/verification.md --artifact   # L2·L3
   python3 "<scripts>/jira-cli.py" comment <TASK-ID> @<scratchpad md>
   ```
   ```markdown
   ## Verification
   - 결과: 검증 통과 | 검증 미통과
   - 직접 확인할 것: <머지 판단에 영향이 큰 1~3건 | 없음>
   - 수용 조건: 충족 <n> / 미충족 <n> / 미확인 <n>
   - 검사: <명령> <통과 | 실패 n건>
   - 주요 findings: <Critical/Warning 1건 요약 | 없음>
   - PR: <URL> (draft)

   ---
   Verified by jira-reviewer <subagent | self-mode> (harness: <실행 중인 harness>, model: <정식 모델 ID>)
   ```
   끝의 서명 줄은 review-log 분석이 검증 주체를 식별하는 데 쓴다. Mode A는 `subagent`, Mode B(`[verify-self-mode]`)는 `self-mode`. Step 1.5에서 검사 실패로 끝났으면 그 단계의 서명 줄을 쓴다.

### Step 6: context와 완료 요약

검증 통과일 때만 `verify`를 기록한다. 어느 쪽이든 역할 표시는 지운다.

```bash
python3 "$JIRA_CTX_UPDATE_PY" <TASK-ID> verify "-" \
    "<worktree>/.jira-context.json" "<repoRoot>/.jira-context.json" \
    --patch '{"activeRole":null,"verifyResult":{"result":"검증 통과","acMet":<n>,"acTotal":<n>,"acUnverified":<n>}}'
# 미통과: step 자리에 "-"를 주고 같은 patch(result만 "검증 미통과")
```

**검증 통과:**
```
---
✅ **리뷰 요청 준비됨** — <TASK-ID>

- 직접 확인할 것: <머지 판단에 영향이 큰 1~3건 | 없음>
- 수용 조건: <n>/<n> 충족 (미확인 <n> — 사유는 verification.md)
- 검사: <명령> 통과
- PR: <URL> (draft)

diff와 검증 결과를 직접 확인한 뒤 draft를 풀어 리뷰를 요청하세요: `gh pr ready <번호>`
머지는 코드 오너가 합니다. 머지된 뒤 `/jira-task done <TASK-ID>`(또는 `loop sync`)가 Jira를 완료로 옮깁니다.

**Progress**: init → start → approach(L2·L3) → test-write → impl → **verify ✓** → pr → done
---
```

**검증 미통과:**
```
---
⚠️ **검증 미통과** — <TASK-ID>

- 미충족: AC-02 <요약> …
- Critical: <요약>
- 미충족 조건이 있어 PR을 draft로 둡니다

**Next**: `/jira-task impl <TASK-ID>`로 고친 뒤 `/jira-task verify <TASK-ID>`. 테스트가 틀렸다는 판단이면 사유를 남기고 `/jira-task test-write <TASK-ID>`.
---
```
