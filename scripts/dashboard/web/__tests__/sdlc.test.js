import { describe, it, expect } from 'vitest';
import { getStepState, SDLC_STEPS } from '../src/constants/sdlc.js';

const ALL_STEPS = SDLC_STEPS.map(s => s.id);

describe('getStepState', () => {
  // U1
  it('U1 — done 단계 인식', () => {
    expect(getStepState('init', ['init', 'start', 'plan'])).toBe('done');
  });

  // U2
  it('U2 — active 단계 인식 (순차)', () => {
    expect(getStepState('design', ['init', 'start', 'plan'])).toBe('active');
  });

  // U3
  it('U3 — pending 단계 인식', () => {
    expect(getStepState('test', ['init', 'start', 'plan'])).toBe('pending');
  });

  // U4
  it('U4 — 빈 배열 → init이 active', () => {
    expect(getStepState('init', [])).toBe('active');
  });

  // U5
  it('U5 — 빈 배열 → 나머지는 pending', () => {
    expect(getStepState('start', [])).toBe('pending');
  });

  // U6
  it('U6 — undefined 안전', () => {
    expect(getStepState('init', undefined)).toBe('active');
  });

  // U7
  it('U7 — null 안전', () => {
    expect(getStepState('init', null)).toBe('active');
  });

  // U8
  it('U8 — 비배열 안전 (문자열)', () => {
    expect(getStepState('init', 'init')).toBe('active');
  });

  // U9
  it('U9 — 모든 단계 완료 → done step은 done', () => {
    expect(getStepState('done', ALL_STEPS)).toBe('done');
  });

  // U10
  it('U10 — 모든 단계 완료 → init도 done', () => {
    expect(getStepState('init', ALL_STEPS)).toBe('done');
  });

  // U11
  it('U11 — 비순차: start 누락 → start가 active', () => {
    expect(getStepState('start', ['init', 'plan'])).toBe('active');
  });

  // U12
  it('U12 — 비순차: plan은 completedSteps에 있으면 done', () => {
    expect(getStepState('plan', ['init', 'plan'])).toBe('done');
  });

  // U13
  it('U13 — 알 수 없는 단계명 무시: init은 done', () => {
    expect(getStepState('init', ['foo', 'init'])).toBe('done');
  });
});
