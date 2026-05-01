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
      {SDLC_STEPS.map((step, idx) => {
        const state = getStepState(step.id, steps);
        const extraProps = justCompleted.has(step.id)
          ? { 'data-just-completed': '' }
          : {};
        const isLast = idx === SDLC_STEPS.length - 1;
        // 연결선 색상: 다음 단계의 상태에 따라. 다음 단계가 done이면 진한 흐름,
        // 그렇지 않으면 흐린 흐름. 현재 단계가 active면 다음 화살표를 부드럽게.
        const nextState = isLast ? null : getStepState(SDLC_STEPS[idx + 1].id, steps);
        // skipped 단계가 양쪽에 끼면 흐름이 끊긴 듯한 dim 톤.
        const isAroundSkipped = state === 'skipped' || nextState === 'skipped';
        const connectorClass = `wt-stepper__connector wt-stepper__connector--${
          isAroundSkipped ? 'pending' :
          state === 'done' && nextState === 'done' ? 'done' :
          state === 'done' || state === 'active' ? 'active' :
          'pending'
        }`;
        return (
          <React.Fragment key={step.id}>
            <li
              className={`wt-stepper__step wt-stepper__step--${state}`}
              title={`${step.label}: ${state}`}
              aria-label={`${step.label}: ${state}`}
              {...extraProps}
            >
              {step.label}
            </li>
            {!isLast && (
              <span
                className={
                  state === 'done' && nextState === 'active'
                    ? 'wt-stepper__connector wt-stepper__connector--chase'
                    : connectorClass
                }
                aria-hidden="true"
              >
                {/* 얇은 라인 + 작은 화살촉. chase 상태에서는 라인이 좌→우로 흐름. */}
                <svg
                  className="wt-stepper__arrow"
                  viewBox="0 0 24 8"
                  preserveAspectRatio="none"
                  width="14"
                  height="8"
                >
                  <line
                    className="wt-stepper__arrow-line"
                    x1="0" y1="4" x2="20" y2="4"
                    stroke="currentColor"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                  />
                  <polyline
                    className="wt-stepper__arrow-head"
                    points="17.5,2 21,4 17.5,6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
