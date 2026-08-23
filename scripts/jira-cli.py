#!/usr/bin/env python3
"""jira-cli.py — atlassian MCP를 대체하는 Jira Cloud REST CLI (표준 라이브러리만, v0.59.0).

Usage:
    python3 jira-cli.py <subcommand> [args] [--fields f1,f2] [--raw]

Subcommands (MCP 도구 1:1):
    get <KEY>                          이슈 조회 (압축: key/summary/status/issuetype/priority/assignee/parent/labels/description)
    search "<JQL>" [--limit N]         이슈 검색 (압축 목록). JIRA_DEFAULT_PROJECT가 있고 JQL에 project 조건이 없으면 자동 삽입
    comment <KEY> <markdown|-|@file>   코멘트 추가 (markdown → wiki markup 변환, v2 API)
    transitions <KEY>                  가능한 전이 목록 [{id,name}]
    transition <KEY> <id|name>         상태 전이 (name도 허용 — transitions에서 매칭)
    whoami                             {accountId, displayName, email}
    assign <KEY> [accountId|me]        담당자 지정 (기본 me)
    update <KEY> '<fields json>'       fields 부분 갱신 (예: '{"labels":["x"]}', '{"parent":{"key":"MAE-1"}}')
    create '<json>'                    이슈 생성: {"project","summary","issuetype","description"(md),"parent","labels","priority","assignee"}
    link <TYPE> <OUTWARD-KEY> <INWARD-KEY>   이슈 링크 (예: Blocks MAE-1 MAE-2 = MAE-1 blocks MAE-2)
    epic-link <KEY> <EPIC-KEY>         Epic 연결 (parent 필드)
    boards [PROJECT]                   애자일 보드 목록
    sprints <BOARD-ID> [active|future|closed]   스프린트 목록
    projects                           프로젝트 목록
    link-types                         링크 타입 목록
    attach <KEY> <file> [<file>...]    첨부 업로드

Output: 기본 압축 JSON (LLM 소비용 — avatar/self URL/reporter/worklog는 절대 포함하지 않음).
        --fields로 raw 필드 추가, --raw로 API 응답 전체.
Exit:   0 성공 / 1 HTTP 4xx·5xx (stderr: "jira-cli: <code> <reason> — <hint>") / 2 네트워크·인자·자격증명 오류.

자격증명 조회 순서 (jira-attach.sh와 동일):
    1. env JIRA_URL / JIRA_USERNAME / JIRA_API_TOKEN
    2. <cwd 또는 git toplevel>/.mcp.json  → mcpServers.atlassian.env
    3. ~/.claude.json                       → mcpServers.atlassian.env, projects[*].mcpServers.atlassian.env
    4. <repo>/.claude/settings.local.json   → mcpServers.atlassian.env 또는 env
    5. ~/.claude/settings.json              → 동일
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

# ---------------------------------------------------------------- credentials

_CRED_KEYS = ("JIRA_URL", "JIRA_USERNAME", "JIRA_API_TOKEN")


def _git_toplevel() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=5)
        return out.stdout.strip() or None if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def _env_from_mcp_block(obj: dict) -> dict | None:
    srv = (obj.get("mcpServers") or {}).get("atlassian") or {}
    env = srv.get("env") or obj.get("env") or {}
    if all(env.get(k) for k in _CRED_KEYS):
        return {k: env[k] for k in _CRED_KEYS} | {"JIRA_DEFAULT_PROJECT": env.get("JIRA_DEFAULT_PROJECT")}
    return None


def load_credentials() -> dict:
    if all(os.environ.get(k) for k in _CRED_KEYS):
        return {k: os.environ[k] for k in _CRED_KEYS} | {"JIRA_DEFAULT_PROJECT": os.environ.get("JIRA_DEFAULT_PROJECT")}
    home = os.path.expanduser("~")
    roots = [os.getcwd()]
    top = _git_toplevel()
    if top and top not in roots:
        roots.append(top)
    candidates = [os.path.join(r, ".mcp.json") for r in roots]
    candidates.append(os.path.join(home, ".claude.json"))
    candidates += [os.path.join(r, ".claude", "settings.local.json") for r in roots]
    candidates.append(os.path.join(home, ".claude", "settings.json"))
    for path in candidates:
        try:
            with open(path, encoding="utf-8") as f:
                obj = json.load(f)
        except (OSError, ValueError):
            continue
        found = _env_from_mcp_block(obj)
        if found:
            return found
        for proj in (obj.get("projects") or {}).values():
            found = _env_from_mcp_block(proj)
            if found:
                return found
    raise SystemExit("jira-cli: 자격증명을 찾지 못함 (JIRA_URL/JIRA_USERNAME/JIRA_API_TOKEN) — /jira setup 실행")


# ---------------------------------------------------------------- http

class JiraError(Exception):
    def __init__(self, code: int, reason: str, body: str):
        super().__init__(f"{code} {reason}")
        self.code, self.reason, self.body = code, reason, body


_HINTS = {401: "토큰/이메일 확인 (/jira setup)", 403: "권한 없음", 404: "이슈 키/엔드포인트 확인", 400: "요청 필드 확인"}


class Client:
    def __init__(self, creds: dict):
        self.base = creds["JIRA_URL"].rstrip("/")
        token = base64.b64encode(f"{creds['JIRA_USERNAME']}:{creds['JIRA_API_TOKEN']}".encode()).decode()
        self.headers = {"Authorization": f"Basic {token}", "Accept": "application/json"}
        self.default_project = creds.get("JIRA_DEFAULT_PROJECT")

    def request(self, method: str, path: str, body: dict | None = None, query: dict | None = None,
                raw_body: bytes | None = None, extra_headers: dict | None = None):
        url = self.base + path
        if query:
            url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
        headers = dict(self.headers)
        if body is not None:
            headers["Content-Type"] = "application/json"
        if extra_headers:
            headers.update(extra_headers)
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8")
                return json.loads(text) if text.strip() else {}
        except urllib.error.HTTPError as e:
            raise JiraError(e.code, e.reason, e.read().decode("utf-8", "replace")) from None
        except urllib.error.URLError as e:
            raise SystemExit(f"jira-cli: 네트워크 오류 — {e.reason}") from None


# ---------------------------------------------------------------- markdown → wiki

def md_to_wiki(md: str) -> str:
    out, in_code, table_rows = [], False, []

    def flush_table():
        nonlocal table_rows
        if not table_rows:
            return
        header, *rest = table_rows
        out.append("||" + "||".join(header) + "||")
        for r in rest:
            out.append("|" + "|".join(r) + "|")
        table_rows = []

    for line in md.splitlines():
        if line.strip().startswith("```"):
            flush_table()
            if not in_code:
                lang = line.strip()[3:].strip()
                out.append("{code:" + lang + "}" if lang else "{code}")
            else:
                out.append("{code}")
            in_code = not in_code
            continue
        if in_code:
            out.append(line)
            continue
        if re.match(r"^\s*\|.*\|\s*$", line):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                continue  # 구분선 행
            table_rows.append([_inline(c) for c in cells])
            continue
        flush_table()
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            out.append(f"h{len(m.group(1))}. {_inline(m.group(2))}")
            continue
        m = re.match(r"^(\s*)[-*]\s+(.*)$", line)
        if m:
            depth = len(m.group(1)) // 2 + 1
            out.append("*" * depth + " " + _inline(m.group(2)))
            continue
        m = re.match(r"^(\s*)\d+\.\s+(.*)$", line)
        if m:
            depth = len(m.group(1)) // 2 + 1
            out.append("#" * depth + " " + _inline(m.group(2)))
            continue
        if re.fullmatch(r"\s*-{3,}\s*", line):
            out.append("----")
            continue
        out.append(_inline(line))
    flush_table()
    return "\n".join(out)


def _inline(s: str) -> str:
    s = re.sub(r"`([^`]+)`", r"{{\1}}", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"*\1*", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"[\1|\2]", s)
    return s


# ---------------------------------------------------------------- compaction

def _name(obj, key="name"):
    return obj.get(key) if isinstance(obj, dict) else None


def compact_issue(issue: dict, extra_fields: list[str] | None = None) -> dict:
    f = issue.get("fields") or {}
    out = {
        "key": issue.get("key"),
        "summary": f.get("summary"),
        "status": _name(f.get("status")),
        "issuetype": _name(f.get("issuetype")),
        "priority": _name(f.get("priority")),
        "assignee": _name(f.get("assignee"), "displayName"),
        "parent": (f.get("parent") or {}).get("key"),
        "labels": f.get("labels") or [],
    }
    if "description" in f:
        out["description"] = f.get("description") if isinstance(f.get("description"), str) else None
    for k in extra_fields or []:
        out[k] = f.get(k)
    return out


# ---------------------------------------------------------------- commands

_GET_FIELDS = "summary,status,issuetype,priority,assignee,parent,labels,description"
_SEARCH_FIELDS = "summary,status,issuetype,priority,assignee,parent"


def cmd_get(c: Client, a: list[str], opt: dict):
    key = _arg(a, 0, "KEY")
    fields = _GET_FIELDS + ("," + opt["fields"] if opt.get("fields") else "")
    data = c.request("GET", f"/rest/api/2/issue/{key}", query={"fields": fields})
    return data if opt.get("raw") else compact_issue(data, _split(opt.get("fields")))


def cmd_search(c: Client, a: list[str], opt: dict):
    jql = _arg(a, 0, "JQL")
    if c.default_project and not re.search(r"\bproject\s*(=|in)\b", jql, re.I):
        jql = f"project = {c.default_project} AND ({jql})"
    limit = int(opt.get("limit") or 20)
    fields = _SEARCH_FIELDS + ("," + opt["fields"] if opt.get("fields") else "")
    issues, token = [], None
    while len(issues) < limit:
        q = {"jql": jql, "fields": fields, "maxResults": min(50, limit - len(issues))}
        if token:
            q["nextPageToken"] = token
        data = c.request("GET", "/rest/api/3/search/jql", query=q)
        issues += data.get("issues") or []
        token = data.get("nextPageToken")
        if not token or data.get("isLast"):
            break
    if opt.get("raw"):
        return issues
    return [compact_issue(i, _split(opt.get("fields"))) for i in issues[:limit]]


def _read_text_arg(s: str) -> str:
    if s == "-":
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        return sys.stdin.read()
    if s.startswith("@"):
        with open(s[1:], encoding="utf-8") as f:
            return f.read()
    return s


def cmd_comment(c: Client, a: list[str], opt: dict):
    key = _arg(a, 0, "KEY")
    body = md_to_wiki(_read_text_arg(_arg(a, 1, "markdown")))
    data = c.request("POST", f"/rest/api/2/issue/{key}/comment", body={"body": body})
    return {"id": data.get("id"), "created": data.get("created")}


def cmd_transitions(c: Client, a: list[str], opt: dict):
    key = _arg(a, 0, "KEY")
    data = c.request("GET", f"/rest/api/2/issue/{key}/transitions")
    return [{"id": t.get("id"), "name": t.get("name"), "to": _name(t.get("to"))} for t in data.get("transitions") or []]


def cmd_transition(c: Client, a: list[str], opt: dict):
    key, target = _arg(a, 0, "KEY"), _arg(a, 1, "id|name")
    tid = target
    if not target.isdigit():
        match = [t for t in cmd_transitions(c, [key], {}) if t["name"] == target or t["to"] == target]
        if not match:
            raise SystemExit(f"jira-cli: 전이 '{target}' 없음 — transitions {key}로 확인")
        tid = match[0]["id"]
    c.request("POST", f"/rest/api/2/issue/{key}/transitions", body={"transition": {"id": str(tid)}})
    after = c.request("GET", f"/rest/api/2/issue/{key}", query={"fields": "status"})
    return {"key": key, "status": _name((after.get("fields") or {}).get("status"))}


def cmd_whoami(c: Client, a: list[str], opt: dict):
    d = c.request("GET", "/rest/api/2/myself")
    return {"accountId": d.get("accountId"), "displayName": d.get("displayName"), "email": d.get("emailAddress")}


def cmd_assign(c: Client, a: list[str], opt: dict):
    key = _arg(a, 0, "KEY")
    who = a[1] if len(a) > 1 else "me"
    account = cmd_whoami(c, [], {})["accountId"] if who == "me" else who
    c.request("PUT", f"/rest/api/2/issue/{key}/assignee", body={"accountId": account})
    return {"key": key, "assignee": account}


def cmd_update(c: Client, a: list[str], opt: dict):
    key, fields = _arg(a, 0, "KEY"), json.loads(_arg(a, 1, "fields json"))
    if isinstance(fields.get("description"), str):
        fields["description"] = md_to_wiki(fields["description"])
    c.request("PUT", f"/rest/api/2/issue/{key}", body={"fields": fields})
    return {"key": key, "updated": sorted(fields)}


def cmd_create(c: Client, a: list[str], opt: dict):
    spec = json.loads(_read_text_arg(_arg(a, 0, "json")))
    project = spec.get("project") or c.default_project
    if not project:
        raise SystemExit("jira-cli: project 미지정 (JIRA_DEFAULT_PROJECT 또는 \"project\")")
    fields = {"project": {"key": project}, "summary": spec["summary"], "issuetype": {"name": spec["issuetype"]}}
    if spec.get("description"):
        fields["description"] = md_to_wiki(spec["description"])
    if spec.get("parent"):
        fields["parent"] = {"key": spec["parent"]}
    if spec.get("labels"):
        fields["labels"] = spec["labels"]
    if spec.get("priority"):
        fields["priority"] = {"name": spec["priority"]}
    if spec.get("assignee"):
        who = spec["assignee"]
        fields["assignee"] = {"accountId": cmd_whoami(c, [], {})["accountId"] if who == "me" else who}
    d = c.request("POST", "/rest/api/2/issue", body={"fields": fields})
    return {"key": d.get("key"), "id": d.get("id")}


def cmd_link(c: Client, a: list[str], opt: dict):
    ltype, outward, inward = _arg(a, 0, "TYPE"), _arg(a, 1, "OUTWARD-KEY"), _arg(a, 2, "INWARD-KEY")
    c.request("POST", "/rest/api/2/issueLink",
              body={"type": {"name": ltype}, "outwardIssue": {"key": outward}, "inwardIssue": {"key": inward}})
    return {"type": ltype, "outward": outward, "inward": inward}


def cmd_epic_link(c: Client, a: list[str], opt: dict):
    key, epic = _arg(a, 0, "KEY"), _arg(a, 1, "EPIC-KEY")
    c.request("PUT", f"/rest/api/2/issue/{key}", body={"fields": {"parent": {"key": epic}}})
    return {"key": key, "epic": epic}


def cmd_boards(c: Client, a: list[str], opt: dict):
    q = {"projectKeyOrId": a[0]} if a else ({"projectKeyOrId": c.default_project} if c.default_project else None)
    d = c.request("GET", "/rest/agile/1.0/board", query=q)
    return [{"id": b.get("id"), "name": b.get("name"), "type": b.get("type")} for b in d.get("values") or []]


def cmd_sprints(c: Client, a: list[str], opt: dict):
    board = _arg(a, 0, "BOARD-ID")
    state = a[1] if len(a) > 1 else "active"
    d = c.request("GET", f"/rest/agile/1.0/board/{board}/sprint", query={"state": state})
    return [{"id": s.get("id"), "name": s.get("name"), "state": s.get("state"),
             "startDate": s.get("startDate"), "endDate": s.get("endDate")} for s in d.get("values") or []]


def cmd_projects(c: Client, a: list[str], opt: dict):
    d = c.request("GET", "/rest/api/2/project/search", query={"maxResults": 50})
    return [{"key": p.get("key"), "name": p.get("name"), "type": p.get("projectTypeKey")} for p in d.get("values") or []]


def cmd_link_types(c: Client, a: list[str], opt: dict):
    d = c.request("GET", "/rest/api/2/issueLinkType")
    return [{"name": t.get("name"), "inward": t.get("inward"), "outward": t.get("outward")} for t in d.get("issueLinkTypes") or []]


def cmd_attach(c: Client, a: list[str], opt: dict):
    key = _arg(a, 0, "KEY")
    files = a[1:]
    if not files:
        raise SystemExit("jira-cli: 첨부할 파일 경로 필요")
    results = []
    for path in files:
        boundary = uuid.uuid4().hex
        with open(path, "rb") as f:
            content = f.read()
        name = os.path.basename(path)
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\n"
                f"Content-Type: application/octet-stream\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
        d = c.request("POST", f"/rest/api/2/issue/{key}/attachments", raw_body=body,
                      extra_headers={"Content-Type": f"multipart/form-data; boundary={boundary}",
                                     "X-Atlassian-Token": "no-check"})
        results.append({"file": name, "id": (d[0].get("id") if isinstance(d, list) and d else None)})
    return results


COMMANDS = {
    "get": cmd_get, "search": cmd_search, "comment": cmd_comment, "transitions": cmd_transitions,
    "transition": cmd_transition, "whoami": cmd_whoami, "assign": cmd_assign, "update": cmd_update,
    "create": cmd_create, "link": cmd_link, "epic-link": cmd_epic_link, "boards": cmd_boards,
    "sprints": cmd_sprints, "projects": cmd_projects, "link-types": cmd_link_types, "attach": cmd_attach,
}


# ---------------------------------------------------------------- cli plumbing

def _arg(a: list[str], i: int, name: str) -> str:
    if len(a) <= i:
        raise SystemExit(f"jira-cli: 인자 누락 — <{name}>")
    return a[i]


def _split(s: str | None) -> list[str]:
    return [x for x in (s or "").split(",") if x]


def parse_argv(argv: list[str]) -> tuple[str, list[str], dict]:
    if not argv:
        raise SystemExit(__doc__)
    cmd, positional, opt = argv[0], [], {}
    it = iter(argv[1:])
    for tok in it:
        if tok == "--raw":
            opt["raw"] = True
        elif tok in ("--fields", "--limit"):
            opt[tok[2:]] = next(it, None)
        elif tok.startswith("--"):
            raise SystemExit(f"jira-cli: 알 수 없는 옵션 {tok}")
        else:
            positional.append(tok)
    return cmd, positional, opt


def main(argv: list[str]) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    try:
        cmd, a, opt = parse_argv(argv)
        if cmd not in COMMANDS:
            raise SystemExit(f"jira-cli: 알 수 없는 서브커맨드 '{cmd}'\n{__doc__}")
        client = Client(load_credentials())
        result = COMMANDS[cmd](client, a, opt)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except JiraError as e:
        hint = _HINTS.get(e.code, "")
        detail = ""
        try:
            j = json.loads(e.body)
            detail = "; ".join((j.get("errorMessages") or []) + [f"{k}: {v}" for k, v in (j.get("errors") or {}).items()])
        except ValueError:
            detail = e.body[:200]
        print(f"jira-cli: {e.code} {e.reason} — {hint} {detail}".rstrip(), file=sys.stderr)
        return 1
    except SystemExit as e:
        if e.code and not isinstance(e.code, int):
            print(e.code, file=sys.stderr)
            return 2
        raise


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
