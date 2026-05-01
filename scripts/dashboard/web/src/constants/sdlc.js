/**
 * SDLC 9단계 정의.
 * @type {ReadonlyArray<{id: string, label: string}>}
 */
export const SDLC_STEPS = Object.freeze([
  { id: 'init',   label: 'init'   },
  { id: 'start',  label: 'start'  },
  { id: 'plan',   label: 'plan'   },
  { id: 'design', label: 'design' },
  { id: 'impl',   label: 'impl'   },
  { id: 'test',   label: 'test'   },
  { id: 'review', label: 'review' },
  { id: 'merge',  label: 'merge'  },
  { id: 'done',   label: 'done'   },
]);

/**
 * 특정 SDLC 단계의 상태를 반환한다.
 *
 * - completedSteps에 포함된 단계 → "done"
 * - completedSteps에 없는 첫 번째 단계 → "active"
 * - 그 이후 단계 → "pending"
 *
 * @param {string} stepId - 조회할 단계 ID
 * @param {string[] | null | undefined} completedSteps - 완료된 단계 목록
 * @returns {"done" | "active" | "pending"}
 */
export function getStepState(stepId, completedSteps) {
  const completed = Array.isArray(completedSteps) ? completedSteps : [];

  // 이 단계가 이미 완료됐으면 done
  if (completed.includes(stepId)) return 'done';

  // SDLC_STEPS 순서대로 첫 미완 단계를 찾는다
  const firstIncomplete = SDLC_STEPS.find(s => !completed.includes(s.id));

  // 첫 미완 단계가 현재 단계면 active, 아니면 pending
  return firstIncomplete?.id === stepId ? 'active' : 'pending';
}
