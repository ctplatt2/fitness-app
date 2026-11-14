import { Link } from 'preact-router';
import { db, getSettings } from '../lib/db';
import { useLive } from '../lib/use-live';
import { currentDay, getActiveProgram } from '../lib/programs';
import { describeSlot } from './PlanDetail';
import { BASE } from '../base';

export function Today(_props: { path?: string }) {
  const program = useLive(() => getActiveProgram());
  const settings = useLive(() => getSettings());
  const exerciseCount = useLive(() => db.exercises.count());

  if (program === undefined || !settings) return <h1>Today</h1>;

  const next = program ? currentDay(program) : null;

  return (
    <>
      <h1>Today</h1>
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
          <button class="btn primary block" disabled style="margin-top:12px">
            Start workout (phase 3)
          </button>
        </div>
      ) : (
        <div class="card">
          <p style="margin:0 0 12px">No plan is active yet.</p>
          <Link class="btn primary block" href={`${BASE}/plans/new`}>Create a plan</Link>
        </div>
      )}
      <button class="btn block" disabled>Start empty workout (phase 3)</button>
      <p class="muted">{exerciseCount ?? '…'} exercises in your library.</p>
    </>
  );
}
