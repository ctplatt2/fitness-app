import { Link, route } from 'preact-router';
import { useState } from 'preact/hooks';
import { db, getSettings } from '../lib/db';
import { useLive } from '../lib/use-live';
import { advanceProgram, cardioMinutes, currentDay, getActiveProgram } from '../lib/programs';
import { getActiveWorkout, startEmptyWorkout, startWorkoutFromProgram } from '../lib/workouts';
import { CHECKPOINTS, checkpointForWeek, missingTests } from '../components/CheckIns';
import { mobilityThisWeek } from './Mobility';
import { describeSlot } from './PlanDetail';
import { BASE } from '../base';

export function Today(_props: { path?: string }) {
  const program = useLive(() => getActiveProgram());
  const active = useLive(() => getActiveWorkout());
  const settings = useLive(() => getSettings());
  const exerciseCount = useLive(() => db.exercises.count());
  const loggedCount = useLive(async () => (await db.workouts.count()) + (await db.cardio.count()));
  const mobilityCount = useLive(() => mobilityThisWeek());
  const [busy, setBusy] = useState(false);

  if (program === undefined || active === undefined || !settings) return <h1>Today</h1>;

  const next = program ? currentDay(program) : null;
  const day = next?.day;
  const hasLifts = !!day && day.slots.length > 0;
  const checkpoint = next ? checkpointForWeek(next.week) : null;
  const testsDue = checkpoint ? missingTests(settings, checkpoint) : 0;

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

      {program && next && day ? (
        <div class="card">
          <div class="muted small-text">
            {program.name} · week {next.week}
          </div>
          <strong style="font-size:1.2rem">{day.name}</strong>

          {day.rest && <p style="margin:10px 0 0">Rest day{day.note ? `: ${day.note}` : '.'}</p>}
          {day.cardio && (
            <p style="margin:10px 0 0">
              {day.cardio.label}
              {cardioMinutes(day.cardio) ? ` · ${cardioMinutes(day.cardio)}` : ''}
              {day.cardio.note && <span class="muted small-text" style="display:block; margin-top:4px">{day.cardio.note}</span>}
            </p>
          )}
          {hasLifts && (
            <ul class="slots">
              {day.slots.map((s, i) => (
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
          )}

          {!active && (
            <>
              {hasLifts ? (
                <button class="btn primary block" style="margin-top:12px" disabled={busy} onClick={() => start('plan')}>
                  Start {day.name}
                </button>
              ) : day.cardio ? (
                <Link class="btn primary block" style="margin-top:12px" href={`${BASE}/cardio/new?activity=${day.cardio.activity}&plan=${program.id}`}>
                  Log this {day.cardio.label.toLowerCase()}
                </Link>
              ) : (
                <button class="btn primary block" style="margin-top:12px" onClick={() => advanceProgram(program.id!)}>
                  Rest done, show next day
                </button>
              )}
              {!day.rest && (
                <button class="linkbtn muted small-text" style="display:block; margin:0 auto" onClick={() => advanceProgram(program.id!)}>
                  Skip this day
                </button>
              )}
            </>
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

      <div class="card row-between">
        <div>
          <strong>Mobility circuit</strong>
          <div class="muted small-text">
            {mobilityCount ?? 0} of {settings.mobilityTarget} this week · about 10 min
          </div>
        </div>
        <Link class="btn small" href={`${BASE}/mobility`}>Start</Link>
      </div>

      {checkpoint && testsDue > 0 && (
        <Link class="card reminder" href={`${BASE}/progress?show=checkins`}>
          <strong>{CHECKPOINTS.find((c) => c.id === checkpoint)!.label} check-in</strong>
          <span class="muted small-text">
            {testsDue} test{testsDue === 1 ? '' : 's'} to record this week so you can compare later. Tap to enter them.
          </span>
        </Link>
      )}

      {(loggedCount ?? 0) >= 3 && (!settings.lastBackup || Date.now() - settings.lastBackup > 14 * 86400000) && (
        <Link class="card reminder" href={`${BASE}/settings`}>
          <strong>Back up your data</strong>
          <span class="muted small-text">
            {settings.lastBackup ? 'Your last backup was more than two weeks ago.' : "You haven't made a backup yet."} Your log lives only on this device. Tap to back up.
          </span>
        </Link>
      )}
      <p class="muted">{exerciseCount ?? '…'} exercises in your library.</p>
    </>
  );
}
