import React, { useEffect, useRef, useState } from 'react';
import { SDLC_STEPS, getStepState } from '../constants/sdlc.js';

/**
 * SDLC 9단계 진행 상태를 시각화하는 stepper 컴포넌트.
 * pending → done 전이 시 해당 step에 data-just-completed 속성을 1 tick 부여하여
 * CSS pop-in 애니메이션을 한 번만 발화한다.
 *
 * @param {{ completedSteps?: string[] | null }} props
 */
export default function Stepper({ completedSteps }) {
  const steps = Array.isArray(completedSteps) ? completedSteps : [];
  const prevStepsRef = useRef(steps);
  // Set of step IDs that just became done this render cycle
  const [justCompleted, setJustCompleted] = useState(() => new Set());

  useEffect(() => {
    const prev = prevStepsRef.current;
    const newlyDone = steps.filter(id => !prev.includes(id));
    if (newlyDone.length > 0) {
      const set = new Set(newlyDone);
      setJustCompleted(set);
      // Remove after one animation frame to allow CSS to fire exactly once
      const id = setTimeout(() => setJustCompleted(new Set()), 500);
      prevStepsRef.current = steps;
      return () => clearTimeout(id);
    }
    prevStepsRef.current = steps;
  }, [steps]);

  return (
    <ol className="wt-stepper" aria-label="SDLC progress">
      {SDLC_STEPS.map(step => {
        const state = getStepState(step.id, steps);
        const extraProps = justCompleted.has(step.id)
          ? { 'data-just-completed': '' }
          : {};
        const icon = state === 'done' ? '✓' : state === 'active' ? '⏵' : '·';
        return (
          <li
            key={step.id}
            className={`wt-stepper__step wt-stepper__step--${state}`}
            title={`${step.label}: ${state}`}
            aria-label={`${step.label}: ${state}`}
            {...extraProps}
          >
            <span className="wt-stepper__step-label">{step.label}</span>
            <span className="wt-stepper__step-icon" aria-hidden="true">{icon}</span>
          </li>
        );
      })}
    </ol>
  );
}
