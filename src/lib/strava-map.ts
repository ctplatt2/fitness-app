import type { Cardio, CardioActivity, DistanceUnit } from './db';

/** The fields we use from Strava's activity summary. */
export interface StravaActivity {
  id: number;
  name?: string;
  type?: string;
  sport_type?: string;
  /** metres */
  distance?: number;
  /** seconds */
  moving_time?: number;
  elapsed_time?: number;
  /** ISO time, UTC */
  start_date: string;
  average_heartrate?: number;
}

const TYPES: Record<string, CardioActivity> = {
  Run: 'run', TrailRun: 'run', VirtualRun: 'run',
  Ride: 'bike', VirtualRide: 'bike', MountainBikeRide: 'bike', GravelRide: 'bike', EBikeRide: 'bike', EMountainBikeRide: 'bike',
  Walk: 'walk', Hike: 'walk',
  Swim: 'swim',
  Rowing: 'row', VirtualRow: 'row',
  Tennis: 'other', Soccer: 'other',
};
const SPORT_LABEL: Record<string, string> = { Tennis: 'Tennis', Soccer: 'Soccer' };

export type MappedActivity = Omit<Cardio, 'id'> & { stravaId: number };

/** Turn a Strava activity into a cardio entry, or null for types we don't track (e.g. weight training). */
export function mapActivity(a: StravaActivity, unit: DistanceUnit): MappedActivity | null {
  const kind = a.sport_type ?? a.type ?? '';
  const activity = TYPES[kind];
  const date = Date.parse(a.start_date);
  const durationSec = Math.round(a.moving_time || a.elapsed_time || 0);
  if (!activity || Number.isNaN(date) || durationSec <= 0) return null;
  const metres = a.distance ?? 0;
  const distance = metres > 0 ? Math.round((metres / (unit === 'mi' ? 1609.344 : 1000)) * 100) / 100 : undefined;
  const label = SPORT_LABEL[kind];
  const notes = [label, a.name && a.name !== label ? a.name : ''].filter(Boolean).join(' · ') || undefined;
  return {
    stravaId: a.id,
    date,
    activity,
    durationSec,
    distance,
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
    notes,
  };
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export interface SyncPlan {
  /** New entries to add. */
  add: MappedActivity[];
  /** Entries you logged by hand that match a Strava activity: link them instead of duplicating. */
  link: { id: number; patch: Partial<Cardio> }[];
  /** Already imported, or deleted here on purpose. */
  skipped: number;
}

/**
 * Decide what a sync should change. A hand-logged entry counts as the same session
 * when it's the same activity on the same day with a duration within 15%.
 */
export function planSync(existing: Cardio[], incoming: MappedActivity[], ignored: Set<number>): SyncPlan {
  const have = new Set(existing.filter((c) => c.stravaId).map((c) => c.stravaId!));
  const manual = existing.filter((c) => !c.stravaId && c.activity !== 'mobility');
  const taken = new Set<number>();
  const plan: SyncPlan = { add: [], link: [], skipped: 0 };
  for (const a of incoming) {
    if (have.has(a.stravaId) || ignored.has(a.stravaId)) {
      plan.skipped++;
      continue;
    }
    have.add(a.stravaId);
    const match = manual.find(
      (c) => !taken.has(c.id!) && c.activity === a.activity && sameDay(c.date, a.date) && Math.abs(c.durationSec - a.durationSec) <= 0.15 * a.durationSec,
    );
    if (match) {
      taken.add(match.id!);
      plan.link.push({
        id: match.id!,
        patch: { stravaId: a.stravaId, distance: match.distance ?? a.distance, avgHr: match.avgHr ?? a.avgHr, notes: match.notes ?? a.notes },
      });
    } else plan.add.push(a);
  }
  return plan;
}
