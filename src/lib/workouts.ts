import { db, getSettings, type PR, type Program, type Workout, type WorkoutSet } from './db';
import { estimate1RM, sessionSeconds } from './math';
import { smallestStep } from './plates';
import { weekBlockFor } from './plan-parser';
import { advancedCursor, currentDay } from './programs';
import { nextTarget, type PerformedSet } from './progression';

/** The unfinished workout, or null when there isn't one (never undefined, so useLive can tell "loading" apart). */
export async function getActiveWorkout(): Promise<Workout | null> {
  return (await db.workouts.filter((w) => !w.finishedAt).first()) ?? null;
}

async function finishedWorkoutIds(): Promise<Set<number>> {
  const ws = await db.workouts.filter((w) => !!w.finishedAt).toArray();
  return new Set(ws.map((w) => w.id!));
}

/**
 * Done sets from the most recent finished workout that included this exercise.
 * With `progressedOnly`, deload sessions (progression "none") are skipped so a
 * light week doesn't drag the next target down.
 */
export async function lastSetsFor(exerciseName: string, progressedOnly = false): Promise<WorkoutSet[]> {
  const all = await db.sets.where('exerciseName').equals(exerciseName).toArray();
  const finished = await finishedWorkoutIds();
  const byWorkout = new Map<number, WorkoutSet[]>();
  for (const s of all) {
    if (!s.done || !finished.has(s.workoutId)) continue;
    if (progressedOnly && s.progressionKind === 'none') continue;
    (byWorkout.get(s.workoutId) ?? byWorkout.set(s.workoutId, []).get(s.workoutId)!).push(s);
  }
  if (byWorkout.size === 0) return [];
  const workouts = await db.workouts.bulkGet([...byWorkout.keys()]);
  const latest = workouts.filter(Boolean).sort((a, b) => b!.date - a!.date)[0]!;
  return byWorkout.get(latest.id!)!.sort((a, b) => a.setIndex - b.setIndex);
}

/** Previous-session sets for a list of exercises, keyed by name (working sets only). */
export async function previousSets(names: string[]): Promise<Record<string, WorkoutSet[]>> {
  const out: Record<string, WorkoutSet[]> = {};
  for (const n of [...new Set(names)]) {
    out[n] = (await lastSetsFor(n)).filter((s) => s.type !== 'warmup');
  }
  return out;
}

export async function startWorkoutFromProgram(program: Program): Promise<number> {
  const { week, day } = currentDay(program);
  const settings = await getSettings();
  const step = smallestStep(settings.plates);
  const workoutId = (await db.workouts.add({
    date: Date.now(),
    programId: program.id,
    dayName: day.name,
    week,
    cursorBefore: { ...program.cursor },
  })) as number;

  const rows: Omit<WorkoutSet, 'id'>[] = [];
  day.slots.forEach((slot, order) => {
    rows.push(...buildRowsForSlot(workoutId, order, slot, [], step));
  });
  // Fill targets from history (sequential to keep it simple; a handful of queries).
  for (const [order, slot] of day.slots.entries()) {
    const last = await lastSetsFor(slot.exerciseName, slot.progression.kind !== 'none');
    const target = nextTarget(slot, last as PerformedSet[], step);
    for (const r of rows) {
      if (r.order !== order) continue;
      r.targetWeight = target.weight;
      r.targetMinReps = target.minReps;
      r.targetMaxReps = target.maxReps;
    }
  }
  await db.sets.bulkAdd(rows);
  return workoutId;
}

function buildRowsForSlot(
  workoutId: number,
  order: number,
  slot: Program['weeks'][number]['days'][number]['slots'][number],
  _last: WorkoutSet[],
  _step: number,
): Omit<WorkoutSet, 'id'>[] {
  const rows: Omit<WorkoutSet, 'id'>[] = [];
  for (let i = 0; i < slot.sets; i++) {
    rows.push({
      workoutId,
      exerciseName: slot.exerciseName,
      order,
      setIndex: i,
      type: 'normal',
      done: false,
      superset: slot.superset,
      targetWeight: slot.weight,
      targetMinReps: slot.minReps,
      targetMaxReps: slot.maxReps,
      amrap: slot.amrap && i === slot.sets - 1 ? true : undefined,
      timed: slot.timed || undefined,
      restSec: slot.rest,
      progressionKind: slot.progression.kind,
    });
  }
  return rows;
}

export async function startEmptyWorkout(): Promise<number> {
  return (await db.workouts.add({ date: Date.now() })) as number;
}

