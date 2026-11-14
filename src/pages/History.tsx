import { Link } from 'preact-router';
import { useState } from 'preact/hooks';
import { db, type WorkoutSet } from '../lib/db';
import { useLive } from '../lib/use-live';
import { fmtDuration } from '../lib/workouts';
import { BASE } from '../base';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function History(_props: { path?: string }) {
  const workouts = useLive(() => db.workouts.filter((w) => !!w.finishedAt).reverse().sortBy('date'));
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

  if (!workouts) return <h1>History</h1>;
  const list = [...workouts].sort((a, b) => b.date - a.date);

  return (
    <>
      <h1>History</h1>
      {list.length === 0 ? (
        <div class="empty">No finished workouts yet.</div>
      ) : (
        list.map((w) => {
          const c = counts?.[w.id!];
          const isOpen = open === w.id;
          return (
            <div class="card tappable" key={w.id} onClick={() => setOpen(isOpen ? null : w.id!)}>
              <div class="row-between">
                <strong>{w.dayName ?? 'Workout'}</strong>
                <span class="muted small-text">{fmtDate(w.date)}</span>
              </div>
              <div class="muted small-text" style="margin-top:4px">
                {fmtDuration(w.durationSec ?? 0)} · {c?.sets ?? 0} sets · {c?.exercises.size ?? 0} exercises
                {w.prs?.length ? ` · 🏆 ${w.prs.length} PR${w.prs.length === 1 ? '' : 's'}` : ''}
              </div>
              {isOpen && sets && (
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
                    <Link href={`${BASE}/workout/${w.id}/summary`} class="muted small-text" onClick={(e: Event) => e.stopPropagation()}>View summary →</Link>
                  </li>
                </ul>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
