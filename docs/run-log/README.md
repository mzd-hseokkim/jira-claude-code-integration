# Run Log Schema & Directory Convention

`docs/run-log/` 디렉터리는 `/jira-task auto`, `/jira-task loop` 실행 결과를 `scripts/append-run-log.py`가 append하는 로그를 저장한다.

---

## 디렉터리 구조

```
docs/run-log/
├── README.md      # 이 파일 — 스키마 명세
└── _index.jsonl    # 집계 인덱스 (실행 1건 당 1줄 append)
```

- `_index.jsonl`: append-only. 각 줄이 `auto` 또는 `loop-run` 실행 1건의 요약 레코드.
- 정본 소스: `scripts/append-run-log.py`의 `build_entry()`. 필드를 변경할 때는 그 함수를 먼저 고치고, 아래 표를 대조해 갱신한다.

---

## `_index.jsonl` 라인 스키마

각 줄은 아래 필드를 포함하는 JSON 객체다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `taskId` | string | Jira 이슈 키 (예: `MAE-453`). `loop-run`이면 `"-"` 허용 |
| `timestamp` | string | ISO8601 UTC, suffix `Z` (기록 시각) |
| `kind` | string | `auto` \| `loop-run` |
| `status` | string \| null | Workflow 반환 `status` (예: `completed`, `aborted`) |
| `failedStage` | string \| null | 실패한 단계명 (성공 시 `null`) |
| `reason` | string \| null | `aborted` 사유 — loop 격리 분류·인프라 시그니처 판정 입력 |
| `stagesRun` | string[] | 실제 수행한 PDCA 단계 목록 (`init` 제외) |
| `skipped` | object | `{ user: string[], pdca: string[] }` — 사용자 지정/오케스트레이터 스킵 단계 |
| `fixAttempts` | integer | inner loop에서 시도한 수정 횟수 |
| `innerLoopIterations` | integer \| null | inner sensor loop 반복 횟수 |
| `breakdownLevel` | string \| null | L1/L2/L3 (`.jira-context.json.breakdownLevel` 우선, 없으면 result 폴백) |
| `metrics` | object \| null | 예: `{ matchRate, criticalCount, warningCount, infoCount }` (review 결과) |
| `stageDurationsSec` | object | 단계별 소요 초. 키는 `start`\|`approach`\|`impl`\|`test`\|`review`, 값은 정수 또는 `null`(측정 불가) |
| `harnessVersion` | string | 기록 시점 `.claude-plugin/plugin.json`의 `version` |
| `quarantined` | boolean \| null | `loop-run` 전용 — 태스크 격리 여부. `auto`에서는 항상 `null` |
| `passed` | boolean \| null | `loop-run` 전용 — 로컬 병합 성공 여부. `auto`에서는 항상 `null` |

### `stageDurationsSec` 계산 규칙

`ctx`(worktree-local `.jira-context.json`)의 `<step>At` 타임스탬프를 단계 순서(`init → start → approach → impl → test → review`)로 인접 차분한다.

- 누락된 단계는 건너뛰고, 그 다음 단계는 마지막으로 확보한 타임스탬프를 기준으로 차분한다.
- 구버전/인라인 패치 폴백 필드 `startedAt`(로컬 시각일 수 있어 신뢰도 낮음)이 쓰인 경우 `start`는 `null`로 기록하고 기준 시각으로도 사용하지 않는다.
- 차분 결과가 음수(시계 불일치)면 `null`로 기록한다.
- `init` 단계 자체는 소요시간을 기록하지 않는다(기준점 역할만).

### 예시

```json
{"taskId": "MAE-453", "timestamp": "2026-08-22T16:32:35Z", "kind": "auto", "status": "completed", "failedStage": null, "reason": null, "stagesRun": ["start", "approach", "impl", "review"], "skipped": {"user": [], "pdca": ["test"]}, "fixAttempts": 0, "innerLoopIterations": null, "breakdownLevel": null, "metrics": {"matchRate": 100, "criticalCount": 0, "warningCount": 0, "infoCount": 2}, "stageDurationsSec": {"start": null, "approach": 563, "impl": 269, "test": 66, "review": 331}, "harnessVersion": "0.52.0", "quarantined": null, "passed": null}
```

---

## 변경 이력

| 날짜 | 변경 내용 |
|---|---|
| 2026-08-23 | 초기 스키마 문서 작성 (MAE-455) |
