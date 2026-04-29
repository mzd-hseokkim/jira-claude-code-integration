---
name: jira-task-review
description: Run code review and gap analysis on changes for a Jira task, then post results to Jira. Compares design document against implementation and reviews code quality. Use when user says "review task", "code review", "jira-task review", "코드 리뷰", "리뷰 해줘", or wants to review changes before completing a task.
user-invocable: false
argument-hint: "<TASK-ID>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Agent
  - mcp__atlassian__jira_get_issue
  - mcp__atlassian__jira_add_comment
---

# jira-task-review: Code Review + Gap Analysis with Jira Reporting

**Language Rule**: 프로젝트 CLAUDE.md의 Conventions 섹션 참고 (한국어 출력, Jira 코멘트 제목은 영어).

## Reviewer Independence Rule (필수)

코드 리뷰 본 작업(Gap Analysis + Lint & Format + Code Quality Review)은 **반드시 `jira-reviewer` subagent에게 위임한다**. main 세션은 절대 직접 리뷰를 수행하지 않는다.

이유: 본 워크플로에서 main 세션이 plan/design/impl을 수행했을 가능성이 높다. 같은 세션이 자기 코드를 리뷰하면 self-praise / 사각지대 누락이 발생한다. 독립된 subagent + 별도 모델로 분리해 리뷰 신뢰도를 확보한다.

**모델 강제**: subagent 호출 시 `model: "opus"`를 명시한다. main 세션이 어느 모델이든 review는 항상 Opus로 수행 (높은 추론 품질 + 일관성).

## Workflow

### Context Optimization

이 스킬에서 `mcp__atlassian__jira_get_issue`를 호출해야 하면 먼저 `.jira-context.json`의 `cachedIssue`를 확인한다 (CLAUDE.md "Issue Cache" 참고). hit이면 호출 생략. miss이면 다음 파라미터로 호출 후 cache 갱신:
- `fields="summary,status,description,issuetype"`
- `comment_limit=0`

### Step 1: Prepare Context (main 세션)

리뷰 컨텍스트를 준비한다 — main 세션이 한다.

```bash
git log --oneline <base-branch>..feature/<TASK-ID>
git diff --name-only <base-branch>..feature/<TASK-ID>
```

설계 문서 존재 여부 확인:
- `docs/design/<TASK-ID>.design.md` 존재? (Gap Analysis 가능 여부)
- `docs/plan/<TASK-ID>.plan.md` 존재? (Acceptance Criteria 참조)

### Step 2: Delegate Review to jira-reviewer Subagent (필수)

**반드시 `Agent` 도구로 `subagent_type: "jira-reviewer"`, `model: "opus"`를 명시하여 호출**한다. main 세션이 직접 Step 2.5 / 3을 수행하는 것을 금지한다.

호출 prompt에 다음 컨텍스트를 명시적으로 전달:

```
TASK-ID: <TASK-ID>
Base branch: <base-branch>
Feature branch: feature/<TASK-ID>
Repo root: <REPO_ROOT 절대경로>

## 작업
다음 4가지를 순서대로 수행하고 결과를 구조화된 형태로 반환:

1. **Gap Analysis**: docs/design/<TASK-ID>.design.md가 있으면 Implementation Plan 항목별로 실제 구현 여부를 Glob/Grep으로 확인하고 매칭률 산출. 없으면 스킵.

2. **Lint & Format Check**: 변경 파일 중 다음 확장자에 대해 lint/format 실행:
   - Node.js (package.json 있을 때): .js/.ts/.jsx/.tsx/.mjs/.cjs → npx eslint, npx prettier --check
   - Python (pyproject.toml/setup.py/requirements.txt 있을 때): .py → ruff check / ruff format --check, 또는 flake8
   - Java/Kotlin (pom.xml/build.gradle 있을 때): .java/.kt/.kts → checkstyle
   변경 파일만 대상, 도구 없으면 스킵, 기존 프로젝트 설정 우선. lint 실패가 있어도 리뷰를 중단하지 않고 정보로 포함.

3. **Code Quality Review**: 변경 파일을 Read해서 보안 취약점(injection/XSS/하드코딩 credentials), 에러 핸들링 누락, 네이밍 일관성, 불필요한 복잡도를 검토.

4. **Compile Findings**: Critical / Warning / Info 3단계로 분류. 파일:라인 참조 포함.

## 출력 형식 (반드시 따를 것)
- 결과: Approve / Request Changes / Needs Discussion 중 하나
- 검토 파일 수, 커밋 수
- Gap Analysis: 매칭률 + 미구현 항목
- Lint & Format: 도구별 표 (대상 파일 수 / 결과 / 주요 이슈)
- Code Quality Findings: Critical / Warnings / Info 분류
- Positive Notes: 잘 된 점

산출물 작성 시 templates/review.template.md를 Read해서 contract(필수/옵셔널 분류, 옵셔널 마커 규약)를 따른다.
```

