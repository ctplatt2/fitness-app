import { useState } from 'preact/hooks';
import { db } from '../lib/db';
import { exerciseSessions } from '../lib/stats';
import { useLive } from '../lib/use-live';

const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** Every past session of one exercise, newest first, with each set as it was logged. */
export function ExerciseHistory(props: { name: string; units: string; initial?: number }) {
  const sessions = useLive(async () => {
    const [sets, workouts] = await Promise.all([db.sets.where('exerciseName').equals(props.name).toArray(), db.workouts.toArray()]);
    return exerciseSessions(props.name, sets, workouts);
  }, [props.name]);
  const [all, setAll] = useState(false);
  const limit = props.initial ?? 5;

  if (!sessions) return null;
  if (sessions.length === 0) return <p class="muted small-text">No finished sessions of {props.name} yet.</p>;
  const shown = all ? sessions : sessions.slice(0, limit);

  return (
    <div class="exhist">
      {shown.map((s) => (
        <div key={s.workoutId} class="exhist-row">
          <div class="row-between">
            <span class="small-text">
              {fmtDate(s.date)}
              {s.dayName ? <span class="muted"> · {s.dayName}</span> : null}
            </span>
            {s.e1rm > 0 && <span class="muted small-text" style="white-space:nowrap">est. 1RM {s.e1rm}</span>}
          </div>
          <div class="exhist-sets">
            {s.sets.map((x) => (
              <span key={x.id} class={x.type === 'warmup' ? 'pill warm' : 'pill'} title={x.note}>
                {x.type === 'warmup' ? 'W ' : x.type === 'drop' ? 'D ' : x.type === 'failure' ? 'F ' : ''}
                {x.weight !== undefined ? `${x.weight}×${x.reps ?? 0}` : `${x.reps ?? 0}${x.timed ? 's' : ''}`}
                {x.rpe ? ` @${x.rpe}` : ''}
              </span>
            ))}
          </div>
          {s.sets.some((x) => x.note) && (
            <div class="muted small-text">{s.sets.filter((x) => x.note).map((x) => x.note).join(' · ')}</div>
          )}
        </div>
      ))}
      {sessions.length > limit && (
        <button class="linkbtn muted small-text" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${sessions.length} sessions`}
        </button>
      )}
    </div>
  );
}
