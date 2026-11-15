import type { CardioActivity, PlanCardio, PlanDay, PlanSlot, PlanWeek, Progression } from './db';

export interface ParsedPlan {
  name: string;
  weeks: PlanWeek[];
  errors: string[];
  /** Exercise names used in the plan, in first-seen order. */
  exerciseNames: string[];
}

export const PLAN_FORMAT_HELP = `# Plan name
## Week 1-4            (optional; omit for a plan that just repeats)
### Day name
Exercise / sets x reps / weight / rest / progress: rule / rpe N / superset A / note

Examples:
Bench Press / 3x8 / 135lb / rest 2:30 / progress: lp(5lb)
Incline Dumbbell Press / 3x8-12 / 50lb / progress: dp(5lb, 8, 12)
Squat / 1x5+ / 225lb               (5+ means as many reps as possible, at least 5)
Tricep Pushdown / 3x12 / superset A
Lateral Raise / 3x15 / superset A
Plank / 3x60s                       (time in seconds)

Cardio and rest days (a line with no sets x reps):
Run / 35-50 min / easy, conversational     (also Walk, Bike, Row, Swim, Sport)
Rest / walk or easy yoga if you like

Rules: lp(5lb) adds 5lb whenever every set hits its reps.
       dp(5lb, 8, 12) works reps up from 8 to 12, then adds 5lb and resets to 8.
       none keeps the same numbers (good for a deload week).
Lines starting with // are ignored.`;

const WEIGHT_RE = /^(\d+(?:\.\d+)?)\s*(lb|lbs|kg)?$/i;
const SETS_RE = /^(\d+)\s*[x×]\s*(\d+)(\+)?(?:\s*[-–]\s*(\d+))?(s|sec)?$/i;
const REST_RE = /^rest\s*:?\s*(\d+)(?::(\d{1,2}))?\s*(s|sec|m|min)?$/i;
const RPE_RE = /^rpe\s*:?\s*(\d+(?:\.\d+)?)$/i;
const SUPERSET_RE = /^superset\s*:?\s*([a-z0-9]+)$/i;
const PROGRESS_RE = /^progress\s*:?\s*(.+)$/i;
const WEEK_RE = /^week\s*(\d+)(?:\s*[-–]\s*(\d+))?$/i;

const CARDIO_WORDS: Record<string, CardioActivity> = {
  run: 'run', jog: 'run', walk: 'walk', hike: 'walk', bike: 'bike', ride: 'bike', cycle: 'bike',
  row: 'row', swim: 'swim', sport: 'other', tennis: 'other', soccer: 'other', cardio: 'other',
};
const MINUTES_RE = /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:min|mins|minutes|m)$/i;

/**
 * A day-level line: "Rest" or a cardio activity such as "Run / 35-50 min / easy".
 * Lines with sets x reps are exercises (so "Row / 3x8" is still a lift).
 */
export function parseDayActivity(line: string): { rest: true; note?: string } | { cardio: PlanCardio } | null {
  const parts = line.split('/').map((p) => p.trim());
  const head = parts[0].toLowerCase();
  const rest = parts.slice(1).filter(Boolean);
  if (rest.some((p) => SETS_RE.test(p))) return null;
  if (head === 'rest') return { rest: true, note: rest.join(' / ') || undefined };
  const activity = CARDIO_WORDS[head];
  if (!activity) return null;
  const cardio: PlanCardio = { activity, label: parts[0] };
  const notes: string[] = [];
  for (const p of rest) {
    const m = MINUTES_RE.exec(p);
    if (m && cardio.minMin === undefined) {
      cardio.minMin = Number(m[1]);
      cardio.maxMin = m[2] ? Number(m[2]) : Number(m[1]);
    } else notes.push(p);
  }
  if (notes.length) cardio.note = notes.join(' / ');
  return { cardio };
}

