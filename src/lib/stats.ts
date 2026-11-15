import type { Cardio, Exercise, Workout, WorkoutSet } from './db';
import { estimate1RM } from './math';

/** Local midnight of the Monday that starts ts's week. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function addWeeks(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n * 7);
  return d.getTime();
}

export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Consecutive weeks with at least one session, counting back from this week (or last week if this one is empty so far). */
export function weekStreak(dates: number[], now: number): number {
  const weeks = new Set(dates.map(weekStart));
  let w = weekStart(now);
  if (!weeks.has(w)) w = addWeeks(w, -1);
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w = addWeeks(w, -1);
  }
  return n;
}

const working = (s: WorkoutSet) => s.done && s.type !== 'warmup' && (s.reps ?? 0) > 0;

export interface ExercisePoint {
  date: number;
  /** Best estimated 1RM of the session (0 when no weighted sets). */
  e1rm: number;
  topWeight: number;
  topReps: number;
  volume: number;
}

/** One point per finished workout that included the exercise, oldest first. */
export function exerciseSeries(name: string, sets: WorkoutSet[], workouts: Workout[]): ExercisePoint[] {
  const byId = new Map(workouts.filter((w) => w.finishedAt).map((w) => [w.id!, w]));
  const groups = new Map<number, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseName !== name || !working(s) || !byId.has(s.workoutId)) continue;
    (groups.get(s.workoutId) ?? groups.set(s.workoutId, []).get(s.workoutId)!).push(s);
  }
  return [...groups.entries()]
    .map(([id, g]) => ({
      date: byId.get(id)!.date,
      e1rm: Math.max(0, ...g.filter((s) => s.weight).map((s) => estimate1RM(s.weight!, s.reps!))),
      topWeight: Math.max(0, ...g.map((s) => s.weight ?? 0)),
      topReps: Math.max(0, ...g.map((s) => s.reps ?? 0)),
      volume: g.reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0),
    }))
    .sort((a, b) => a.date - b.date);
}

export interface BestLift {
  name: string;
  sessions: number;
  e1rm: number;
  weight: number;
  reps: number;
  date: number;
}

/** Best set (by estimated 1RM, else by reps) for every exercise with history, most-trained first. */
export function bestLifts(sets: WorkoutSet[], workouts: Workout[]): BestLift[] {
  const byId = new Map(workouts.filter((w) => w.finishedAt).map((w) => [w.id!, w]));
  const out = new Map<string, BestLift & { ids: Set<number> }>();
  for (const s of sets) {
    const w = byId.get(s.workoutId);
    if (!w || !working(s)) continue;
    const e = s.weight ? estimate1RM(s.weight, s.reps!) : 0;
    const cur = out.get(s.exerciseName);
    if (!cur) {
      out.set(s.exerciseName, { name: s.exerciseName, sessions: 0, e1rm: e, weight: s.weight ?? 0, reps: s.reps!, date: w.date, ids: new Set([w.id!]) });
      continue;
    }
    cur.ids.add(w.id!);
    if (e > cur.e1rm || (e === cur.e1rm && cur.e1rm === 0 && s.reps! > cur.reps)) {
      Object.assign(cur, { e1rm: e, weight: s.weight ?? 0, reps: s.reps!, date: w.date });
    }
  }
  return [...out.values()]
    .map(({ ids, ...b }) => ({ ...b, sessions: ids.size }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

/** Working sets per primary muscle for the week starting at `start`, biggest first. */
export function weeklyMuscleSets(sets: WorkoutSet[], workouts: Workout[], exercises: Exercise[], start: number): { muscle: string; sets: number }[] {
  const end = addWeeks(start, 1);
  const inWeek = new Set(workouts.filter((w) => w.finishedAt && w.date >= start && w.date < end).map((w) => w.id!));
  const muscleOf = new Map(exercises.map((e) => [e.name, e.primaryMuscle]));
  const counts = new Map<string, number>();
  for (const s of sets) {
    if (!inWeek.has(s.workoutId) || !working(s)) continue;
    const m = muscleOf.get(s.exerciseName) ?? 'Other';
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()].map(([muscle, n]) => ({ muscle, sets: n })).sort((a, b) => b.sets - a.sets);
}

export interface CardioWeek {
  start: number;
  distance: number;
  durationSec: number;
  sessions: number;
}

/** The last `weeks` weeks of cardio totals, oldest first, including empty weeks. */
export function weeklyCardio(cardio: Cardio[], weeks: number, now: number): CardioWeek[] {
  const out: CardioWeek[] = [];
  let start = addWeeks(weekStart(now), -(weeks - 1));
  for (let i = 0; i < weeks; i++) {
    const end = addWeeks(start, 1);
    const rows = cardio.filter((c) => c.date >= start && c.date < end);
    out.push({
      start,
      distance: Math.round(rows.reduce((n, c) => n + (c.distance ?? 0), 0) * 100) / 100,
      durationSec: rows.reduce((n, c) => n + c.durationSec, 0),
      sessions: rows.length,
    });
    start = end;
  }
  return out;
}

export interface ExerciseSession {
  workoutId: number;
  date: number;
  dayName?: string;
  /** Every completed set, warm-ups included, in the order performed. */
  sets: WorkoutSet[];
  /** Best estimated 1RM among working sets (0 when unweighted). */
  e1rm: number;
}

/** Every finished session of an exercise with all its sets, newest first. */
export function exerciseSessions(name: string, sets: WorkoutSet[], workouts: Workout[]): ExerciseSession[] {
  const byId = new Map(workouts.filter((w) => w.finishedAt).map((w) => [w.id!, w]));
  const groups = new Map<number, WorkoutSet[]>();
  for (const s of sets) {
    if (s.exerciseName !== name || !s.done || !byId.has(s.workoutId)) continue;
    (groups.get(s.workoutId) ?? groups.set(s.workoutId, []).get(s.workoutId)!).push(s);
  }
  return [...groups.entries()]
    .map(([id, g]) => {
      const w = byId.get(id)!;
      return {
        workoutId: id,
        date: w.date,
        dayName: w.dayName,
        sets: g.sort((a, b) => a.setIndex - b.setIndex),
        e1rm: Math.max(0, ...g.filter((s) => working(s) && s.weight).map((s) => estimate1RM(s.weight!, s.reps!))),
      };
    })
    .sort((a, b) => b.date - a.date);
}
