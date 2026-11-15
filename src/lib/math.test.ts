import { describe, expect, it } from 'vitest';
import { estimate1RM, formatPace, paceSecPerUnit } from './math';
import { sessionSeconds } from './math';

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

describe('sessionSeconds', () => {
  const start = 1_000_000;
  const min = 60_000;
  it('runs from start to finish for a normal workout', () => {
    expect(sessionSeconds(start, start + 50 * min, [start + 45 * min])).toBe(3000);
  });
  it('ends at the last set when Finish was tapped much later', () => {
    expect(sessionSeconds(start, start + 14 * 60 * min, [start + 10 * min, start + 55 * min])).toBe(3300);
  });
  it('falls back to start-to-finish when sets have no times', () => {
    expect(sessionSeconds(start, start + 40 * min, [0, 0])).toBe(2400);
  });
});
