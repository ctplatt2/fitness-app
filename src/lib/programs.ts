import { db, type Exercise, type PlanWeek, type Program } from './db';
import { parsePlan, serializePlan, weekBlockFor } from './plan-parser';

/** Names in the plan that aren't in the exercise library (case-insensitive). */
export async function unknownExercises(names: string[]): Promise<string[]> {
  const all = await db.exercises.toArray();
  const known = new Set(all.map((e) => e.name.toLowerCase()));
  return names.filter((n) => !known.has(n.toLowerCase()));
}

/** Map plan names onto the library's canonical spelling. */
export async function canonicalNames(): Promise<Map<string, string>> {
  const all = await db.exercises.toArray();
  return new Map(all.map((e) => [e.name.toLowerCase(), e.name]));
}

export async function createCustomExercises(names: string[]): Promise<void> {
  const rows: Omit<Exercise, 'id'>[] = names.map((name) => ({
    name,
    primaryMuscle: 'Other',
    secondaryMuscles: [],
    equipment: 'Other',
    type: 'weight_reps',
    defaultRest: 90,
    custom: true,
  }));
  await db.exercises.bulkAdd(rows);
}

/** Save (create or update) a program from its text. Returns the id. */
export async function saveProgramFromText(text: string, existingId?: number): Promise<number> {
  const parsed = parsePlan(text);
  const canon = await canonicalNames();
  for (const w of parsed.weeks)
    for (const d of w.days)
      for (const s of d.slots) {
        const c = canon.get(s.exerciseName.toLowerCase());
        if (c) s.exerciseName = c;
      }

  if (existingId) {
    const prev = await db.programs.get(existingId);
    await db.programs.update(existingId, {
      name: parsed.name,
      sourceText: text,
      weeks: parsed.weeks,
      cursor: prev?.cursor ?? { week: 1, day: 0 },
    });
    return existingId;
  }
  const count = await db.programs.count();
  return (await db.programs.add({
    name: parsed.name,
    sourceText: text,
    weeks: parsed.weeks,
    createdAt: Date.now(),
    cursor: { week: 1, day: 0 },
    active: count === 0,
  })) as number;
}

export async function setActiveProgram(id: number): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    await db.programs.toCollection().modify({ active: false });
    await db.programs.update(id, { active: true });
  });
}

/** The active program, or null when none is set (never undefined, so useLive can tell "loading" apart). */
export async function getActiveProgram(): Promise<Program | null> {
  return (await db.programs.filter((p) => p.active).first()) ?? null;
}

/** The day the cursor points at, clamped to the plan. */
export function currentDay(p: Program) {
  const { block, weekNumber } = weekBlockFor(p.weeks, p.cursor.week);
  const idx = Math.min(p.cursor.day, Math.max(0, block.days.length - 1));
  return { week: weekNumber, dayIndex: idx, day: block.days[idx], block };
}

/** Move the cursor to the next day, rolling into the next week. */
export function advancedCursor(p: Program): Program['cursor'] {
  const { block } = weekBlockFor(p.weeks, p.cursor.week);
  if (p.cursor.day + 1 < block.days.length) return { week: p.cursor.week, day: p.cursor.day + 1 };
  return { week: p.cursor.week + 1, day: 0 };
}

/** The next n sessions the plan will serve, starting with the one that's up next. */
export function upcomingDays(p: Program, n: number): { week: number; name: string; exercises: number }[] {
  const out: { week: number; name: string; exercises: number }[] = [];
  let cursor = { ...p.cursor };
  for (let i = 0; i < n; i++) {
    const at = { ...p, cursor };
    const { week, day } = currentDay(at);
    if (!day) break;
    out.push({ week, name: day.name, exercises: day.slots.length });
    cursor = advancedCursor(at);
  }
  return out;
}

export function planLength(p: Program): number {
  return p.weeks.length ? p.weeks[p.weeks.length - 1].range[1] : 0;
}

/** Save an edited plan structure and regenerate its text so the two never disagree. */
export async function saveProgramWeeks(id: number, name: string, weeks: PlanWeek[], units: string): Promise<void> {
  await db.programs.update(id, { weeks, sourceText: serializePlan(name, weeks, units) });
}
