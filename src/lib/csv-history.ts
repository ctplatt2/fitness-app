import type { SetType, Units } from './db';

export interface ImportedSet {
  exerciseName: string;
  type: SetType;
  weight?: number;
  reps?: number;
  rpe?: number;
  note?: string;
  timed?: boolean;
}

export interface ImportedWorkout {
  date: number;
  name: string;
  durationSec: number;
  sets: ImportedSet[];
}

export interface HistoryParse {
  format: 'strong' | 'hevy' | null;
  workouts: ImportedWorkout[];
  error?: string;
}

/** Minimal RFC-4180 parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "2023-01-05 18:30:00" (Strong) or "5 Jan 2023, 18:30" (Hevy) → local timestamp. */
export function parseWhen(s: string): number | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime();
  m = /^(\d{1,2}) (\w{3})\w* (\d{4}),? (\d{1,2}):(\d{2})/.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    if (mo >= 0) return new Date(+m[3], mo, +m[1], +m[4], +m[5]).getTime();
  }
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : d;
}

/** "1h 5m", "45m", "30s" or plain seconds. */
export function parseStrongDuration(s: string): number {
  const t = s.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  let sec = 0;
  for (const m of t.matchAll(/(\d+)\s*([hms])/g)) sec += Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
  return sec;
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
};

function converter(from: Units | null, to: Units): (w: number) => number {
  if (!from || from === to) return (w) => w;
  const f = from === 'kg' ? 2.20462 : 0.453592;
  return (w) => Math.round(w * f * 2) / 2;
}

function unitOf(header: string): Units | null {
  if (/kg/.test(header)) return 'kg';
  if (/lb/.test(header)) return 'lb';
  return null;
}

/** Read a Strong or Hevy workout export. Weights are converted to `units` when the file states its unit. */
export function parseHistoryCsv(text: string, units: Units): HistoryParse {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = parseCsv(text, delimiter);
  if (rows.length < 2) return { format: null, workouts: [], error: 'The file is empty.' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (prefix: string) => head.findIndex((h) => h.startsWith(prefix));
  const format = head.includes('exercise_title') ? 'hevy' : col('exercise name') >= 0 ? 'strong' : null;
  if (!format) return { format: null, workouts: [], error: "This doesn't look like a Strong or Hevy export (no exercise column found)." };

  const c =
    format === 'hevy'
      ? { name: col('title'), start: col('start_time'), end: col('end_time'), ex: col('exercise_title'), type: col('set_type'), weight: col('weight_'), reps: col('reps'), secs: col('duration_seconds'), rpe: col('rpe'), note: col('exercise_notes'), dur: -1 }
      : { name: col('workout name'), start: col('date'), end: -1, ex: col('exercise name'), type: col('set order'), weight: col('weight'), reps: col('reps'), secs: col('seconds'), rpe: col('rpe'), note: col('notes'), dur: col('duration') };
  if (c.start < 0 || c.ex < 0) return { format, workouts: [], error: 'The file is missing its date or exercise column.' };
  const convert = converter(c.weight >= 0 ? unitOf(head[c.weight]) : null, units);

  const byKey = new Map<string, ImportedWorkout>();
  for (const r of rows.slice(1)) {
    const date = parseWhen(r[c.start] ?? '');
    const exerciseName = (r[c.ex] ?? '').trim();
    if (date === null || !exerciseName) continue;
    const key = `${date}|${r[c.name] ?? ''}`;
    let w = byKey.get(key);
    if (!w) {
      let durationSec = 0;
      if (c.dur >= 0) durationSec = parseStrongDuration(r[c.dur] ?? '');
      else if (c.end >= 0) {
        const end = parseWhen(r[c.end] ?? '');
        if (end && end > date) durationSec = Math.round((end - date) / 1000);
      }
      w = { date, name: (r[c.name] ?? '').trim() || 'Workout', durationSec, sets: [] };
      byKey.set(key, w);
    }
    const rawType = (r[c.type] ?? '').trim().toLowerCase();
    if (rawType.startsWith('rest') || rawType === 'note') continue;
    const type: SetType = rawType.startsWith('w') ? 'warmup' : rawType.startsWith('d') ? 'drop' : rawType.startsWith('f') ? 'failure' : 'normal';
    const weight = num(r[c.weight]);
    let reps = num(r[c.reps]);
    const secs = c.secs >= 0 ? num(r[c.secs]) : undefined;
    let timed = false;
    if (!reps && secs) {
      reps = Math.round(secs);
      timed = true;
    }
    if (!reps) continue;
    w.sets.push({
      exerciseName,
      type,
      weight: weight ? convert(weight) : undefined,
      reps,
      rpe: num(r[c.rpe]),
      note: c.note >= 0 ? (r[c.note] ?? '').trim() || undefined : undefined,
      timed: timed || undefined,
    });
  }
  const workouts = [...byKey.values()].filter((w) => w.sets.length > 0).sort((a, b) => a.date - b.date);
  if (workouts.length === 0) return { format, workouts, error: 'No completed sets were found in the file.' };
  return { format, workouts };
}
