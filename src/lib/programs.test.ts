import { describe, expect, it } from 'vitest';
import type { Program } from './db';
import { parsePlan } from './plan-parser';
import { isPlanComplete, matchesPlanCardio, upcomingDays } from './programs';

const plan = (text: string, cursor: Program['cursor']): Program => ({ name: 'P', sourceText: text, weeks: parsePlan(text).weeks, createdAt: 0, cursor, active: true });
const TWO_WEEKS = '# P\n## Week 1\n### A\nSquat / 3x5\n### B\nRun / 30 min\n## Week 2\n### A\nSquat / 3x5\n';
const LOOPING = '# P\n### A\nSquat / 3x5\n### B\nBench Press / 3x5\n';

describe('isPlanComplete', () => {
  it('is false during the plan and true past its last week', () => {
    expect(isPlanComplete(plan(TWO_WEEKS, { week: 2, day: 0 }))).toBe(false);
    expect(isPlanComplete(plan(TWO_WEEKS, { week: 3, day: 0 }))).toBe(true);
  });
  it('never completes a plan that is one repeating week', () => {
    expect(isPlanComplete(plan(LOOPING, { week: 9, day: 1 }))).toBe(false);
  });
});

describe('upcomingDays', () => {
  it('stops at the end of a multi-week plan instead of wrapping', () => {
    expect(upcomingDays(plan(TWO_WEEKS, { week: 1, day: 1 }), 5).map((d) => `${d.week}${d.name}`)).toEqual(['1B', '2A']);
    expect(upcomingDays(plan(TWO_WEEKS, { week: 3, day: 0 }), 5)).toEqual([]);
  });
  it('keeps going for a looping plan', () => {
    expect(upcomingDays(plan(LOOPING, { week: 1, day: 1 }), 3).map((d) => d.name)).toEqual(['B', 'A', 'B']);
  });
});

describe('matchesPlanCardio', () => {
  it('matches the same activity, and anything but mobility for a sport day', () => {
    expect(matchesPlanCardio({ activity: 'run' }, { activity: 'run', label: 'Run' })).toBe(true);
    expect(matchesPlanCardio({ activity: 'bike' }, { activity: 'run', label: 'Run' })).toBe(false);
    expect(matchesPlanCardio({ activity: 'run' }, { activity: 'other', label: 'Sport' })).toBe(true);
    expect(matchesPlanCardio({ activity: 'mobility' }, { activity: 'other', label: 'Sport' })).toBe(false);
  });
});

import { checkpointForWeek, checkpointsFor } from '../components/CheckIns';
import { latestPerPlan } from './workouts';

describe('check-ins', () => {
  it('sit at the start, middle and end of the plan', () => {
    expect(checkpointsFor(12).map((c) => c.week)).toEqual([1, 6, 12]);
    expect(checkpointsFor(8).map((c) => c.label)).toEqual(['Baseline', 'Week 4', 'Week 8']);
    expect(checkpointsFor(1).map((c) => c.week)).toEqual([1, 6, 12]);
    expect(checkpointForWeek(4, 8)).toBe('wk6');
    expect(checkpointForWeek(6, 8)).toBeNull();
  });
});

describe('latestPerPlan', () => {
  it('picks the newest finished workout of each plan', () => {
    const w = (id: number, programId: number | undefined, date: number) => ({ id, programId, date, finishedAt: date + 1 });
    expect([...latestPerPlan([w(1, 7, 10), w(2, 7, 30), w(3, 7, 20), w(4, 8, 5), w(5, undefined, 99), { id: 6, programId: 7, date: 50 }])].sort()).toEqual([2, 4]);
  });
});
