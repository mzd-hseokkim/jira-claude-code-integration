# Review Log Schema & Directory Convention

`docs/review-log/` 디렉터리는 `/jira-task review` 단계에서 생성하는 구조화된 리뷰 로그를 저장한다.

**schemaVersion**: 1

---

## 디렉터리 구조

```
docs/review-log/
├── README.md          # 이 파일 — 스키마 명세 및 디렉터리 규약
├── _index.jsonl       # 집계 인덱스 (Story 2에서 작성)
└── <TASK-ID>.json     # per-task 리뷰 로그 (예: MAE-179.json)
```

- `<TASK-ID>.json`: 이슈 키 1건 당 1파일. 동일 이슈를 재리뷰 시 덮어씀.
- `_index.jsonl`: 각 줄이 per-task 요약 레코드 (Story 2에서 append 로직 구현).

---

## per-task JSON 스키마

파일명: `docs/review-log/<TASK-ID>.json`

### 필수 필드

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `taskId` | string | `^[A-Z][A-Z0-9_]+-\d+$` | Jira 이슈 키 (예: `MAE-179`) |
| `timestamp` | string | ISO8601 UTC, suffix `Z` 필수 | 리뷰 생성 시각 (예: `2026-04-29T08:30:00Z`) |
| `reviewerVersion` | string | Story 2.3(MAE-186)에서 해시로 산출 | 리뷰어 버전 식별자 |
| `outcome` | string | enum: `pass` \| `fail` \| `warn` | 리뷰 종합 결과 |
| `findings` | array | `Finding[]` — 아래 항목 스키마 참조 | 리뷰 지적 사항 목록 |
| `severityCounts` | object | `{ critical, high, medium, low, info }` — 모두 정수 | 심각도별 finding 집계 |
| `falsePositive` | null \| object | Phase 3 확장용. 본 Phase는 항상 `null` | 오탐 정보 |
| `userOverride` | null \| object | Phase 3 확장용. 본 Phase는 항상 `null` | 사용자 재정의 정보 |

### Finding 항목 스키마 (`findings[*]`)

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | string | 예: `F-001` | finding 고유 ID (파일 내 단조 증가) |
| `severity` | string | enum: `critical` \| `high` \| `medium` \| `low` \| `info` | 심각도 |
| `file` | string | 레포 루트 기준 상대 경로 | 지적 대상 파일 |
| `line` | integer | 1-based | 지적 대상 줄 번호 |
| `category` | string | 자유 (예: `security`, `style`, `bug`) | 지적 분류 |
| `message` | string | redact 적용 후 본문 | 지적 내용. 민감정보 redact 후 저장 |

### 예시

```json
{
  "taskId": "MAE-179",
  "timestamp": "2026-04-29T08:30:00Z",
  "reviewerVersion": "abc123def456",
  "outcome": "warn",
  "findings": [
    {
      "id": "F-001",
      "severity": "medium",
      "file": "scripts/review_log/redact.py",
      "line": 42,
      "category": "style",
      "message": "함수 docstring 누락"
    }
  ],
  "severityCounts": {
    "critical": 0,
    "high": 0,
    "medium": 1,
    "low": 0,
    "info": 0
  },
  "falsePositive": null,
  "userOverride": null
}
```

---

## `_index.jsonl` 라인 스키마 (참조용 — 작성은 Story 2)

`_index.jsonl`의 각 줄은 아래 필드를 포함하는 JSON 객체다:

| 필드 | 타입 | 설명 |
|---|---|---|
| `taskId` | string | Jira 이슈 키 |
| `timestamp` | string | ISO8601 UTC |
| `outcome` | string | `pass` \| `fail` \| `warn` |
| `severityCounts` | object | `{ critical, high, medium, low, info }` |

---

## 민감정보 보안 정책

- **저장 전 redact 필수**: `findings[*].message`를 포함한 모든 텍스트 필드는 `scripts/review_log/redact.redact()` 함수를 거쳐 저장.
- **redact 대상**: AWS Access/Secret Key, JWT, Bearer 토큰, GitHub PAT, 일반 API key/secret/password/token 패턴.
- **검증**: `tests/review_log/test_redact.py`의 `TestRedactZeroLeak` 단위 테스트가 민감정보 0건 저장을 보장.

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|---|---|---|
| 1 | 2026-04-29 | 초기 스키마 정의 (Story 1, MAE-179) |
