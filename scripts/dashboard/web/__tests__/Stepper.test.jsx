import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
