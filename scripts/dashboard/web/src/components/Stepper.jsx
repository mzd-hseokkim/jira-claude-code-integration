import React from 'react';
import { SDLC_STEPS, getStepState } from '../constants/sdlc.js';

/**
 * SDLC 9단계 진행 상태를 시각화하는 stepper 컴포넌트.
 *
 * @param {{ completedSteps?: string[] | null }} props
 */
export default function Stepper({ completedSteps }) {
  const steps = Array.isArray(completedSteps) ? completedSteps : [];

  return (
    <ol className="wt-stepper" aria-label="SDLC progress">
      {SDLC_STEPS.map(step => {
        const state = getStepState(step.id, steps);
        return (
          <li
            key={step.id}
            className={`wt-stepper__step wt-stepper__step--${state}`}
            title={step.label}
            aria-label={`${step.label}: ${state}`}
          />
        );
      })}
    </ol>
  );
}
