import { Link } from 'preact-router';
import { useMemo } from 'preact/hooks';
import { db, getSettings } from '../lib/db';
import { estimate1RM } from '../lib/math';
import { useLive } from '../lib/use-live';
import { fmtDuration, workoutVolume } from '../lib/workouts';
import { BASE } from '../base';

export function WorkoutSummary(props: { path?: string; id?: string }) {
  const id = Number(props.id);
  const workout = useLive(() => db.workouts.get(id).then((w) => w ?? null), [id]);
  const sets = useLive(() => db.sets.where('workoutId').equals(id).toArray(), [id]);
  const settings = useLive(() => getSettings());

  const groups = useMemo(() => {
    const m = new Map<number, typeof sets>();
    for (const s of sets ?? []) (m.get(s.order) ?? m.set(s.order, []).get(s.order)!)!.push(s);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list!.sort((a, b) => a.setIndex - b.setIndex));
  }, [sets]);

  if (!workout || !sets || !settings) return <h1>Summary</h1>;
  const u = settings.units;
  const working = sets.filter((s) => s.type !== 'warmup');
  const volume = workoutVolume(sets);

  return (
    <>
      <h1>{workout.dayName ?? 'Workout'} done</h1>
      <div class="stats">
        <div class="stat"><div class="stat-v">{fmtDuration(workout.durationSec ?? 0)}</div><div class="muted small-text">duration</div></div>
        <div class="stat"><div class="stat-v">{working.length}</div><div class="muted small-text">sets</div></div>
        <div class="stat"><div class="stat-v">{volume.toLocaleString()}</div><div class="muted small-text">{u} volume</div></div>
      </div>

      {workout.prs && workout.prs.length > 0 && (
        <div class="card pr">
          <strong>🏆 Personal records</strong>
          <ul class="slots">
            {workout.prs.map((p, i) => (
              <li key={i}>
                <div class="slot-main">
                  <span>{p.exerciseName}</span>
                  <span>
                    {p.kind === 'e1rm' ? `est. 1RM ${p.value} ${u}` : p.kind === 'weight' ? `${p.value} ${u}` : `${p.value} reps`}
                    <span class="muted small-text"> (was {p.previous})</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((g, i) => {
        const w = g.filter((s) => s.type !== 'warmup');
        const best = w.filter((s) => s.weight).sort((a, b) => estimate1RM(b.weight!, b.reps ?? 0) - estimate1RM(a.weight!, a.reps ?? 0))[0];
        return (
          <div class="card" key={i}>
            <div class="row-between">
              <strong>{g[0].exerciseName}</strong>
              {best && <span class="muted small-text">best {best.weight}×{best.reps}</span>}
            </div>
            <div class="muted small-text" style="margin-top:4px">
              {w.map((s) => (s.weight !== undefined ? `${s.weight}×${s.reps ?? 0}` : `${s.reps ?? 0}`)).join(' · ')}
            </div>
          </div>
        );
      })}

      <Link class="btn primary block" href={`${BASE}/`}>Done</Link>
    </>
  );
}