export function parseProgression(text: string): Progression | null {
  const t = text.trim().toLowerCase();
  if (t === 'none') return { kind: 'none' };
  const lp = /^lp\(\s*(\d+(?:\.\d+)?)\s*(?:lb|lbs|kg)?\s*\)$/.exec(t);
  if (lp) return { kind: 'lp', increment: Number(lp[1]) };
  const dp = /^dp\(\s*(\d+(?:\.\d+)?)\s*(?:lb|lbs|kg)?\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(t);
  if (dp) {
    const min = Number(dp[2]);
    const max = Number(dp[3]);
    if (max < min) return null;
    return { kind: 'dp', increment: Number(dp[1]), minReps: min, maxReps: max };
  }
  return null;
}

export function parseSlotLine(line: string, lineNo: number, errors: string[]): PlanSlot | null {
  const parts = line.split('/').map((p) => p.trim());
  const exerciseName = parts.shift() ?? '';
  if (!exerciseName) {
    errors.push(`Line ${lineNo}: missing exercise name`);
    return null;
  }
  const slot: PlanSlot = {
    exerciseName,
    sets: 3,
    minReps: 8,
    maxReps: 8,
    progression: { kind: 'none' },
  };
  let sawSets = false;
  const notes: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    let m: RegExpExecArray | null;
    if ((m = SETS_RE.exec(part))) {
      slot.sets = Number(m[1]);
      slot.minReps = Number(m[2]);
      slot.maxReps = m[4] ? Number(m[4]) : Number(m[2]);
      if (m[3]) slot.amrap = true;
      if (m[5]) slot.timed = true;
      if (slot.maxReps < slot.minReps) {
        errors.push(`Line ${lineNo}: rep range ${slot.minReps}-${slot.maxReps} is backwards`);
      }
      sawSets = true;
    } else if ((m = WEIGHT_RE.exec(part))) {
      slot.weight = Number(m[1]);
    } else if (/^bw$|^bodyweight$/i.test(part)) {
      slot.weight = undefined;
    } else if ((m = REST_RE.exec(part))) {
      const a = Number(m[1]);
      const b = m[2] !== undefined ? Number(m[2]) : null;
      const unit = (m[3] ?? '').toLowerCase();
      if (b !== null) slot.rest = a * 60 + b;
      else if (unit.startsWith('m')) slot.rest = a * 60;
      else slot.rest = a;
    } else if ((m = RPE_RE.exec(part))) {
      slot.rpe = Number(m[1]);
    } else if ((m = SUPERSET_RE.exec(part))) {
      slot.superset = m[1].toUpperCase();
    } else if ((m = PROGRESS_RE.exec(part))) {
      const p = parseProgression(m[1]);
      if (!p) errors.push(`Line ${lineNo}: unknown progression "${m[1]}" (use lp(5lb), dp(5lb, 8, 12) or none)`);
      else slot.progression = p;
    } else {
      notes.push(part);
    }
  }
  if (!sawSets) errors.push(`Line ${lineNo}: "${exerciseName}" has no sets x reps, using 3x8`);
  if (notes.length) slot.note = notes.join(' / ');
  return slot;
}

export function parsePlan(text: string): ParsedPlan {
  const errors: string[] = [];
  const weeks: PlanWeek[] = [];
  const names: string[] = [];
  const seen = new Set<string>();
  let name = '';
  let week: PlanWeek | null = null;
  let day: PlanDay | null = null;

  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;

    if (trimmed.startsWith('###')) {
      const title = trimmed.replace(/^#+\s*/, '');
      if (!week) {
        week = { range: [1, 1], days: [] };
        weeks.push(week);
      }
      day = { name: title || `Day ${week.days.length + 1}`, slots: [] };
      week.days.push(day);
      return;
    }
    if (trimmed.startsWith('##')) {
      const title = trimmed.replace(/^#+\s*/, '');
      const m = WEEK_RE.exec(title);
      let range: [number, number];
      if (m) {
        range = [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])];
        if (range[1] < range[0]) {
          errors.push(`Line ${lineNo}: week range ${title} is backwards`);
          range = [range[0], range[0]];
        }
      } else {
        const next = weeks.length ? weeks[weeks.length - 1].range[1] + 1 : 1;
        range = [next, next];
        if (title) errors.push(`Line ${lineNo}: "## ${title}" isn't "## Week N" or "## Week N-M", treating as week ${next}`);
      }
      week = { range, days: [] };
      weeks.push(week);
      day = null;
      return;
    }
    if (trimmed.startsWith('#')) {
      name = trimmed.replace(/^#+\s*/, '');
      return;
    }

    if (!day) {
      if (!week) {
        week = { range: [1, 1], days: [] };
        weeks.push(week);
      }
      day = { name: `Day ${week.days.length + 1}`, slots: [] };
      week.days.push(day);
    }
    const activity = parseDayActivity(trimmed);
    if (activity) {
      if ('rest' in activity) {
        day.rest = true;
        if (activity.note) day.note = activity.note;
      } else day.cardio = activity.cardio;
      return;
    }
    const slot = parseSlotLine(trimmed, lineNo, errors);
    if (slot) {
      day.slots.push(slot);
      const key = slot.exerciseName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        names.push(slot.exerciseName);
      }
    }
  });

  for (const w of weeks) {
    if (w.days.length === 0) errors.push(`Week ${w.range[0]} has no days`);
    for (const d of w.days) if (d.slots.length === 0 && !d.cardio && !d.rest) errors.push(`Day "${d.name}" has no exercises`);
  }
  if (weeks.length === 0) errors.push('No exercises found');
  if (!name) name = 'Untitled plan';

  return { name, weeks, errors, exerciseNames: names };
}

