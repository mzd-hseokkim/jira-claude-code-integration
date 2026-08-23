"""tests/test_jira_cli.py — jira-cli.py 단위 테스트 (HTTP는 mock)

실행: python -m unittest tests.test_jira_cli
"""

import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("jira_cli", REPO_ROOT / "scripts" / "jira-cli.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)  # type: ignore[union-attr]

CREDS = {"JIRA_URL": "https://x.atlassian.net/", "JIRA_USERNAME": "u@x", "JIRA_API_TOKEN": "t", "JIRA_DEFAULT_PROJECT": None}


class MdToWikiTest(unittest.TestCase):
    def test_headings_bold_code_link(self):
        out = m.md_to_wiki("## Title\n**b**: `x` [l](https://e.com)")
        self.assertEqual(out, "h2. Title\n*b*: {{x}} [l|https://e.com]")

    def test_table_drops_separator_and_marks_header(self):
        out = m.md_to_wiki("| a | b |\n|---|---|\n| 1 | 2 |")
        self.assertEqual(out, "||a||b||\n|1|2|")

    def test_code_fence_passthrough(self):
        out = m.md_to_wiki("```bash\n**not bold** `raw`\n```")
        self.assertEqual(out, "{code:bash}\n**not bold** `raw`\n{code}")

    def test_bullets_nested_and_numbered_and_rule(self):
        out = m.md_to_wiki("- a\n  - b\n1. c\n---")
        self.assertEqual(out, "* a\n** b\n# c\n----")


class CompactTest(unittest.TestCase):
    def test_compact_issue_whitelist(self):
        issue = {"key": "K-1", "fields": {"summary": "s", "status": {"name": "Done"}, "issuetype": {"name": "Task"},
                                          "priority": {"name": "P"}, "assignee": {"displayName": "Me", "avatarUrls": {"x": "y"}},
                                          "reporter": {"displayName": "R"}, "parent": {"key": "K-0"}, "labels": ["l"],
                                          "description": "d", "worklog": {"total": 3}}}
        out = m.compact_issue(issue)
        self.assertEqual(out, {"key": "K-1", "summary": "s", "status": "Done", "issuetype": "Task", "priority": "P",
                               "assignee": "Me", "parent": "K-0", "labels": ["l"], "description": "d"})
        self.assertNotIn("reporter", json.dumps(out))


class CredentialsTest(unittest.TestCase):
    def test_env_first(self):
        with mock.patch.dict(os.environ, {"JIRA_URL": "u", "JIRA_USERNAME": "n", "JIRA_API_TOKEN": "t"}):
            c = m.load_credentials()
        self.assertEqual((c["JIRA_URL"], c["JIRA_API_TOKEN"]), ("u", "t"))

    def test_mcp_json_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".mcp.json").write_text(json.dumps(
                {"mcpServers": {"atlassian": {"env": {"JIRA_URL": "m", "JIRA_USERNAME": "n", "JIRA_API_TOKEN": "t",
                                                        "JIRA_DEFAULT_PROJECT": "MAE"}}}}), encoding="utf-8")
            env = {k: v for k, v in os.environ.items() if not k.startswith("JIRA_")}
            with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(os, "getcwd", return_value=tmp), \
                    mock.patch.object(m, "_git_toplevel", return_value=None), \
                    mock.patch.object(os.path, "expanduser", return_value=tmp):
                c = m.load_credentials()
        self.assertEqual(c["JIRA_URL"], "m")
        self.assertEqual(c["JIRA_DEFAULT_PROJECT"], "MAE")


class ContextCredentialsTest(unittest.TestCase):
    def test_context_jira_block_wins_over_mcp_files_and_config_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {k: v for k, v in os.environ.items() if not k.startswith("JIRA_")}
            with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(os, "getcwd", return_value=tmp), \
                    mock.patch.object(m, "_git_toplevel", return_value=tmp), mock.patch.object(m, "_git_main_root", return_value=tmp), \
                    mock.patch.object(os.path, "expanduser", return_value=tmp):
                (Path(tmp) / ".gitignore").write_text(".jira-context.json\n", encoding="utf-8")
                out = m.cmd_config(None, ["set", "https://c.atlassian.net/", "u@c", "tok-1234567890", "MAE"], {})
                self.assertTrue(out["gitignored"])
                shown = m.cmd_config(None, ["show"], {})
                self.assertNotIn("tok-1234567890", json.dumps(shown))
                self.assertEqual(shown["url"], "https://c.atlassian.net")
                # 레거시 .mcp.json이 있어도 context 블록이 우선
                (Path(tmp) / ".mcp.json").write_text(json.dumps({"mcpServers": {"atlassian": {"env": {
                    "JIRA_URL": "legacy", "JIRA_USERNAME": "l", "JIRA_API_TOKEN": "l"}}}}), encoding="utf-8")
                c = m.load_credentials()
        self.assertEqual(c["JIRA_URL"], "https://c.atlassian.net")
        self.assertEqual(c["JIRA_API_TOKEN"], "tok-1234567890")
        self.assertEqual(c["JIRA_DEFAULT_PROJECT"], "MAE")


class CommandTest(unittest.TestCase):
    def _client(self, responses):
        c = m.Client(CREDS)
        calls = []

        def fake(method, path, body=None, query=None, raw_body=None, extra_headers=None):
            calls.append((method, path, body, query))
            return responses.pop(0)

        c.request = fake
        return c, calls

    def test_search_injects_default_project_and_compacts(self):
        c, calls = self._client([{"issues": [{"key": "MAE-1", "fields": {"summary": "s", "status": {"name": "To Do"}}}], "isLast": True}])
        c.default_project = "MAE"
        out = m.cmd_search(c, ["assignee = currentUser()"], {})
        self.assertEqual(calls[0][1], "/rest/api/3/search/jql")
        self.assertEqual(calls[0][3]["jql"], "project = MAE AND (assignee = currentUser())")
        self.assertEqual(out[0]["key"], "MAE-1")

    def test_transition_by_name_resolves_id(self):
        c, calls = self._client([{"transitions": [{"id": "31", "name": "검토 중", "to": {"name": "검토 중"}}]}, {},
                                 {"fields": {"status": {"name": "검토 중"}}}])
        out = m.cmd_transition(c, ["MAE-1", "검토 중"], {})
        self.assertEqual(calls[1][2], {"transition": {"id": "31"}})
        self.assertEqual(out, {"key": "MAE-1", "status": "검토 중"})

    def test_comment_converts_markdown(self):
        c, calls = self._client([{"id": "1", "created": "now"}])
        m.cmd_comment(c, ["MAE-1", "## T\n- x"], {})
        self.assertEqual(calls[0][2], {"body": "h2. T\n* x"})

    def test_http_error_exit_code_and_message(self):
        with mock.patch.object(m, "load_credentials", return_value=CREDS), \
                mock.patch.object(m.Client, "request", side_effect=m.JiraError(401, "Unauthorized", '{"errorMessages":["bad"]}')):
            err = io.StringIO()
            with mock.patch.object(sys, "stderr", err):
                rc = m.main(["get", "MAE-1"])
        self.assertEqual(rc, 1)
        self.assertIn("401 Unauthorized", err.getvalue())

    def test_missing_arg_exit_2(self):
        with mock.patch.object(m, "load_credentials", return_value=CREDS):
            err = io.StringIO()
            with mock.patch.object(sys, "stderr", err):
                rc = m.main(["get"])
        self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