**금지 사항**:
- `Agent` 호출 없이 main 세션이 Bash로 lint를 직접 실행하는 것 금지
- `Agent` 호출 없이 main 세션이 변경 파일을 Read해서 코드 품질 평가하는 것 금지
- subagent에 `model` 파라미터 생략 금지 (반드시 `"opus"`)

### Step 3: Receive Subagent Result

`Agent` 도구의 반환값을 받는다. 이 결과가 리뷰의 단일 진실이다 (main 세션이 임의로 추가/수정 금지).

만약 subagent 호출이 실패하거나(타임아웃, 권한 거부 등) 결과가 명확히 부족하면, **재시도 또는 사용자에게 보고**. main 세션이 fallback으로 직접 리뷰하지 않는다.

### Step 4: Save Review Report (main 세션)

subagent 반환값을 `docs/review/<TASK-ID>.review.md`에 저장. template contract를 따라 정형화한다.

`templates/review.template.md`를 Read해서 contract(필수: Summary, Gap Analysis, Lint & Format, Code Quality Findings, Positive Notes)를 따른다.

### Step 4.7: Append Review Log (best-effort)

Step 4에서 저장한 review 결과를 `docs/review-log/` 로그에 append한다. 실패는 워크플로를 차단하지 않는다.

> **선행 조건**: Step 3에서 받은 subagent 결과를 `SUBAGENT_RESULT_JSON` 변수(JSON 문자열)에 보관해야 한다.
> subagent 반환값 구조: `{ result: "Approve"|"Request Changes"|"Needs Discussion", findings: [{severity, file, line, category, message}, ...], ... }`

```bash
# Step 4.7: Append Review Log (best-effort)
set +e

TASK_ID="<TASK-ID>"
# reviewerVersion: 이 SKILL.md 자신의 sha256 prefix 12자
# git rev-parse --show-toplevel로 repo root 절대 경로를 얻어 SKILL.md 경로 조합
_GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$_GIT_ROOT" ]; then
    SKILL_MD_PATH="$_GIT_ROOT/skills/jira-task-review/SKILL.md"
else
    echo "⚠️ review-log: git rev-parse 실패, fallback chain 사용"
    SKILL_MD_PATH="$(dirname "${BASH_SOURCE[0]:-$0}")/SKILL.md"
    [ ! -f "$SKILL_MD_PATH" ] && SKILL_MD_PATH="skills/jira-task-review/SKILL.md"
fi
REVIEWER_VERSION=$(shasum -a 256 "$SKILL_MD_PATH" 2>/dev/null | cut -c1-12)
[ -z "$REVIEWER_VERSION" ] && REVIEWER_VERSION="unknown" && echo "⚠️ review-log: reviewerVersion 산출 실패, 'unknown'으로 기록"

# subagent 결과를 임시 파일로 dump (multi-line / 따옴표 안전 처리)
TMPFILE=$(mktemp /tmp/review_subagent_XXXXXX.json)

# SUBAGENT_RESULT_JSON은 Step 3에서 main 세션이 보관한 JSON 문자열
printf '%s' "$SUBAGENT_RESULT_JSON" > "$TMPFILE"

# Python heredoc으로 append 수행
python3 - "$TASK_ID" "$REVIEWER_VERSION" "$TMPFILE" "docs/review-log" <<'PYEOF'
import sys, json, os, tempfile, shutil
from datetime import datetime, timezone

task_id       = sys.argv[1]
reviewer_ver  = sys.argv[2]
subagent_file = sys.argv[3]
log_dir       = sys.argv[4]

# review_log.redact import (scripts/를 PYTHONPATH에 추가)
scripts_dir = os.path.join(os.getcwd(), "scripts")
sys.path.insert(0, scripts_dir)
try:
    from review_log.redact import redact
    redact_import_ok = True
except ImportError:
    def redact(t): return t
    redact_import_ok = False
    print("⚠️ review-log append: redact 모듈 unavailable, redact 미적용")

# subagent 결과 로드
try:
    with open(subagent_file, "r", encoding="utf-8") as f:
        raw = json.load(f)
except (json.JSONDecodeError, FileNotFoundError, OSError) as e:
    # subagent 결과가 비어있거나 파싱 불가 시 빈 dict로 처리
    raw = {}
    print(f"⚠️ review-log append: subagent 결과 파싱 실패 ({e}), 기본값으로 기록")

# outcome 매핑: Approve→pass, Request Changes→fail, Needs Discussion→warn
OUTCOME_MAP = {
    "Approve": "pass",
    "Request Changes": "fail",
    "Needs Discussion": "warn",
}
raw_result = raw.get("result", "")
outcome = OUTCOME_MAP.get(raw_result, "warn")
if raw_result and raw_result not in OUTCOME_MAP:
    print(f"⚠️ review-log append: 알 수 없는 outcome '{raw_result}', 'warn'으로 기록")

# severity 매핑: Critical→critical, Warning→high, Info→info
SEV_MAP = {"Critical": "critical", "Warning": "high", "Info": "info"}

raw_findings = raw.get("findings", []) or []
findings_out = []
sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}

for i, f in enumerate(raw_findings, start=1):
    if not isinstance(f, dict):
        continue
    raw_sev = f.get("severity", "Info")
    mapped_sev = SEV_MAP.get(raw_sev, "info")
    redacted_msg = redact(f.get("message", ""))
    entry_finding = {
        "id": f"F-{i:03d}",
        "severity": mapped_sev,
        "file": f.get("file", ""),
        "line": f.get("line", 0),
        "category": f.get("category", ""),
        "message": redacted_msg,
    }
    findings_out.append(entry_finding)
    if mapped_sev in sev_counts:
        sev_counts[mapped_sev] += 1

timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

entry = {
    "taskId": task_id,
    "timestamp": timestamp,
    "reviewerVersion": reviewer_ver,
    "outcome": outcome,
    "findings": findings_out,
    "severityCounts": sev_counts,
    "falsePositive": None,
    "userOverride": None,
}
if not redact_import_ok:
    entry["redactStatus"] = "import-failed"

os.makedirs(log_dir, exist_ok=True)
per_task_path = os.path.join(log_dir, f"{task_id}.json")
index_path    = os.path.join(log_dir, "_index.jsonl")

# per-task JSON: read-or-init → entries push → temp rename (원자적 swap)
if os.path.exists(per_task_path):
    try:
        with open(per_task_path, "r", encoding="utf-8") as f:
            container = json.load(f)
        if not isinstance(container, dict) or "entries" not in container:
            raise ValueError("entries 키 없음")
    except (json.JSONDecodeError, ValueError, OSError) as e:
        ts_label = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = f"{per_task_path}.corrupt-{ts_label}"
        shutil.copy2(per_task_path, backup_path)
        container = {"schemaVersion": 1, "taskId": task_id, "entries": []}
        print(f"⚠️ review-log append: 기존 per-task JSON 손상, 재초기화 ({e}). 백업: {backup_path}")
else:
    container = {"schemaVersion": 1, "taskId": task_id, "entries": []}

container["entries"].append(entry)

# 원자적 rename으로 저장 (AC-2 truncate 금지 보장)
tmp_fd, tmp_path = tempfile.mkstemp(dir=log_dir, suffix=".tmp")
try:
    with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
        json.dump(container, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, per_task_path)
except OSError:
    os.unlink(tmp_path)
    raise

# _index.jsonl: append-only (POSIX O_APPEND 원자성 의존)
index_line = json.dumps({
    "taskId": task_id,
    "timestamp": timestamp,
    "outcome": outcome,
    "severityCounts": sev_counts,
}, ensure_ascii=False)
with open(index_path, "a", encoding="utf-8") as f:
    f.write(index_line + "\n")

print(f"review-log append 완료: {per_task_path} (entries={len(container['entries'])}), {index_path}")
PYEOF

APPEND_EXIT=$?
rm -f "$TMPFILE" 2>/dev/null
if [ $APPEND_EXIT -ne 0 ]; then
    echo "⚠️ review-log append failed: Python 종료코드 $APPEND_EXIT"
fi

set -e
```

