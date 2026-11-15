import { describe, expect, it } from 'vitest';
import type { PlanWeek } from './db';
import { convertDistance, convertIncrement, convertPlanWeeks, convertPlanWeight, convertWeight } from './units';

describe('unit conversion', () => {
  it('converts logged weights to the nearest 0.5', () => {
    expect(convertWeight(225, 'kg')).toBe(102);
    expect(convertWeight(100, 'lb')).toBe(220.5);
  });
  it('rounds plan weights to something loadable', () => {
    expect(convertPlanWeight(135, 'kg')).toBe(60);
    expect(convertPlanWeight(60, 'lb')).toBe(130);
    expect(convertPlanWeight(2, 'kg')).toBe(2.5);
  });
  it('maps progression steps by convention', () => {
    expect(convertIncrement(5, 'kg')).toBe(2.5);
    expect(convertIncrement(2.5, 'lb')).toBe(5);
  });
  it('converts a plan without touching the original', () => {
    const weeks: PlanWeek[] = [{ range: [1, 1], days: [{ name: 'A', slots: [
      { exerciseName: 'Squat', sets: 3, minReps: 5, maxReps: 5, weight: 225, progression: { kind: 'lp', increment: 5 } },
      { exerciseName: 'Plank', sets: 3, minReps: 60, maxReps: 60, progression: { kind: 'none' } },
    ] }] }];
    const out = convertPlanWeeks(weeks, 'kg');
    expect(out[0].days[0].slots[0]).toMatchObject({ weight: 102.5, progression: { kind: 'lp', increment: 2.5 } });
    expect(out[0].days[0].slots[1].weight).toBeUndefined();
    expect(weeks[0].days[0].slots[0].weight).toBe(225);
  });
  it('converts distances both ways', () => {
    expect(convertDistance(5, 'km')).toBe(8.05);
    expect(convertDistance(10, 'mi')).toBe(6.21);
  });
});
