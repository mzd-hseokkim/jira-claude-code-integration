import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Stepper from '../src/components/Stepper.jsx';

describe('Stepper', () => {
  // U14
  it('U14 — 9개 step 순서대로 렌더, 첫 라벨 init / 마지막 done', () => {
    render(<Stepper completedSteps={[]} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(9);
    expect(items[0]).toHaveAttribute('title', 'init');
    expect(items[8]).toHaveAttribute('title', 'done');
  });

  // U15
  it('U15 — done 단계에 --done modifier class', () => {
    render(<Stepper completedSteps={['init']} />);
    const initItem = screen.getByTitle('init');
    expect(initItem.className).toContain('wt-stepper__step--done');
  });

  // U16
  it('U16 — active 단계에 --active modifier class', () => {
    render(<Stepper completedSteps={['init']} />);
    const startItem = screen.getByTitle('start');
    expect(startItem.className).toContain('wt-stepper__step--active');
  });

  // U17
  it('U17 — pending 단계에 --pending modifier class', () => {
    render(<Stepper completedSteps={['init']} />);
    const doneItem = screen.getByTitle('done');
    expect(doneItem.className).toContain('wt-stepper__step--pending');
  });

  // U18
  it('U18 — 컨테이너에 aria-label="SDLC progress"', () => {
    render(<Stepper completedSteps={[]} />);
    expect(screen.getByRole('list', { name: 'SDLC progress' })).toBeInTheDocument();
  });

  // U19
  it('U19 — undefined props 방어: 예외 없음, init이 active', () => {
    render(<Stepper completedSteps={undefined} />);
    const initItem = screen.getByTitle('init');
    expect(initItem.className).toContain('wt-stepper__step--active');
  });

  // U1 (MAE-239): pending → done 전이 시 data-just-completed 속성 부여
  it('U1 — pending→done 전이 시 data-just-completed 부여', async () => {
    const { rerender } = render(<Stepper completedSteps={[]} />);
    // init이 아직 done이 아님
    expect(screen.getByTitle('init')).not.toHaveAttribute('data-just-completed');

    await act(async () => {
      rerender(<Stepper completedSteps={['init']} />);
    });
    // init이 done으로 바뀌어 data-just-completed 부여됨
    expect(screen.getByTitle('init')).toHaveAttribute('data-just-completed');
  });

  // U2 (MAE-239): 동일 completedSteps 재렌더 시 속성 부여 안 함
  it('U2 — 동일 completedSteps 재렌더 시 data-just-completed 없음', async () => {
    const { rerender } = render(<Stepper completedSteps={['init']} />);

    // 속성 제거될 때까지 대기 (500ms timeout)
    await act(async () => {
      await new Promise(r => setTimeout(r, 520));
    });

    // 같은 completedSteps 다시 렌더
    await act(async () => {
      rerender(<Stepper completedSteps={['init']} />);
    });
    expect(screen.getByTitle('init')).not.toHaveAttribute('data-just-completed');
  });
});