export async function addExercise(workoutId: number, exerciseName: string): Promise<void> {
  const existing = await db.sets.where('workoutId').equals(workoutId).toArray();
  const order = existing.length ? Math.max(...existing.map((s) => s.order)) + 1 : 0;
  const last = (await lastSetsFor(exerciseName)).filter((s) => s.type !== 'warmup');
  const ex = await db.exercises.where('name').equals(exerciseName).first();
  const count = last.length || 3;
  const rows: Omit<WorkoutSet, 'id'>[] = [];
  for (let i = 0; i < count; i++) {
    const prev = last[i] ?? last[last.length - 1];
    rows.push({
      workoutId,
      exerciseName,
      order,
      setIndex: i,
      type: 'normal',
      done: false,
      targetWeight: prev?.weight,
      targetMinReps: prev?.reps ?? 8,
      targetMaxReps: prev?.reps ?? 8,
      timed: ex?.type === 'time' || undefined,
      restSec: ex?.defaultRest,
      progressionKind: 'none',
    });
  }
  await db.sets.bulkAdd(rows);
}

export async function addSet(workoutId: number, order: number): Promise<void> {
  const group = (await db.sets.where('workoutId').equals(workoutId).toArray())
    .filter((s) => s.order === order)
    .sort((a, b) => a.setIndex - b.setIndex);
  const last = group[group.length - 1];
  if (!last) return;
  const { id: _id, ...copy } = last;
  await db.sets.add({
    ...copy,
    setIndex: last.setIndex + 1,
    done: false,
    doneAt: undefined,
    type: last.type === 'warmup' ? 'normal' : last.type,
    rpe: undefined,
    note: undefined,
    amrap: undefined,
    weight: last.done ? last.weight : undefined,
    reps: last.done ? last.reps : undefined,
    targetWeight: last.done ? (last.weight ?? last.targetWeight) : last.targetWeight,
  });
}

export async function addWarmupSets(workoutId: number, order: number, ramp: { weight: number; reps: number }[]): Promise<void> {
  const group = (await db.sets.where('workoutId').equals(workoutId).toArray()).filter((s) => s.order === order);
  if (!group.length || !ramp.length) return;
  const first = group[0];
  // Shift existing indices up so warm-ups come first.
  await db.transaction('rw', db.sets, async () => {
    for (const s of group) await db.sets.update(s.id!, { setIndex: s.setIndex + ramp.length });
    await db.sets.bulkAdd(
      ramp.map((r, i) => ({
        workoutId,
        exerciseName: first.exerciseName,
        order,
        setIndex: i,
        type: 'warmup' as const,
        done: false,
        superset: first.superset,
        targetWeight: r.weight,
        targetMinReps: r.reps,
        targetMaxReps: r.reps,
        restSec: 60,
        progressionKind: first.progressionKind,
      })),
    );
  });
}

export async function removeSet(id: number): Promise<void> {
  await db.sets.delete(id);
}

export async function removeExercise(workoutId: number, order: number): Promise<void> {
  const ids = (await db.sets.where('workoutId').equals(workoutId).toArray()).filter((s) => s.order === order).map((s) => s.id!);
  await db.sets.bulkDelete(ids);
}

export async function updateSet(id: number, patch: Partial<WorkoutSet>): Promise<void> {
  await db.sets.update(id, patch);
}

/** Mark a set done, filling blanks from its targets. Returns the rest to start. */
export async function completeSet(set: WorkoutSet, defaultRest: number): Promise<number> {
  const weight = set.weight ?? set.targetWeight;
  const reps = set.reps ?? set.targetMinReps;
  await db.sets.update(set.id!, { done: true, doneAt: Date.now(), weight, reps });
  return set.restSec ?? defaultRest;
}

export async function uncompleteSet(id: number): Promise<void> {
  await db.sets.update(id, { done: false, doneAt: undefined });
}

export async function discardWorkout(id: number): Promise<void> {
  await db.transaction('rw', db.sets, db.workouts, async () => {
    await db.sets.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  });
}

export async function computePRs(workoutId: number, done: WorkoutSet[]): Promise<PR[]> {
  const finished = await finishedWorkoutIds();
  finished.delete(workoutId);
  const prs: PR[] = [];
  const names = [...new Set(done.map((s) => s.exerciseName))];
  for (const name of names) {
    const mine = done.filter((s) => s.exerciseName === name && s.type !== 'warmup' && (s.reps ?? 0) > 0);
    if (!mine.length) continue;
    const prior = (await db.sets.where('exerciseName').equals(name).toArray()).filter(
      (s) => s.done && s.type !== 'warmup' && finished.has(s.workoutId) && (s.reps ?? 0) > 0,
    );
    if (!prior.length) continue; // first time: nothing to beat yet
    const weighted = mine.filter((s) => (s.weight ?? 0) > 0);
    const priorWeighted = prior.filter((s) => (s.weight ?? 0) > 0);
    if (weighted.length && priorWeighted.length) {
      const bestE1 = Math.max(...weighted.map((s) => estimate1RM(s.weight!, s.reps!)));
      const priorE1 = Math.max(...priorWeighted.map((s) => estimate1RM(s.weight!, s.reps!)));
      if (bestE1 > priorE1) prs.push({ exerciseName: name, kind: 'e1rm', value: bestE1, previous: priorE1 });
      const bestW = Math.max(...weighted.map((s) => s.weight!));
      const priorW = Math.max(...priorWeighted.map((s) => s.weight!));
      if (bestW > priorW) prs.push({ exerciseName: name, kind: 'weight', value: bestW, previous: priorW });
    } else if (!weighted.length && !priorWeighted.length) {
      const bestR = Math.max(...mine.map((s) => s.reps!));
      const priorR = Math.max(...prior.map((s) => s.reps!));
      if (bestR > priorR) prs.push({ exerciseName: name, kind: 'reps', value: bestR, previous: priorR });
    }
  }
  return prs;
}

