import { TABLES, backupFilename, type Backup } from './backup-format';
import type { ImportedWorkout } from './csv-history';
import { db, getSettings, type DistanceUnit, type Units, type WorkoutSet } from './db';
import { serializePlan } from './plan-parser';
import { EQUIPMENT, convertDistance, convertPlanWeeks, convertWeight } from './units';

const IGNORED_KEY = 'liftlog.strava.ignored';

function readIgnored(): number[] {
  try {
    const ids = JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]');
    return Array.isArray(ids) ? ids.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

export async function buildBackup(): Promise<Backup> {
  const data = {} as Backup['data'];
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return { app: 'liftlog', version: 1, exportedAt: Date.now(), data, stravaIgnored: readIgnored() };
}

/** Replace everything on this device with the backup's contents. */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      if (b.data[t].length) await db.table(t).bulkAdd(b.data[t]);
    }
  });
  try {
    const ids = [...new Set([...readIgnored(), ...(Array.isArray(b.stravaIgnored) ? b.stravaIgnored : [])])].filter((n) => typeof n === 'number');
    if (ids.length) localStorage.setItem(IGNORED_KEY, JSON.stringify(ids.slice(-500)));
  } catch {
    /* storage unavailable */
  }
}

/** Hand a file to the share sheet (Files, iCloud, AirDrop…) or download it where sharing isn't available. */
export async function shareOrDownload(filename: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([text], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export async function backUpNow(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const b = await buildBackup();
  const result = await shareOrDownload(backupFilename(b.exportedAt), JSON.stringify(b));
  if (result !== 'cancelled') await db.settings.put({ ...(await getSettings()), lastBackup: b.exportedAt });
  return result;
}

export interface ImportPlan {
  /** Workouts not already on the device (matched by start time). */
  fresh: ImportedWorkout[];
  duplicates: number;
  sets: number;
  /** File name → library name for every exercise in the fresh workouts. */
  nameMap: Map<string, string>;
  newExercises: string[];
}

/** Work out what an import would add, without changing anything. */
export async function planImport(workouts: ImportedWorkout[]): Promise<ImportPlan> {
  const existing = new Set((await db.workouts.toArray()).map((w) => w.date));
  const fresh = workouts.filter((w) => !existing.has(w.date));
  const library = new Map((await db.exercises.toArray()).map((e) => [e.name.toLowerCase(), e.name]));
  const nameMap = new Map<string, string>();
  const newExercises: string[] = [];
  for (const w of fresh)
    for (const s of w.sets) {
      if (nameMap.has(s.exerciseName)) continue;
      // "Squat (Barbell)" matches the library's "Squat"; otherwise keep the file's name as a custom exercise.
      const stripped = s.exerciseName.replace(/\s*\([^)]*\)\s*$/, '');
      const hit = library.get(s.exerciseName.toLowerCase()) ?? library.get(stripped.toLowerCase());
      if (!hit) newExercises.push(s.exerciseName);
      nameMap.set(s.exerciseName, hit ?? s.exerciseName);
    }
  return { fresh, duplicates: workouts.length - fresh.length, sets: fresh.reduce((n, w) => n + w.sets.length, 0), nameMap, newExercises };
}

export async function runImport(plan: ImportPlan): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, db.exercises, async () => {
    if (plan.newExercises.length) {
      await db.exercises.bulkAdd(
        plan.newExercises.map((name) => ({ name, primaryMuscle: 'Other', secondaryMuscles: [], equipment: 'Other', type: 'weight_reps' as const, defaultRest: 90, custom: true })),
      );
    }
    for (const w of plan.fresh) {
      const workoutId = (await db.workouts.add({
        date: w.date,
        dayName: w.name,
        durationSec: w.durationSec,
        finishedAt: w.date + Math.max(1, w.durationSec) * 1000,
      })) as number;
      const order = new Map<string, number>();
      const index = new Map<string, number>();
      const rows: Omit<WorkoutSet, 'id'>[] = w.sets.map((s) => {
        const name = plan.nameMap.get(s.exerciseName) ?? s.exerciseName;
        if (!order.has(name)) order.set(name, order.size);
        const setIndex = index.get(name) ?? 0;
        index.set(name, setIndex + 1);
        return { workoutId, exerciseName: name, order: order.get(name)!, setIndex, type: s.type, done: true, weight: s.weight, reps: s.reps, rpe: s.rpe, note: s.note, timed: s.timed };
      });
      await db.sets.bulkAdd(rows);
    }
  });
}

/** What a weight-unit switch would have to convert. */
export async function weightDataCounts(): Promise<{ sets: number; body: number; plans: number }> {
  return {
    sets: await db.sets.filter((s) => !!s.weight || !!s.targetWeight).count(),
    body: await db.body.filter((b) => !!b.weight).count(),
    plans: await db.programs.count(),
  };
}

/**
 * Change the weight unit. With `convert`, every logged weight, target, record,
 * body weight and plan weight is converted too; without it only the label changes.
 */
export async function switchWeightUnits(to: Units, convert: boolean): Promise<void> {
  await db.transaction('rw', db.settings, db.sets, db.body, db.workouts, db.programs, async () => {
    const s = await getSettings();
    if (s.units === to) return;
    await db.settings.put({ ...s, units: to, ...EQUIPMENT[to] });
    if (!convert) return;
    const c = (w: number | undefined) => (w ? convertWeight(w, to) : w);
    await db.sets.toCollection().modify((row) => {
      row.weight = c(row.weight);
      row.targetWeight = c(row.targetWeight);
    });
    await db.body.toCollection().modify((row) => {
      row.weight = c(row.weight);
    });
    await db.workouts.toCollection().modify((row) => {
      for (const pr of row.prs ?? []) {
        if (pr.kind === 'reps') continue;
        pr.value = convertWeight(pr.value, to);
        pr.previous = convertWeight(pr.previous, to);
      }
    });
    await db.programs.toCollection().modify((row) => {
      row.weeks = convertPlanWeeks(row.weeks, to);
      row.sourceText = serializePlan(row.name, row.weeks, to);
    });
  });
}

export async function distanceDataCount(): Promise<number> {
  return db.cardio.filter((c) => !!c.distance).count();
}

/** Change the distance unit, converting logged distances when asked. */
export async function switchDistanceUnit(to: DistanceUnit, convert: boolean): Promise<void> {
  await db.transaction('rw', db.settings, db.cardio, async () => {
    const s = await getSettings();
    if (s.distanceUnit === to) return;
    await db.settings.put({ ...s, distanceUnit: to });
    if (!convert) return;
    await db.cardio.toCollection().modify((row) => {
      if (row.distance) row.distance = convertDistance(row.distance, to);
    });
  });
}
