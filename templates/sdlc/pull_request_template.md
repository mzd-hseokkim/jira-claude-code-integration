<!-- 표준 사본: mzd-software-development-standard 00-ai-native-sdlc-process v0.9.1b, templates/.github/pull_request_template.md (f9284ef). 이 줄은 플러그인 보관 표시라 산출물에 옮길 때 지운다. 플러그인 유지보수: 사본은 고치지 말고 표준이 바뀌면 통째로 교체. -->
<!--
.github/pull_request_template.md 로 복사해 씁니다.
PR 제목에 작업 ID를 넣습니다 (SD-COM-ART-011).
-->

## 작업

- 이슈: <작업 ID>
- 등급: L1 | L2 | L3
- 위험 신호: 없음 | ① DB 스키마·데이터 모델 ② 외부 API 계약 ③ 트랜잭션 경계·동시성·멱등성 ④ 인증·권한·개인정보 ⑤ ADR이 필요한 결정 (SD-COM-GAT-002)
- 산출물: `work/<작업 ID>/` (L2·L3)
- 산출물 승인 기록: <승인 코멘트 링크> (L2·L3. 승인자 계정과 대상 커밋이 있는 기록, SD-COM-GAT-005)
- 작성: <에이전트 도구> / 작업 담당자: @

## 변경 내용

## 검증

L1은 실행한 검사 명령과 결과를 여기에 붙입니다. L2·L3는 `evidence/verification.md`를 링크하고 미충족이 없는지 확인합니다 (SD-COM-VER-001·002, TA-COM-AGT-004).

```text
$ <검사 명령>
<결과>
```

## 테스트 기대값 변경

기대값을 바꾼 테스트가 있으면 바뀐 기대값마다 근거를 적습니다 (TA-COM-AGT-003). 없으면 "없음".

## 계획과 달라진 점

`plan.md` 결정 기록에 남긴 내용을 요약합니다 (SD-COM-ART-007). 없으면 "없음".

## 공통 문서에 옮긴 내용

이 작업에서 바뀐 정책·용어·상태와 불변식·구조·설계 결정을 옮긴 공통 문서를 적습니다 (SD-COM-ART-008). 없으면 "없음".

- [ ] 정책 → `docs/policies/`
- [ ] 새 용어 → `docs/glossary.md`
- [ ] 상태·불변식 → `docs/domain/`
- [ ] 구조 → `docs/architecture/`
- [ ] 설계 결정 → `docs/decisions/` (ADR)
