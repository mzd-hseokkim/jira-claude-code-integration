import React from 'react';
import { useCountUp } from '../hooks/useCountUp.js';

/**
 * 0 → value로 카운트업하는 숫자(텍스트 노드). DOM 컨텍스트에서 사용.
 *
 * @param {{ value: number, duration?: number }} props
 */
export default function CountUp({ value, duration = 900 }) {
  const n = useCountUp(value, duration);
  return <>{n}</>;
}
