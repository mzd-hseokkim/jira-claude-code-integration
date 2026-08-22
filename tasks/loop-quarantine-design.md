# Loop 실패 격리 (Quarantine) — 설계

> 개선안 3번. `tasks/loop-engineering-roadmap.md` 참조. 의존: 1번 — loop 자체는 무수정이지만, auto의 구조화 반환(status 분류)이 격리 판정의 입력이므로 1번 선행이 전제.
> 상태: 설계 (미구현)

---

## 문제

loop는 태스크 하나가 auto 게이트·merge에서 실패하면 **큐 전체를 즉시 중단**한다 (rebase 충돌만 예외적으로 `deferred` 보류 후 계속). 결과: 밤새 돌릴 수 있는 큐가 앞쪽 태스크 하나에 막히고, 사람이 아침에 실패 1건을 풀어준 뒤 재실행해야 나머지가 돈다 — 사람이 루프 안(in-loop)에 있다.

## 원칙

**태스크-로컬 실패는 격리하고 계속, 시스템 실패만 전체 중단.** 사람의 역할은 배치 끝의 예외 리포트 검토(on-loop)로 이동한다.

## 설계

### 1. deferred 메커니즘 일반화

기존 `deferred: true / deferredReason`(rebase 충돌 전용)을 모든 태스크-로컬 실패로 확장하고, 분류 필드를 추가한다:

```json
{ "deferred": true,
  "deferredKind": "rebase-conflict | scope-shortfall | gate-exhausted | stage-failed | merge-failed",
  "deferredReason": "<한 줄 사유 — auto 반환의 reason/metrics 기반>" }
```

auto(1번 설계)의 구조화 반환 status와 매핑:

| auto/merge 결과 | deferredKind | 루프 동작 |
|---|---|---|
| `scope_shortfall` (matchRate<70 ∨ crit≥3) | scope-shortfall | 격리 후 계속 |
| `fix_exhausted` (fix 2회 소진) | gate-exhausted | 격리 후 계속 |
| `aborted` — impl/test/review 등 단계 실패 | stage-failed | 격리 후 계속 (단, §3 시스템 실패 판정 통과 시) |
| merge 실패 (충돌 등) | merge-failed | 격리 후 계속 |
| rebase 충돌 (기존) | rebase-conflict | 격리 후 계속 (기존 동작 유지) |

기존 재시도 규약 유지: loop 시작 시 `deferred`/`deferredKind`/`deferredReason` 일괄 제거 → 새 run은 전부 재시도.

### 2. 격리 시 뒷정리

격리하고 지나갈 때 다음 run·다음 태스크가 오염되지 않아야 한다:

- **worktree 상태 보존**: 실패 시점의 작업 트리를 건드리지 않는다 (사람이 볼 증거). merge-failed의 경우 `git merge --abort`로 base 브랜치만 원상 복구 — repoRoot의 base가 더러워지면 이후 모든 태스크가 오염되므로 이것만은 필수.
- **rebase 대상 제외**: 격리된 태스크는 2-c 잔여 rebase 목록에서 제외 (기존 deferred와 동일).
- **Jira는 손대지 않는다**: 상태 전이·코멘트 없음. 격리는 로컬 워크플로 상태다.

### 3. 시스템 실패 판정 — 전체 중단이 맞는 경우

태스크-로컬로 위장한 시스템 문제(깨진 base, Jira 인증 만료, MCP 다운)는 격리-계속하면 큐 전체가 무의미하게 소진된다. 판정 규칙 (단순 휴리스틱, JS로 구현 가능):

1. **연속 동일-단계 실패 2건** → 전체 중단. (서로 다른 태스크가 같은 단계에서 연속으로 죽으면 태스크 문제가 아닐 확률이 높다)
2. auto 반환 `failureReason`에 인프라 시그니처(인증 401/403, MCP 연결 실패, base branch checkout 실패)가 있으면 **즉시 전체 중단**. 시그니처 목록은 보수적으로 짧게 시작 — 과잉 매칭이 격리의 가치를 죽인다.
3. 그 외 전부 태스크-로컬.

### 4. 예외 리포트 (Completion Summary 교체)

큐 소진 후 요약을 "처리 N / 보류 M" 카운트에서 **사람의 결정 목록**으로 바꾼다:

```
🔁 Loop 완료 — 통과 <N> / 격리 <M> / 미착수 <K>
─────────────────────────────────────────
✅ 클린 통과 (In Review, 사람 확인만 필요):
   MAE-101  +120/-14, 3 files — <merge 코멘트의 한 줄 요약>
   MAE-103  +8/-2, 1 file — ...
⛔ 격리 — 결정 필요:
   MAE-102  [scope-shortfall] 매칭률 55% — 권장: 부분 수용 merge 또는 worktree에서 추가 구현
   MAE-105  [merge-failed] base 충돌 — 권장: worktree에서 수동 해결 후 loop 재실행
─────────────────────────────────────────
격리 태스크는 사유 해결 후 /jira-task loop 재실행 시 자동 재시도됩니다.
```

- 클린 통과 줄의 수치는 merge 스킬이 이미 계산하는 commit/file/line 카운트를 재사용.
- 격리 줄의 "권장"은 deferredKind별 고정 템플릿 — 기존 auto bail 메시지의 "다음 권장 흐름"을 kind별 한 줄로 압축한 것.

### 5. (옵션, 기본 off) 클린 통과 L1의 auto-done

done 스킬에는 구조적 차단이 없음을 확인했다 (사용자 확인 게이트 없음, merge 후 In Review→Done 전이 가능). 그러나 "merge 후 main에서 사람이 확인"은 의도된 게이트이므로 **기본은 유지**하고, opt-in 플래그만 설계해 둔다:

- `/jira-task loop --auto-done l1`: breakdownLevel L1 **그리고** fix loop 0회 **그리고** Critical 0건인 태스크만 merge 직후 done까지 자동 전이.
- L2+와 fix loop를 거친 태스크는 플래그가 있어도 In Review에 남는다.
- 구현은 후순위 — 격리+예외 리포트가 자리잡아 신뢰가 쌓인 뒤.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `skills/jira-task-loop/SKILL.md` | Step 2-a/2-b 실패 분기: 중단 → 격리 (kind 기록), Step 4 Abort를 시스템 실패 전용으로 축소, Step 3 요약을 예외 리포트로 교체 |
| `skills/jira-task-init/SKILL.md` | 재-init 시 `deferredKind` 보존 (기존 deferred 보존 규칙에 필드 추가) |
| auto 쪽 | 변경 없음 — 1번 설계의 구조화 반환이 이미 kind 판정에 충분 |

## 비목표

- 태스크 병렬 실행 — merge 순서 의존성(순차 rebase)이 있는 한 순차 유지. 격리는 병렬화가 아니라 **불필요한 직렬 차단 제거**다.
- 격리 태스크의 자동 재시도 루프 — 같은 run 안에서 재시도하지 않는다 (사유가 그대로면 무한 루프). 재시도 단위는 사람이 트리거하는 다음 run.

## 검증 계획

- 3태스크 큐에서 2번째를 고의 게이트 실패(스코프 축소) → 1·3번 merge 완료 + 2번 격리 + 예외 리포트 형식 확인.
- 시스템 실패: MCP 자격증명 제거 후 실행 → 첫 태스크에서 즉시 전체 중단 확인 (격리로 오분류되지 않는지).
- 재진입: 격리 상태에서 loop 재실행 → deferred 초기화 → 재시도 확인.
