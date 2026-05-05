/**
 * MAE-333: sessionMatchesWorktree 헬퍼 단위 테스트
 *
 * App.jsx 내부 함수이므로 로직을 복제하여 순수 단위 테스트로 검증.
 * (추후 유틸 모듈로 분리 시 import 경로만 교체하면 됨)
 */
import { describe, it, expect } from 'vitest';

// App.jsx의 sessionMatchesWorktree/normalizePath 로직 미러링
function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function sessionMatchesWorktree(cwd, wtPath) {
  if (!cwd) return false;
  const normCwd = normalizePath(cwd);
  const normWt = normalizePath(wtPath);
  return normCwd === normWt || normCwd.startsWith(normWt + '/');
}

describe('sessionMatchesWorktree (MAE-333)', () => {
  // M1: cwd === wtPath 정확히 일치
  it('cwd가 worktree path와 정확히 일치하면 true', () => {
    expect(sessionMatchesWorktree('/wt/project', '/wt/project')).toBe(true);
  });

  // M2: cwd가 wtPath의 하위 디렉토리
  it('cwd가 worktree path 하위 경로이면 true', () => {
    expect(sessionMatchesWorktree('/wt/project/subdir', '/wt/project')).toBe(true);
  });

  // M3: cwd가 wtPath와 무관한 경로
  it('cwd가 worktree와 무관한 경로이면 false', () => {
    expect(sessionMatchesWorktree('/tmp/other', '/wt/project')).toBe(false);
  });

  // M4: cwd가 null이면 false
  it('cwd가 null이면 false', () => {
    expect(sessionMatchesWorktree(null, '/wt/project')).toBe(false);
  });

  // M5: partial prefix 방어 — "/wt/projectX"는 "/wt/project"의 하위가 아님
  it('partial prefix는 일치로 간주하지 않음 (경로 경계 존중)', () => {
    expect(sessionMatchesWorktree('/wt/projectX', '/wt/project')).toBe(false);
  });

  // M6: Windows 경로 (백슬래시) 정규화
  it('백슬래시 경로도 정규화 후 매칭', () => {
    expect(sessionMatchesWorktree('C:\\wt\\project', 'C:/wt/project')).toBe(true);
  });

  // M7: trailing slash 있는 wtPath — 하위 경로 매칭 방어
  it('worktree path에 trailing slash 없어도 하위 경로 매칭', () => {
    expect(sessionMatchesWorktree('/wt/project/src/foo', '/wt/project')).toBe(true);
  });
});
