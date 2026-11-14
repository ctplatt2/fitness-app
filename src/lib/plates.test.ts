import { describe, expect, it } from 'vitest';
import { platesPerSide, smallestStep, warmupRamp } from './plates';

const LB = [45, 35, 25, 10, 5, 2.5];

describe('platesPerSide', () => {
  it('loads a standard bar', () => {
    expect(platesPerSide(135, 45, LB)).toEqual([45]);
    expect(platesPerSide(225, 45, LB)).toEqual([45, 45]);
    expect(platesPerSide(187.5, 45, LB)).toBeNull();
  });
  it('mixes plates to hit odd totals', () => {
    expect(platesPerSide(165, 45, LB)).toEqual([45, 10, 5]);
    expect(platesPerSide(150, 45, LB)).toEqual([45, 5, 2.5]);
  });
  it('returns null when impossible', () => {
    expect(platesPerSide(136, 45, LB)).toBeNull();
    expect(platesPerSide(40, 45, LB)).toBeNull();
  });
  it('knows the smallest step', () => {
    expect(smallestStep(LB)).toBe(5);
    expect(smallestStep([25, 20, 15, 10, 5, 2.5, 1.25])).toBe(2.5);
  });
});

describe('warmupRamp', () => {
  it('ramps up to a heavy working weight', () => {
    expect(warmupRamp(225, 45, 5)).toEqual([
      { weight: 45, reps: 10 },
      { weight: 115, reps: 5 },
      { weight: 160, reps: 3 },
      { weight: 190, reps: 1 },
    ]);
  });
  it('skips the empty bar for lighter weights and dedupes', () => {
    expect(warmupRamp(65, 45, 5)).toEqual([{ weight: 55, reps: 1 }]);
    expect(warmupRamp(45, 45, 5)).toEqual([]);
  });
});