/** The plan position a workout was started from (older workouts are matched by week and day name). */
export function planCursorFor(p: Program, w: Workout): Program['cursor'] | null {
  if (w.cursorBefore) return w.cursorBefore;
  if (w.week === undefined || !w.dayName) return null;
  const { block } = weekBlockFor(p.weeks, w.week);
  const day = block.days.findIndex((d) => d.name === w.dayName);
  return day < 0 ? null : { week: w.week, day };
}

/** Delete a logged workout. With rewindPlan, the plan goes back to that workout's day. */
export async function deleteWorkout(id: number, rewindPlan: boolean): Promise<void> {
  const w = await db.workouts.get(id);
  if (!w) return;
  await db.transaction('rw', db.sets, db.workouts, db.programs, async () => {
    await db.sets.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
    if (rewindPlan && w.programId) {
      const p = await db.programs.get(w.programId);
      const cursor = p ? planCursorFor(p, w) : null;
      if (p && cursor) await db.programs.update(p.id!, { cursor });
    }
  });
}

/**
 * Finish: drop unfinished sets, record PRs and duration, advance the plan.
 * A workout with nothing marked done is discarded instead (returns false).
 */
export async function finishWorkout(id: number): Promise<boolean> {
  const w = await db.workouts.get(id);
  if (!w || w.finishedAt) return true;
  const sets = await db.sets.where('workoutId').equals(id).toArray();
  if (!sets.some((s) => s.done)) {
    await discardWorkout(id);
    return false;
  }
  await db.sets.bulkDelete(sets.filter((s) => !s.done).map((s) => s.id!));
  const done = sets.filter((s) => s.done);
  const prs = await computePRs(id, done);
  const finishedAt = Date.now();
  const durationSec = sessionSeconds(w.date, finishedAt, done.map((s) => s.doneAt ?? 0));
  await db.workouts.update(id, { finishedAt, durationSec, prs });
  if (w.programId) {
    const p = await db.programs.get(w.programId);
    if (p) await db.programs.update(p.id!, { cursor: advancedCursor(p) });
  }
  return true;
}

export function workoutVolume(sets: WorkoutSet[]): number {
  return sets.reduce((n, s) => n + (s.done && s.type !== 'warmup' ? (s.weight ?? 0) * (s.reps ?? 0) : 0), 0);
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

/**
 * Swap the remaining sets of an exercise for a different one (equipment taken, something hurts).
 * Sets already done stay logged under the original exercise.
 */
export async function swapExercise(workoutId: number, order: number, newName: string): Promise<void> {
  const group = (await db.sets.where('workoutId').equals(workoutId).toArray()).filter((s) => s.order === order).sort((a, b) => a.setIndex - b.setIndex);
  if (!group.length || group[0].exerciseName === newName) return;
  const ex = await db.exercises.where('name').equals(newName).first();
  const prev = (await lastSetsFor(newName)).filter((s) => s.type !== 'warmup');
  const remaining = group.filter((s) => !s.done && s.type !== 'warmup');
  const staleWarmups = group.filter((s) => !s.done && s.type === 'warmup');
  // If some sets are already done, the new exercise becomes its own block right after.
  const newOrder = group.some((s) => s.done) ? order + (Number.isInteger(order) ? 0.5 : 0.25) : order;
  await db.transaction('rw', db.sets, async () => {
    await db.sets.bulkDelete(staleWarmups.map((s) => s.id!));
    for (const [i, s] of remaining.entries()) {
      await db.sets.update(s.id!, {
        exerciseName: newName,
        order: newOrder,
        setIndex: i,
        weight: undefined,
        reps: undefined,
        rpe: undefined,
        note: undefined,
        targetWeight: (prev[i] ?? prev[prev.length - 1])?.weight,
        timed: ex?.type === 'time' ? true : undefined,
        restSec: s.restSec ?? ex?.defaultRest,
        progressionKind: undefined,
      });
    }
  });
}
