---
name: dashboard
description: Manage the Jira dashboard server — setup, start, stop, or check status. Use when user types /jira dashboard or /dashboard.
user-invocable: true
argument-hint: "[start|stop|status|setup]"
allowed-tools:
  - Bash
  - Skill
---

# /jira dashboard — Dashboard 관리

이 커맨드는 `jira-integration:jira-dashboard` Skill에 모든 처리를 위임한다.

```
Skill({ skill: "jira-integration:jira-dashboard", args: "<ARGUMENTS>" })
```

ARGUMENTS를 그대로 Skill에 전달하라.
