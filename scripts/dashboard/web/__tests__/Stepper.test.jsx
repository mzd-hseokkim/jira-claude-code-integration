import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Stepper from '../src/components/Stepper.jsx';

describe('Stepper', () => {
  // step을 aria-label(`<step>: <state>`)로 찾는 헬퍼.
  // chip 스타일 도입으로 title이 "<step>: <state>" 형태로 바뀌었고
  // 자식 span 텍스트만으로는 동일 텍스트가 여러 곳에 잡힐 수 있어 aria-label 우선.
  const findStep = (label, state) => screen.getByLabelText(`${label}: ${state}`);

  // U14
  it('U14 — 8개 step 순서대로 렌더 (init 제외), 첫 라벨 start / 마지막 done', () => {
    render(<Stepper completedSteps={[]} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);
    // 빈 completedSteps이면 start=active, 나머지=pending
    expect(items[0]).toHaveAttribute('aria-label', 'start: active');
    expect(items[7]).toHaveAttribute('aria-label', 'done: pending');
  });

  // U15
  it('U15 — done 단계에 --done modifier class', () => {
    render(<Stepper completedSteps={['start']} />);
    const startItem = findStep('start', 'done');
    expect(startItem.className).toContain('wt-stepper__step--done');
  });

  // U16
  it('U16 — active 단계에 --active modifier class', () => {
    render(<Stepper completedSteps={['start']} />);
    const planItem = findStep('plan', 'active');
    expect(planItem.className).toContain('wt-stepper__step--active');
  });

  // U17
  it('U17 — pending 단계에 --pending modifier class', () => {
    render(<Stepper completedSteps={['start']} />);
    const doneItem = findStep('done', 'pending');
    expect(doneItem.className).toContain('wt-stepper__step--pending');
  });

  // U18
  it('U18 — 컨테이너에 aria-label="SDLC progress"', () => {
    render(<Stepper completedSteps={[]} />);
    expect(screen.getByRole('list', { name: 'SDLC progress' })).toBeInTheDocument();
  });

  // U19
  it('U19 — undefined props 방어: 예외 없음, start가 active', () => {
    render(<Stepper completedSteps={undefined} />);
    const startItem = findStep('start', 'active');
    expect(startItem.className).toContain('wt-stepper__step--active');
  });

  // U20 — payload에 init이 들어있어도 시각화에는 영향 없음 (init은 SDLC_STEPS에서 제외)
  it('U20 — payload에 init이 있어도 첫 가시 단계는 start (active)', () => {
    render(<Stepper completedSteps={['init']} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(findStep('start', 'active')).toBeInTheDocument();
  });

  // U1 (MAE-239): pending → done 전이 시 data-just-completed 속성 부여
  it('U1 — pending→done 전이 시 data-just-completed 부여', async () => {
    const { rerender } = render(<Stepper completedSteps={[]} />);
    // start가 아직 done이 아님 (active)
    expect(findStep('start', 'active')).not.toHaveAttribute('data-just-completed');

    await act(async () => {
      rerender(<Stepper completedSteps={['start']} />);
    });
    // start가 done으로 바뀌어 data-just-completed 부여됨
    expect(findStep('start', 'done')).toHaveAttribute('data-just-completed');
  });

  // U2 (MAE-239): 동일 completedSteps 재렌더 시 속성 부여 안 함
  it('U2 — 동일 completedSteps 재렌더 시 data-just-completed 없음', async () => {
    const { rerender } = render(<Stepper completedSteps={['start']} />);

    // 속성 제거될 때까지 대기 (500ms timeout)
    await act(async () => {
      await new Promise(r => setTimeout(r, 520));
    });

    // 같은 completedSteps 다시 렌더
    await act(async () => {
      rerender(<Stepper completedSteps={['start']} />);
    });
    expect(findStep('start', 'done')).not.toHaveAttribute('data-just-completed');
  });
});
