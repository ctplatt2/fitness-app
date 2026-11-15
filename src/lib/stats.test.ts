import { describe, expect, it } from 'vitest';
import type { Cardio, Exercise, Workout, WorkoutSet } from './db';
import { bestLifts, exerciseSeries, weekStart, weekStreak, weeklyCardio, weeklyMuscleSets } from './stats';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 11, 14); // a Saturday

const workouts: Workout[] = [
  { id: 1, date: at(2026, 11, 2), finishedAt: 1 },
  { id: 2, date: at(2026, 11, 9), finishedAt: 1 },
  { id: 3, date: at(2026, 11, 11), finishedAt: 1 },
  { id: 4, date: at(2026, 11, 13) }, // unfinished
];
const set = (workoutId: number, exerciseName: string, weight: number | undefined, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({
  workoutId,
  exerciseName,
  order: 0,
  setIndex: 0,
  type: 'normal',
  done: true,
  weight,
  reps,
  ...extra,
});
const sets: WorkoutSet[] = [
  set(1, 'Squat', 185, 5),
  set(1, 'Squat', 185, 5),
  set(1, 'Squat', 95, 5, { type: 'warmup' }),
  set(2, 'Squat', 190, 5),
  set(2, 'Squat', 190, 4, { done: false }),
  set(3, 'Pull-Up', undefined, 8),
  set(3, 'Pull-Up', undefined, 10),
  set(4, 'Squat', 300, 5),
];

describe('weeks', () => {
  it('starts weeks on Monday', () => {
    expect(new Date(weekStart(NOW)).getDate()).toBe(9);
    expect(new Date(weekStart(at(2026, 11, 9, 0))).getDate()).toBe(9);
    expect(new Date(weekStart(at(2026, 11, 8))).getDate()).toBe(2);
  });
  it('counts consecutive weeks', () => {
    expect(weekStreak([at(2026, 11, 2), at(2026, 11, 9)], NOW)).toBe(2);
    expect(weekStreak([at(2026, 11, 2)], NOW)).toBe(1); // this week empty so far
    expect(weekStreak([at(2026, 10, 20)], NOW)).toBe(0);
    expect(weekStreak([], NOW)).toBe(0);
  });
});

describe('exerciseSeries', () => {
  it('gives one point per finished workout, ignoring warm-ups and undone sets', () => {
    const s = exerciseSeries('Squat', sets, workouts);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ topWeight: 185, volume: 1850 });
    expect(s[0].e1rm).toBeCloseTo(215.8, 1);
    expect(s[1]).toMatchObject({ topWeight: 190, volume: 950 });
  });
  it('handles bodyweight exercises', () => {
    expect(exerciseSeries('Pull-Up', sets, workouts)[0]).toMatchObject({ e1rm: 0, topReps: 10, volume: 0 });
  });
});

describe('bestLifts', () => {
  it('finds the best set per exercise, most-trained first', () => {
    const b = bestLifts(sets, workouts);
    expect(b.map((x) => x.name)).toEqual(['Squat', 'Pull-Up']);
    expect(b[0]).toMatchObject({ weight: 190, reps: 5, sessions: 2 });
    expect(b[1]).toMatchObject({ weight: 0, reps: 10, e1rm: 0 });
  });
});

describe('weeklyMuscleSets', () => {
  it('counts working sets by primary muscle in the week', () => {
    const ex = [
      { name: 'Squat', primaryMuscle: 'Quads' },
      { name: 'Pull-Up', primaryMuscle: 'Back' },
    ] as Exercise[];
    expect(weeklyMuscleSets(sets, workouts, ex, weekStart(NOW))).toEqual([
      { muscle: 'Back', sets: 2 },
      { muscle: 'Quads', sets: 1 },
    ]);
  });
});

describe('weeklyCardio', () => {
  it('totals each week and keeps empty ones', () => {
    const cardio: Cardio[] = [
      { date: at(2026, 11, 3), activity: 'run', durationSec: 1800, distance: 3 },
      { date: at(2026, 11, 10), activity: 'run', durationSec: 2400, distance: 4.5 },
      { date: at(2026, 11, 12), activity: 'bike', durationSec: 3600, distance: 15 },
    ];
    const w = weeklyCardio(cardio, 3, NOW);
    expect(w.map((x) => x.distance)).toEqual([0, 3, 19.5]);
    expect(w[2]).toMatchObject({ sessions: 2, durationSec: 6000 });
  });
});

describe('exerciseSessions', () => {
  it('lists every finished session newest first, with warm-ups but not undone sets', async () => {
    const { exerciseSessions } = await import('./stats');
    const s = exerciseSessions('Squat', sets, workouts);
    expect(s.map((x) => x.workoutId)).toEqual([2, 1]);
    expect(s[1].sets).toHaveLength(3);
    expect(s[1].sets.some((x) => x.type === 'warmup')).toBe(true);
    expect(s[0].sets).toHaveLength(1);
    expect(s[0].e1rm).toBeCloseTo(221.7, 1);
  });
});
