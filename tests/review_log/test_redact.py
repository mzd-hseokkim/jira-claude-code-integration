"""단위 테스트: scripts/review_log/redact.py

실행:
    python -m unittest tests.review_log.test_redact
    python -m unittest discover tests
    (레포 루트에서 실행)
"""

import importlib.util
import os
import unittest

# discover 시 tests/review_log가 top-level 패키지 "review_log"로 먼저 등록되어
# scripts/review_log를 가리는 문제를 피하기 위해, sys.path 조작 대신
# 파일 경로에서 직접 모듈을 로드한다.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_REDACT_PATH = os.path.join(_REPO_ROOT, "scripts", "review_log", "redact.py")
_spec = importlib.util.spec_from_file_location("_redact_under_test", _REDACT_PATH)
_redact_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_redact_module)
redact = _redact_module.redact
REDACT_PATTERNS = _redact_module.REDACT_PATTERNS


class TestRedactPatterns(unittest.TestCase):
    """U1~U4, U7, U9: 개별 패턴 매치 검증."""

    def test_u1_aws_access_key(self):
        """U1: AWS Access Key가 redact 됨."""
        text = "AKIAIOSFODNN7EXAMPLE in config"
        result = redact(text)
        self.assertIn("***REDACTED:aws_access_key***", result)
        self.assertNotIn("AKIAIOSFODNN7EXAMPLE", result)

    def test_u2_jwt(self):
        """U2: JWT 토큰이 redact 됨."""
        text = "token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SIG_abc123"
        result = redact(text)
        self.assertIn("***REDACTED:jwt***", result)
        self.assertNotIn("eyJhbGciOiJIUzI1NiJ9", result)

    def test_u3_bearer(self):
        """U3: Bearer 헤더가 redact 됨."""
        text = "Authorization: Bearer abc123xyz"
        result = redact(text)
        self.assertIn("***REDACTED:bearer***", result)
        self.assertNotIn("abc123xyz", result)

    def test_u4_github_pat(self):
        """U4: GitHub PAT가 redact 됨 (ghp_ 접두사)."""
        text = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        result = redact(text)
        self.assertIn("***REDACTED:github_pat***", result)
        self.assertNotIn("ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", result)

    def test_u4_github_pat_variants(self):
        """U4 변형: gho_, ghs_, ghr_ 접두사도 redact 됨."""
        for prefix in ("gho_", "ghs_", "ghr_"):
            with self.subTest(prefix=prefix):
                token = prefix + "a" * 36
                result = redact(token)
                self.assertIn("***REDACTED:github_pat***", result)
                self.assertNotIn(token, result)

    def test_u7_multiple_patterns(self):
        """U7: 같은 텍스트에 AWS key + JWT가 동시에 존재하면 둘 다 redact 됨."""
        text = (
            "key=AKIAIOSFODNN7EXAMPLE "
            "jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SIG_abc123"
        )
        result = redact(text)
        self.assertIn("***REDACTED:aws_access_key***", result)
        self.assertIn("***REDACTED:jwt***", result)
        self.assertNotIn("AKIAIOSFODNN7EXAMPLE", result)
        self.assertNotIn("eyJhbGciOiJIUzI1NiJ9", result)

    def test_u9_short_bearer_token(self):
        """U9: 짧은 Bearer 토큰(1글자)도 매칭됨 — 회귀 방지."""
        text = "Bearer x"
        result = redact(text)
        # 현 정규식은 1+ 길이 매치이므로 redact 되어야 함
        self.assertIn("***REDACTED:bearer***", result)


class TestRedactEdgeCases(unittest.TestCase):
    """U5, U6: edge case 검증."""

    def test_u5_none_input(self):
        """U5: None 입력 시 그대로 반환, 예외 없음."""
        result = redact(None)
        self.assertIsNone(result)

    def test_u5_integer_input(self):
        """U5: 정수 입력 시 그대로 반환, 예외 없음."""
        result = redact(123)
        self.assertEqual(result, 123)

    def test_u6_empty_string(self):
        """U6: 빈 문자열 입력 시 빈 문자열 반환."""
        result = redact("")
        self.assertEqual(result, "")

    def test_u6_no_match(self):
        """U6: 민감정보 없는 일반 텍스트는 변경 없이 반환."""
        text = "hello world"
        result = redact(text)
        self.assertEqual(result, text)


class TestRedactZeroLeak(unittest.TestCase):
    """U8: AC-3 — 민감정보 0건 누출 검증 (zero-leak)."""

    # 6종 민감정보 샘플을 모두 포함한 합성 문자열
    _SENSITIVE_TEXT = (
        "aws_key=AKIAIOSFODNN7EXAMPLE "
        "aws_secret_access_key='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' "
        "jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SIG_abc123 "
        "Authorization: Bearer mytoken.abc.xyz "
        "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa "
        "api_key='supersecretpassword1234567'"
    )

    # 각 패턴의 원본 민감값 (redact 후 남아선 안 되는 부분)
    _SECRETS = [
        "AKIAIOSFODNN7EXAMPLE",
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "eyJhbGciOiJIUzI1NiJ9",  # JWT header
        "mytoken.abc.xyz",
        "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "supersecretpassword1234567",
    ]

    def test_u8_zero_leak(self):
        """U8: redact 결과에 원본 민감정보가 0건 포함됨."""
        result = redact(self._SENSITIVE_TEXT)
        for secret in self._SECRETS:
            with self.subTest(secret=secret[:20] + "..."):
                self.assertNotIn(
                    secret,
                    result,
                    msg=f"민감정보 누출 감지: '{secret[:20]}...' 가 redact 결과에 포함됨",
                )

    def test_u8_redacted_labels_present(self):
        """U8 보조: redact 결과에 REDACTED 라벨이 포함됨 (치환 동작 확인)."""
        result = redact(self._SENSITIVE_TEXT)
        self.assertIn("***REDACTED:", result)


class TestRedactPatternList(unittest.TestCase):
    """REDACT_PATTERNS 구조 검증 — Story 3 analyze에서 열거 가능해야 함."""

    def test_patterns_is_list_of_tuples(self):
        """REDACT_PATTERNS는 (label, compiled_pattern) 튜플 리스트여야 함."""
        import re as re_module
        self.assertIsInstance(REDACT_PATTERNS, list)
        self.assertGreater(len(REDACT_PATTERNS), 0)
        for label, pattern in REDACT_PATTERNS:
            with self.subTest(label=label):
                self.assertIsInstance(label, str)
                self.assertIsInstance(pattern, re_module.Pattern)

    def test_expected_labels_present(self):
        """6종 라벨이 모두 REDACT_PATTERNS에 존재함."""
        labels = {label for label, _ in REDACT_PATTERNS}
        expected = {
            "aws_access_key",
            "aws_secret_key",
            "jwt",
            "bearer",
            "github_pat",
            "generic_secret",
        }
        self.assertEqual(labels, expected)


if __name__ == "__main__":
    unittest.main()
