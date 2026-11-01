# draft PR 생성과 본문 갱신

표준 PR 양식으로 draft PR을 열고, 단계마다 본문을 갱신한다. approach(L2·L3), impl(L1), verify, pr(재생성)이 이 파일을 따른다. 에이전트는 draft를 풀지 않는다 — 리뷰 요청은 작업 담당자가 diff와 검증 결과를 읽고 직접 한다(SD-COM-ROL-005).

## 전제

- 원격(`git remote get-url origin`)과 `gh auth status`가 있어야 한다. 없으면 멈추고 알린다: "기본 브랜치에는 PR로만 반영합니다. 원격 저장소와 gh 로그인을 준비한 뒤 다시 실행하세요." 로컬 병합으로 대신하지 않는다.
- base: context `stackedOn`이 있으면 `stackedOn.branch`, 없으면 context `baseBranch`(없으면 `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`).

## 본문 양식

1. 프로젝트에 `.github/pull_request_template.md`가 있으면 그것, 없으면 플러그인 `templates/sdlc/pull_request_template.md`를 Read한다. HTML 주석은 지우고 절 제목과 순서는 그대로 둔다.
2. 채우는 값:
   - **작업**: 이슈 키(Jira 링크 — `python3 "<scripts>/jira-cli.py" config show`의 `url` + `/browse/<KEY>`), 등급, 위험 신호(context `riskSignals`의 번호마다 양식의 이름까지), 산출물 `work/<KEY>/`(L2·L3), 산출물 승인 기록(승인 전 "대기", 확인 후 `sdlc-gate.py check` 출력의 `url`·`approver`·`sha`), 작성 `<실행 중인 harness — conventions.md "harness 차이">` / 작업 담당자 `@<gh api user -q .login>`.
   - stacked면 작업 절 끝에 한 줄: `이 PR은 #<앞 PR 번호>(<앞 KEY>) 위에 쌓여 있습니다. 앞 PR이 머지되면 base를 <base>로 옮깁니다.`
   - **변경 내용**: L1은 무엇을 왜 바꾸는지 3~5줄(L1의 계획을 대신한다). L2·L3는 spec 요약 2~3줄 + `work/<KEY>/` 링크.
   - **검증**: verify 전에는 "검증 전". verify 뒤에는 결과 한 줄, 직접 확인할 것(실행하지 않은 검사, 미확인 조건, 테스트가 덮지 못한 동작, plan에서 머지 뒤로 미룬 확인 중 머지 판단에 영향이 큰 순서로 5건까지. 없으면 "없음"), 수치 순서로 쓴다. 전체 목록은 verification.md에 둔다. 수치는 L1이면 실행한 검사 명령과 결과, L2·L3면 `work/<KEY>/evidence/verification.md` 링크와 AC 판정 수.
   - **테스트 기대값 변경 / 계획과 달라진 점 / 지속 지식 옮김**: 해당 단계가 남긴 기록. 아직 해당 단계 전이면 "해당 단계 전", 없으면 "없음".
3. 본문은 scratchpad 파일로 쓰고 `--body-file`로 넘긴다.

## 명령

```bash
git push -u origin feature/<KEY>
gh pr view feature/<KEY> --json number,url,isDraft 2>/dev/null   # 있으면 edit, 없으면 create
gh pr create --draft --base <base> --head feature/<KEY> --title "<KEY> <summary>" --body-file <본문 파일>
gh pr edit feature/<KEY> --body-file <본문 파일>
```

PR 제목에는 작업 ID를 넣는다(SD-COM-ART-011). 이미 draft가 풀린 PR(`isDraft=false`)도 본문 갱신은 한다.
