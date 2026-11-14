import Dexie, { type EntityTable } from 'dexie';
import { SEED_EXERCISES } from './seed-exercises';

export type Units = 'lb' | 'kg';
export type ExerciseType = 'weight_reps' | 'reps' | 'time' | 'distance';
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type CardioActivity = 'run' | 'bike' | 'row' | 'walk' | 'swim' | 'other';

export interface Exercise {
  id?: number;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  type: ExerciseType;
  /** Rest seconds the timer uses for this exercise. */
  defaultRest: number;
  custom: boolean;
}

export type Progression =
  | { kind: 'none' }
  | { kind: 'lp'; increment: number }
  | { kind: 'dp'; increment: number; minReps: number; maxReps: number };

export interface PlanSlot {
  exerciseName: string;
  sets: number;
  minReps: number;
  maxReps: number;
  weight?: number;
  rpe?: number;
  rest?: number;
  progression: Progression;
  superset?: string;
  note?: string;
  /** Last set is "as many reps as possible" (e.g. 1x5+). */
  amrap?: boolean;
  /** Reps are seconds (e.g. 3x60s). */
  timed?: boolean;
}

export interface PlanDay {
  name: string;
  slots: PlanSlot[];
}

export interface PlanWeek {
  /** Inclusive 1-based week range this block covers, e.g. [1, 4]. */
  range: [number, number];
  days: PlanDay[];
}

export interface Program {
  id?: number;
  name: string;
  sourceText: string;
  weeks: PlanWeek[];
  createdAt: number;
  /** Position of the next day to run: week number and day index. */
  cursor: { week: number; day: number };
  active: boolean;
}

export interface Workout {
  id?: number;
  date: number;
  programId?: number;
  dayName?: string;
  finishedAt?: number;
  durationSec?: number;
  notes?: string;
}

export interface WorkoutSet {
  id?: number;
  workoutId: number;
  exerciseName: string;
  order: number;
  setIndex: number;
  type: SetType;
  weight?: number;
  reps?: number;
  rpe?: number;
  note?: string;
  done: boolean;
  superset?: string;
  targetMinReps?: number;
  targetMaxReps?: number;
}

export interface Cardio {
  id?: number;
  date: number;
  activity: CardioActivity;
  durationSec: number;
  distance?: number;
  avgHr?: number;
  notes?: string;
}

export interface BodyEntry {
  id?: number;
  date: number;
  weight?: number;
  measurements?: Record<string, number>;
}

export interface Settings {
  id: 1;
  units: Units;
  barWeight: number;
  plates: number[];
  defaultRest: number;
  lastBackup?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  units: 'lb',
  barWeight: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  defaultRest: 120,
};

class LiftLogDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  programs!: EntityTable<Program, 'id'>;
  workouts!: EntityTable<Workout, 'id'>;
  sets!: EntityTable<WorkoutSet, 'id'>;
  cardio!: EntityTable<Cardio, 'id'>;
  body!: EntityTable<BodyEntry, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('liftlog');
    this.version(1).stores({
      exercises: '++id, &name, primaryMuscle',
      programs: '++id, name, active',
      workouts: '++id, date, programId',
      sets: '++id, workoutId, exerciseName, [exerciseName+done]',
      cardio: '++id, date, activity',
      body: '++id, date',
      settings: 'id',
    });
  }
}

export const db = new LiftLogDB();

/** Seed the exercise library (adding any new built-ins on upgrade) and settings. */
export async function initDb(): Promise<void> {
  const existing = new Set((await db.exercises.toArray()).map((e) => e.name.toLowerCase()));
  const missing = SEED_EXERCISES.filter((e) => !existing.has(e.name.toLowerCase()));
  if (missing.length) {
    await db.exercises.bulkAdd(missing.map((e) => ({ ...e, custom: false })));
  }
  const settings = await db.settings.get(1);
  if (!settings) await db.settings.put(DEFAULT_SETTINGS);
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(1)) ?? DEFAULT_SETTINGS;
}
