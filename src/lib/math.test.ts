import { describe, expect, it } from 'vitest';
import { estimate1RM, formatPace, paceSecPerUnit } from './math';

describe('estimate1RM', () => {
  it('returns the weight for a single', () => {
    expect(estimate1RM(225, 1)).toBe(225);
  });
  it('uses Epley for multiple reps', () => {
    expect(estimate1RM(200, 5)).toBeCloseTo(233.3, 1);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.3, 1);
  });
  it('returns 0 for empty sets', () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(135, 0)).toBe(0);
  });
});

describe('pace', () => {
  it('computes and formats pace', () => {
    const p = paceSecPerUnit(30 * 60, 3.1);
    expect(formatPace(p)).toBe('9:41');
  });
  it('handles missing distance', () => {
    expect(paceSecPerUnit(1800, 0)).toBeNull();
    expect(formatPace(null)).toBe('–');
  });
});
