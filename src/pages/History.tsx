import { Link, route } from 'preact-router';
import { useState } from 'preact/hooks';
import { ACTIVITIES, describeEffort, formatDuration } from '../lib/cardio';
import { db, getSettings, type Cardio, type Workout, type WorkoutSet } from '../lib/db';
import { useLive } from '../lib/use-live';
import { deleteWorkout, fmtDuration } from '../lib/workouts';
import { FEEL } from './WorkoutSummary';
import { BASE } from '../base';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

type Entry = { kind: 'workout'; date: number; w: Workout } | { kind: 'cardio'; date: number; c: Cardio };

export function History(_props: { path?: string }) {
  const workouts = useLive(() => db.workouts.filter((w) => !!w.finishedAt).toArray());
  const cardio = useLive(() => db.cardio.toArray());
  const settings = useLive(() => getSettings());
  const [open, setOpen] = useState<number | null>(null);
  const sets = useLive<WorkoutSet[]>(() => (open ? db.sets.where('workoutId').equals(open).toArray() : Promise.resolve([])), [open]);
  const counts = useLive(async () => {
    const all = await db.sets.toArray();
    const m: Record<number, { sets: number; exercises: Set<string> }> = {};
    for (const s of all) {
      if (!s.done || s.type === 'warmup') continue;
      (m[s.workoutId] ??= { sets: 0, exercises: new Set() }).sets++;
      m[s.workoutId].exercises.add(s.exerciseName);
    }
    return m;
  });

  if (!workouts || !cardio || !settings) return <h1>History</h1>;

  const entries: Entry[] = [
    ...workouts.map((w): Entry => ({ kind: 'workout', date: w.date, w })),
    ...cardio.map((c): Entry => ({ kind: 'cardio', date: c.date, c })),
  ].sort((a, b) => b.date - a.date);

  // Group by calendar day so a lift and a run on the same day sit together.
  const days: { label: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const label = fmtDate(e.date);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(e);
    else days.push({ label, items: [e] });
  }

  return (
    <>
      <div class="row-between">
        <h1>History</h1>
        <Link class="btn small" href={`${BASE}/cardio/new`}>+ Cardio</Link>
      </div>
      {entries.length === 0 ? (
        <div class="empty">Nothing logged yet. Finished workouts and cardio show up here.</div>
      ) : (
        days.map((d) => (
          <section key={d.label}>
            <h2 class="day-label">{d.label}</h2>
            {d.items.map((e) =>
              e.kind === 'cardio' ? (
                <CardioCard key={`c${e.c.id}`} c={e.c} distUnit={settings.distanceUnit} />
              ) : (
                <WorkoutCard
                  key={`w${e.w.id}`}
                  w={e.w}
                  count={counts?.[e.w.id!]}
                  open={open === e.w.id}
                  sets={open === e.w.id ? sets : undefined}
                  onToggle={() => setOpen(open === e.w.id ? null : e.w.id!)}
                />
              ),
            )}
          </section>
        ))
      )}
    </>
  );
}

function CardioCard(props: { c: Cardio; distUnit: string }) {
  const { c } = props;
  const a = ACTIVITIES.find((x) => x.id === c.activity);
  return (
    <div class="card tappable" onClick={() => route(`${BASE}/cardio/${c.id}`)}>
      <div class="row-between">
        <strong>
          {a?.icon} {a?.label ?? c.activity}
        </strong>
        <span class="muted small-text">{new Date(c.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <div class="muted small-text" style="margin-top:4px">
        {formatDuration(c.durationSec)}
        {c.distance ? ` · ${c.distance} ${props.distUnit} · ${describeEffort(c.activity, c.durationSec, c.distance, props.distUnit)}` : ''}
        {c.avgHr ? ` · ${c.avgHr} bpm` : ''}
        {c.notes ? ` · ${c.notes}` : ''}
      </div>
    </div>
  );
}

function WorkoutCard(props: {
  w: Workout;
  count?: { sets: number; exercises: Set<string> };
  open: boolean;
  sets?: WorkoutSet[];
  onToggle: () => void;
}) {
  const { w, count: c, open, sets } = props;
  const [confirm, setConfirm] = useState(false);
  const stop = (fn: () => void) => (e: Event) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div class="card tappable" onClick={props.onToggle}>
      <div class="row-between">
        <strong>🏋️ {w.dayName ?? 'Workout'}</strong>
        <span class="muted small-text">{new Date(w.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <div class="muted small-text" style="margin-top:4px">
        {fmtDuration(w.durationSec ?? 0)} · {c?.sets ?? 0} sets · {c?.exercises.size ?? 0} exercises
        {w.prs?.length ? ` · 🏆 ${w.prs.length} PR${w.prs.length === 1 ? '' : 's'}` : ''}
      </div>
      {(w.energy || w.soreness || w.notes) && (
        <div class="small-text" style="margin-top:4px">
          {[w.energy ? `Energy ${FEEL.energy[w.energy - 1].toLowerCase()}` : '', w.soreness ? `soreness ${FEEL.soreness[w.soreness - 1].toLowerCase()}` : '', w.notes ?? '']
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {open && sets && (
        <ul class="slots">
          {[...new Map(sets.sort((a, b) => a.order - b.order || a.setIndex - b.setIndex).map((s) => [s.order, s.exerciseName])).entries()].map(([order, name]) => (
            <li key={order}>
              <div class="slot-main">
                <span>{name}</span>
                <span class="muted small-text">
                  {sets
                    .filter((s) => s.order === order && s.type !== 'warmup')
                    .map((s) => (s.weight !== undefined ? `${s.weight}×${s.reps ?? 0}` : `${s.reps ?? 0}`))
                    .join(' · ')}
                </span>
              </div>
            </li>
          ))}
          <li>
            <Link href={`${BASE}/workout/${w.id}/summary`} class="muted small-text" onClick={(e: Event) => e.stopPropagation()}>
              Summary and notes →
            </Link>
          </li>
          <li>
            {!confirm ? (
              <button class="btn small" onClick={stop(() => setConfirm(true))}>Delete workout</button>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>
                <div class="small-text" style="margin-bottom:8px">
                  Delete this workout and its sets? This can't be undone.
                  {w.programId ? ' You can also put your plan back on this day so you can do it again.' : ''}
                </div>
                <div class="chips" style="margin:0">
                  {w.programId && (
                    <button class="btn small danger" onClick={() => deleteWorkout(w.id!, true)}>Delete and redo this day</button>
                  )}
                  <button class={w.programId ? 'btn small' : 'btn small danger'} onClick={() => deleteWorkout(w.id!, false)}>
                    {w.programId ? 'Delete only' : 'Delete'}
                  </button>
                  <button class="btn small" onClick={() => setConfirm(false)}>Cancel</button>
                </div>
              </div>
            )}
          </li>
        </ul>
      )}
    </div>
  );
}
