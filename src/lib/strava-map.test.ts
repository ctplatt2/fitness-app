import { describe, expect, it } from 'vitest';
import type { Cardio } from './db';
import { mapActivity, planSync, type StravaActivity } from './strava-map';

const run: StravaActivity = { id: 11, name: 'Morning Run', type: 'Run', sport_type: 'Run', distance: 8046.72, moving_time: 2700, elapsed_time: 2900, start_date: '2026-11-10T12:30:00Z', average_heartrate: 148.6 };

describe('mapActivity', () => {
  it('converts a run to miles or km', () => {
    expect(mapActivity(run, 'mi')).toEqual({ stravaId: 11, date: Date.parse('2026-11-10T12:30:00Z'), activity: 'run', durationSec: 2700, distance: 5, avgHr: 149, notes: 'Morning Run' });
    expect(mapActivity(run, 'km')?.distance).toBe(8.05);
  });
  it('maps rides, hikes, rows and trail runs', () => {
    const kind = (sport_type: string) => mapActivity({ ...run, sport_type }, 'mi')?.activity;
    expect([kind('GravelRide'), kind('Hike'), kind('Rowing'), kind('TrailRun'), kind('Swim')]).toEqual(['bike', 'walk', 'row', 'run', 'swim']);
  });
  it('labels tennis and soccer as sport, without distance', () => {
    const t = mapActivity({ id: 5, name: 'Saturday doubles', sport_type: 'Tennis', moving_time: 4000, start_date: '2026-11-14T15:00:00Z' }, 'mi');
    expect(t).toMatchObject({ activity: 'other', notes: 'Tennis · Saturday doubles', distance: undefined });
    expect(mapActivity({ id: 6, name: 'Soccer', sport_type: 'Soccer', elapsed_time: 3600, start_date: '2026-11-14T15:00:00Z' }, 'mi')).toMatchObject({ notes: 'Soccer', durationSec: 3600 });
  });
  it('skips strength, yoga and broken rows', () => {
    expect(mapActivity({ ...run, sport_type: 'WeightTraining' }, 'mi')).toBeNull();
    expect(mapActivity({ ...run, sport_type: 'Yoga' }, 'mi')).toBeNull();
    expect(mapActivity({ ...run, moving_time: 0, elapsed_time: 0 }, 'mi')).toBeNull();
    expect(mapActivity({ ...run, start_date: 'nope' }, 'mi')).toBeNull();
  });
});

describe('planSync', () => {
  const at = (h: number) => new Date(2026, 10, 10, h).getTime();
  const incoming = [
    { stravaId: 1, date: at(7), activity: 'run' as const, durationSec: 2700, distance: 5, avgHr: 150, notes: 'Morning Run' },
    { stravaId: 2, date: at(18), activity: 'bike' as const, durationSec: 3600, distance: 15 },
    { stravaId: 3, date: at(9), activity: 'run' as const, durationSec: 1200, distance: 2 },
  ];
  it('adds new activities and skips ones already imported or deleted here', () => {
    const existing: Cardio[] = [{ id: 9, stravaId: 2, date: at(18), activity: 'bike', durationSec: 3600 }];
    const p = planSync(existing, incoming, new Set([3]));
    expect(p.add.map((a) => a.stravaId)).toEqual([1]);
    expect(p.skipped).toBe(2);
    expect(p.link).toEqual([]);
  });
  it('links a hand-logged run instead of duplicating it, keeping what you typed', () => {
    const existing: Cardio[] = [{ id: 4, date: at(8), activity: 'run', durationSec: 2640, notes: 'easy' }];
    const p = planSync(existing, incoming, new Set());
    expect(p.link).toEqual([{ id: 4, patch: { stravaId: 1, distance: 5, avgHr: 150, notes: 'easy' } }]);
    expect(p.add.map((a) => a.stravaId)).toEqual([2, 3]);
  });
  it("doesn't link different activities, other days, or very different durations", () => {
    const existing: Cardio[] = [
      { id: 1, date: at(8), activity: 'walk', durationSec: 2700 },
      { id: 2, date: at(8) - 86400000, activity: 'run', durationSec: 2700 },
      { id: 3, date: at(8), activity: 'run', durationSec: 600 },
      { id: 5, date: at(8), activity: 'mobility', durationSec: 600 },
    ];
    expect(planSync(existing, incoming, new Set()).link).toEqual([]);
  });
  it('never imports the same activity twice in one sync', () => {
    expect(planSync([], [incoming[0], incoming[0]], new Set()).add).toHaveLength(1);
  });
});
