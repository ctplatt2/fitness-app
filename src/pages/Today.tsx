import { Link, route } from 'preact-router';
import { useState } from 'preact/hooks';
import { db, getSettings } from '../lib/db';
import { useLive } from '../lib/use-live';
import { currentDay, getActiveProgram } from '../lib/programs';
import { getActiveWorkout, startEmptyWorkout, startWorkoutFromProgram } from '../lib/workouts';
import { describeSlot } from './PlanDetail';
import { BASE } from '../base';

export function Today(_props: { path?: string }) {
  const program = useLive(() => getActiveProgram());
  const active = useLive(() => getActiveWorkout());
  const settings = useLive(() => getSettings());
  const exerciseCount = useLive(() => db.exercises.count());
  const [busy, setBusy] = useState(false);

  if (program === undefined || active === undefined || !settings) return <h1>Today</h1>;

  const next = program ? currentDay(program) : null;

  async function start(kind: 'plan' | 'empty') {
    if (busy) return;
    setBusy(true);
    try {
      const id = kind === 'plan' && program ? await startWorkoutFromProgram(program) : await startEmptyWorkout();
      route(`${BASE}/workout/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Today</h1>

      {active && (
        <div class="card active">
          <div class="muted small-text">Workout in progress</div>
          <strong style="font-size:1.2rem">{active.dayName ?? 'Workout'}</strong>
          <div class="muted small-text">started {new Date(active.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
          <Link class="btn primary block" style="margin-top:12px" href={`${BASE}/workout/${active.id}`}>Resume</Link>
        </div>
      )}

      {program && next ? (
        <div class="card">
          <div class="muted small-text">
            {program.name} · week {next.week}
          </div>
          <strong style="font-size:1.2rem">{next.day.name}</strong>
          <ul class="slots">
            {next.day.slots.map((s, i) => (
              <li key={i}>
                <div class="slot-main">
                  <span>
                    {s.superset && <span class="ss">{s.superset}</span>}
                    {s.exerciseName}
                  </span>
                  <span class="muted">{describeSlot(s, settings.units)}</span>
                </div>
              </li>
            ))}
          </ul>
          {!active && (
            <button class="btn primary block" style="margin-top:12px" disabled={busy} onClick={() => start('plan')}>
              Start {next.day.name}
            </button>
          )}
        </div>
      ) : (
        <div class="card">
          <p style="margin:0 0 12px">No plan is active yet.</p>
          <Link class="btn primary block" href={`${BASE}/plans/new`}>Create a plan</Link>
        </div>
      )}

      <div class="chips" style="margin-top:0">
        {!active && (
          <button class="btn" style="flex:1" disabled={busy} onClick={() => start('empty')}>Empty workout</button>
        )}
        <Link class="btn" style="flex:1" href={`${BASE}/cardio/new`}>Log cardio</Link>
      </div>
      <p class="muted">{exerciseCount ?? '…'} exercises in your library.</p>
    </>
  );
}
