import Dexie, { type EntityTable } from 'dexie';
import { SEED_EXERCISES } from './seed-exercises';

export type Units = 'lb' | 'kg';
export type ExerciseType = 'weight_reps' | 'reps' | 'time' | 'distance';
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type CardioActivity = 'run' | 'bike' | 'row' | 'walk' | 'swim' | 'other' | 'mobility';

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

/** A run, ride, sport session or other cardio prescribed by a plan day. */
export interface PlanCardio {
  activity: CardioActivity;
  /** What the plan calls it, e.g. "Run" or "Sport". */
  label: string;
  minMin?: number;
  maxMin?: number;
  note?: string;
}

export interface PlanDay {
  name: string;
  slots: PlanSlot[];
  /** Set on cardio days (a day can also have exercises, e.g. a run plus mobility). */
  cardio?: PlanCardio;
  /** A rest day: nothing to log. */
  rest?: boolean;
  note?: string;
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

export interface PR {
  exerciseName: string;
  kind: 'e1rm' | 'weight' | 'reps';
  value: number;
  previous: number;
}

export interface Workout {
  id?: number;
  date: number;
  programId?: number;
  dayName?: string;
  week?: number;
  /** Where the plan pointed when this workout started, so deleting it can put the plan back. */
  cursorBefore?: { week: number; day: number };
  finishedAt?: number;
  durationSec?: number;
  notes?: string;
  /** How the session felt, 1 (low) to 3 (good). */
  energy?: number;
  /** Soreness afterwards, 1 (none) to 3 (a lot). */
  soreness?: number;
  prs?: PR[];
}

export interface WorkoutSet {
  id?: number;
  workoutId: number;
  exerciseName: string;
  /** Exercise block position within the workout. */
  order: number;
  setIndex: number;
  type: SetType;
  weight?: number;
  reps?: number;
  rpe?: number;
  note?: string;
  done: boolean;
  /** When the set was marked done. */
  doneAt?: number;
  superset?: string;
  targetWeight?: number;
  targetMinReps?: number;
  targetMaxReps?: number;
  amrap?: boolean;
  /** Reps field holds seconds. */
  timed?: boolean;
  restSec?: number;
  progressionKind?: Progression['kind'];
}

export interface Cardio {
  id?: number;
  date: number;
  activity: CardioActivity;
  durationSec: number;
  distance?: number;
  avgHr?: number;
  notes?: string;
  /** Set when this entry came from (or was matched to) a Strava activity. */
  stravaId?: number;
}

export interface BodyEntry {
  id?: number;
  date: number;
  weight?: number;
  measurements?: Record<string, number>;
}

export type DistanceUnit = 'mi' | 'km';

export interface Settings {
  id: 1;
  units: Units;
  distanceUnit: DistanceUnit;
  barWeight: number;
  plates: number[];
  defaultRest: number;
  lastBackup?: number;
  /** Moves in the mobility circuit, one per entry. */
  mobility: string[];
  /** How many circuits a week to aim for. */
  mobilityTarget: number;
  /** Check-in test names, measured at baseline, week 6 and week 12. */
  testMetrics: string[];
  /** Recorded results, keyed `${metric}|${checkpoint}`. */
  testValues: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 1,
  units: 'lb',
  distanceUnit: 'mi',
  barWeight: 45,
  plates: [45, 35, 25, 10, 5, 2.5],
  defaultRest: 120,
  mobility: [
    'Knee-to-wall ankle mobilization · 10 / side',
    'Bent-knee calf raises · 12 / side',
    'Straight-knee calf raises · 12 / side',
    'Tibialis raises · 15',
    '90/90 hip switches · 10 total',
    'Adductor rock-backs · 10 / side',
    'Single-leg balance with reach · 30 sec / side',
  ],
  mobilityTarget: 3,
  testMetrics: [
    'Back squat: load × 5',
    'Trap-bar deadlift: load × 5',
    'Strict pull-ups',
    'Push-ups (clean reps)',
    '10–20 m sprint (optional)',
    'Easy run: pace / effort',
  ],
  testValues: {},
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

/** Stored settings, with defaults filled in for fields added since the row was written. */
export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get(1)) ?? {}) };
}
