"""redact: 민감정보 redact 모듈.

REDACT_PATTERNS의 각 패턴에 매칭된 부분을 ***REDACTED:<label>*** 으로 치환한다.
Story 2 (append) 및 Story 3 (analyze)에서 import해서 사용.

사용법:
    from review_log.redact import redact
    clean_text = redact(raw_text)
"""

import re

# (label, compiled_pattern) 쌍의 리스트.
# 순서 중요: 더 구체적인 패턴을 먼저 배치하여 generic_secret이 앞 패턴 매치 후
# 남은 부분에만 적용되도록 한다.
REDACT_PATTERNS = [
    (
        "aws_access_key",
        re.compile(r"AKIA[0-9A-Z]{16}"),
    ),
    (
        "aws_secret_key",
        re.compile(
            r'(?i)aws[_-]?secret[_-]?access[_-]?key["\'\s:=]+([A-Za-z0-9/+=]{40})'
        ),
    ),
    (
        "jwt",
        re.compile(
            r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"
        ),
    ),
    (
        "bearer",
        re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"),
    ),
    (
        "github_pat",
        re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}"),
    ),
    (
        "generic_secret",
        re.compile(
            r'(?i)(?:api[_-]?key|secret|password|token)["\'\s:=]+["\']?([A-Za-z0-9+/=_\-]{16,})["\']?'
        ),
    ),
]


def redact(text):
    """민감정보 패턴을 REDACT_PATTERNS 순서대로 치환한다.

    Args:
        text: 처리할 문자열. 비-string이면 그대로 반환 (TypeError 미발생).

    Returns:
        치환된 문자열. 비-string 입력은 입력 그대로 반환.
    """
    if not isinstance(text, str):
        return text

    result = text
    for label, pattern in REDACT_PATTERNS:
        result = pattern.sub(f"***REDACTED:{label}***", result)
    return result
