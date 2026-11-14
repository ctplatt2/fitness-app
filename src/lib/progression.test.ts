import { describe, expect, it } from 'vitest';
import type { PlanSlot } from './db';
import { nextTarget, roundToStep } from './progression';

const lp: PlanSlot = { exerciseName: 'Squat', sets: 3, minReps: 5, maxReps: 5, weight: 185, progression: { kind: 'lp', increment: 5 } };
const dp: PlanSlot = { exerciseName: 'Curl', sets: 3, minReps: 8, maxReps: 12, weight: 25, progression: { kind: 'dp', increment: 5, minReps: 8, maxReps: 12 } };
const none: PlanSlot = { exerciseName: 'Row', sets: 3, minReps: 10, maxReps: 10, weight: 100, progression: { kind: 'none' } };

const sets = (weight: number, ...reps: number[]) => reps.map((r) => ({ weight, reps: r, done: true }));

describe('nextTarget', () => {
  it('uses the plan numbers with no history', () => {
    expect(nextTarget(lp, undefined)).toEqual({ weight: 185, minReps: 5, maxReps: 5 });
  });
  it('linear: adds weight when all sets hit reps', () => {
    expect(nextTarget(lp, sets(185, 5, 5, 5)).weight).toBe(190);
  });
  it('linear: repeats the weight when a set is missed', () => {
    expect(nextTarget(lp, sets(185, 5, 5, 4)).weight).toBe(185);
  });
  it('linear: ignores warm-ups and sets not marked done', () => {
    const last = [{ weight: 95, reps: 5, done: true, type: 'warmup' as const }, ...sets(185, 5, 5), { weight: 185, reps: 5, done: false }];
    expect(nextTarget(lp, last).weight).toBe(185);
  });
  it('double: climbs reps before weight', () => {
    expect(nextTarget(dp, sets(25, 10, 9, 8))).toEqual({ weight: 25, minReps: 9, maxReps: 12 });
  });
  it('double: adds weight and resets reps at the top of the range', () => {
    expect(nextTarget(dp, sets(25, 12, 12, 12))).toEqual({ weight: 30, minReps: 8, maxReps: 12 });
  });
  it('none: keeps the plan weight', () => {
    expect(nextTarget(none, sets(110, 10, 10, 10)).weight).toBe(100);
  });
  it('rounds to the plate step', () => {
    expect(roundToStep(187.5, 5)).toBe(190);
    expect(roundToStep(61.3, 2.5)).toBe(62.5);
  });
});