function fmtRest(sec: number): string {
  if (sec % 60 === 0) return `rest ${sec / 60}:00`;
  if (sec > 60) return `rest ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  return `rest ${sec}s`;
}

export function serializeSlot(s: PlanSlot, units: string): string {
  const parts = [s.exerciseName];
  let reps = `${s.sets}x${s.minReps}`;
  if (s.maxReps !== s.minReps) reps += `-${s.maxReps}`;
  if (s.amrap) reps += '+';
  if (s.timed) reps += 's';
  parts.push(reps);
  if (s.weight !== undefined) parts.push(`${s.weight}${units}`);
  if (s.rest !== undefined) parts.push(fmtRest(s.rest));
  if (s.rpe !== undefined) parts.push(`rpe ${s.rpe}`);
  if (s.progression.kind === 'lp') parts.push(`progress: lp(${s.progression.increment}${units})`);
  if (s.progression.kind === 'dp') {
    const p = s.progression;
    parts.push(`progress: dp(${p.increment}${units}, ${p.minReps}, ${p.maxReps})`);
  }
  if (s.superset) parts.push(`superset ${s.superset}`);
  if (s.note) parts.push(s.note);
  return parts.join(' / ');
}

export function serializeCardio(c: PlanCardio): string {
  const parts = [c.label];
  if (c.minMin !== undefined) parts.push(`${c.minMin}${c.maxMin !== undefined && c.maxMin !== c.minMin ? `-${c.maxMin}` : ''} min`);
  if (c.note) parts.push(c.note);
  return parts.join(' / ');
}

export function serializePlan(name: string, weeks: PlanWeek[], units: string): string {
  const out: string[] = [`# ${name}`];
  const single = weeks.length === 1 && weeks[0].range[0] === 1 && weeks[0].range[1] === 1;
  for (const w of weeks) {
    if (!single) {
      out.push('');
      out.push(w.range[0] === w.range[1] ? `## Week ${w.range[0]}` : `## Week ${w.range[0]}-${w.range[1]}`);
    }
    for (const d of w.days) {
      out.push('');
      out.push(`### ${d.name}`);
      if (d.rest) out.push(['Rest', d.note].filter(Boolean).join(' / '));
      if (d.cardio) out.push(serializeCardio(d.cardio));
      for (const s of d.slots) out.push(serializeSlot(s, units));
    }
  }
  return out.join('\n') + '\n';
}

/** Which week block covers week number n (plans loop after their last week). */
export function weekBlockFor(weeks: PlanWeek[], n: number): { block: PlanWeek; weekNumber: number } {
  const last = weeks.length ? weeks[weeks.length - 1].range[1] : 1;
  const wrapped = ((n - 1) % last) + 1;
  const block = weeks.find((w) => wrapped >= w.range[0] && wrapped <= w.range[1]) ?? weeks[0];
  return { block, weekNumber: wrapped };
}

export const EXAMPLE_PLAN = `# Push Pull Legs

## Week 1-3

### Push
Bench Press / 3x5 / 135lb / rest 3:00 / progress: lp(5lb)
Incline Dumbbell Press / 3x8-12 / 50lb / rest 1:30 / progress: dp(5lb, 8, 12)
Seated Dumbbell Press / 3x8-12 / 40lb / progress: dp(5lb, 8, 12)
Tricep Pushdown / 3x12 / 50lb / superset A
Lateral Raise / 3x15 / 15lb / superset A

### Pull
Deadlift / 1x5 / 225lb / rest 3:00 / progress: lp(10lb)
Pull-Up / 3x6-10 / bw / progress: dp(0, 6, 10)
Seated Cable Row / 3x8-12 / 120lb / progress: dp(10lb, 8, 12)
Face Pull / 3x15 / 30lb / superset B
Dumbbell Curl / 3x10-12 / 25lb / superset B

### Legs
Squat / 3x5 / 185lb / rest 3:00 / progress: lp(5lb)
Romanian Deadlift / 3x8-10 / 135lb / rest 2:00 / progress: dp(5lb, 8, 10)
Leg Press / 3x10-12 / 270lb / progress: dp(20lb, 10, 12)
Leg Curl / 3x12 / 80lb
Standing Calf Raise / 4x12 / 100lb

## Week 4
// Deload: same movements, lighter and easier

### Push
Bench Press / 3x5 / 105lb / rest 2:00 / progress: none
Incline Dumbbell Press / 2x10 / 40lb / progress: none
Lateral Raise / 2x15 / 10lb / progress: none

### Pull
Deadlift / 1x5 / 185lb / progress: none
Pull-Up / 2x6 / bw / progress: none
Seated Cable Row / 2x10 / 90lb / progress: none

### Legs
Squat / 3x5 / 135lb / progress: none
Romanian Deadlift / 2x8 / 95lb / progress: none
Leg Curl / 2x12 / 60lb / progress: none
`;