### Step 4.5: Attach Review Report to Jira

저장한 `docs/review/<TASK-ID>.review.md`를 공용 스크립트로 첨부 업로드 (스크립트 위치는 프로젝트 CLAUDE.md "Jira Attach Script" 섹션 참고):

```bash
bash "$JIRA_ATTACH_SH" <TASK-ID> docs/review/<TASK-ID>.review.md
```

출력은 `HTTP 200: <file>` (성공) / 그 외면 실패. 실패 시 로컬 파일 경로 안내 후 계속 진행.

### Step 5: Post Review to Jira

`mcp__atlassian__jira_add_comment`로 리뷰 요약 게시. 본문 끝에 reviewer 정보를 명시:

```
---
Reviewed by jira-reviewer subagent (model: opus)
```

이 서명은 향후 review-log 분석(Phase 1.4)에서 reviewer 식별에 사용된다.

### Step 6: Completion Summary

Approve 시 `.jira-context.json`의 `completedSteps`에 `"review"` 추가 (Request Changes 시 추가하지 않음).

**Approve 시:**
```
---
✅ **Review Complete** — <TASK-ID>

- 결과: Approve
- Reviewer: jira-reviewer subagent (opus)
- 설계-구현 매칭률: <N>%
- 리뷰 파일: <N>개
- Jira 코멘트 게시됨
- Jira 첨부파일 업로드됨 (또는 실패 시 로컬 경로 안내)

**Progress**: init → start → plan → design → impl → test → **review ✓** → merge → pr → done

**Next**: `/jira-task merge <TASK-ID>` — 로컬 병합 후, 메인 레포에서 `/jira-task pr <TASK-ID>`
---
```

**Request Changes 시:**
```
---
⚠️ **Review: Changes Requested** — <TASK-ID>

- 결과: Request Changes
- Reviewer: jira-reviewer subagent (opus)
- 주요 이슈:
  - <Critical/Warning findings>
- Jira 코멘트 게시됨

**Progress**: init → start → plan → design → impl → test → **review ✗** → merge → pr → done

**Next**: 이슈 수정 후 `/jira-task review <TASK-ID>` 재실행
---
```
