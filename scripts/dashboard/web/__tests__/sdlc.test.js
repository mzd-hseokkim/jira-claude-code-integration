import { describe, it, expect } from 'vitest';
import { getStepState, SDLC_STEPS } from '../src/constants/sdlc.js';

const ALL_STEPS = SDLC_STEPS.map(s => s.id);

// 참고: SDLC_STEPS는 `init`을 제외한 8단계 (start, plan, design, impl, test, review, merge, done).
// `init`은 worktree 존재 자체가 init 완료를 의미하므로 stepper에서 제외.
// payload(`completedSteps`)에 init이 포함되어 있어도 SDLC_STEPS에 없으므로 영향 없음.

describe('getStepState', () => {
  // U1
  it('U1 — done 단계 인식', () => {
    expect(getStepState('start', ['start', 'plan'])).toBe('done');
  });

  // U2
  it('U2 — active 단계 인식 (순차)', () => {
    expect(getStepState('design', ['start', 'plan'])).toBe('active');
  });

  // U3
  it('U3 — pending 단계 인식', () => {
    expect(getStepState('test', ['start', 'plan'])).toBe('pending');
  });

  // U4
  it('U4 — 빈 배열 → start가 active (첫 가시 단계)', () => {
    expect(getStepState('start', [])).toBe('active');
  });

  // U5
  it('U5 — 빈 배열 → 나머지는 pending', () => {
    expect(getStepState('plan', [])).toBe('pending');
  });

  // U6
  it('U6 — undefined 안전', () => {
    expect(getStepState('start', undefined)).toBe('active');
  });

  // U7
  it('U7 — null 안전', () => {
    expect(getStepState('start', null)).toBe('active');
  });

  // U8
  it('U8 — 비배열 안전 (문자열)', () => {
    expect(getStepState('start', 'start')).toBe('active');
  });

  // U9
  it('U9 — 모든 단계 완료 → done step은 done', () => {
    expect(getStepState('done', ALL_STEPS)).toBe('done');
  });

  // U10
  it('U10 — 모든 단계 완료 → start도 done', () => {
    expect(getStepState('start', ALL_STEPS)).toBe('done');
  });

  // U11
  it('U11 — 비순차: start 누락 → start가 active', () => {
    expect(getStepState('start', ['plan'])).toBe('active');
  });

  // U12
  it('U12 — 비순차: plan은 completedSteps에 있으면 done', () => {
    expect(getStepState('plan', ['plan'])).toBe('done');
  });

  // U13
  it('U13 — payload의 init은 무시되고 start가 첫 가시 단계로 취급됨', () => {
    // init은 SDLC_STEPS에 없으므로 completedSteps에 있어도 시각화에 무관
    expect(getStepState('start', ['init'])).toBe('active');
  });

  // U14 — 회귀 방어
  it('U14 — SDLC_STEPS에 init이 포함되지 않음 (시각화 제외)', () => {
    expect(SDLC_STEPS.find(s => s.id === 'init')).toBeUndefined();
    expect(SDLC_STEPS).toHaveLength(8);
    expect(SDLC_STEPS[0].id).toBe('start');
    expect(SDLC_STEPS[7].id).toBe('done');
  });
});
