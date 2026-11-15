import { Link, route } from 'preact-router';
import { useState } from 'preact/hooks';
import { db, getSettings } from '../lib/db';
import { useLive } from '../lib/use-live';
import { formatDuration } from '../lib/cardio';
import { advanceProgram, cardioMinutes, currentDay, getActiveProgram, isPlanComplete, matchesPlanCardio, planLength } from '../lib/programs';
import { dayStart } from '../lib/stats';
import { getStrava, isConnected, syncStrava } from '../lib/strava';
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
  const todaysCardio = useLive(() => db.cardio.where('date').aboveOrEqual(dayStart(Date.now())).toArray());
  const [busy, setBusy] = useState(false);
  const [stravaMsg, setStravaMsg] = useState('');
  const strava = isConnected(getStrava());

  async function pullFromStrava() {
    setStravaMsg('Checking Strava…');
    try {
      const r = await syncStrava();
      setStravaMsg(r.planAdvanced ? '' : r.added + r.linked > 0 ? `Added ${r.added + r.linked} from Strava, but none from today match this session.` : 'Nothing new on Strava yet. Has your watch uploaded?');
    } catch (e) {
      setStravaMsg((e as Error).message);
    }
  }

  if (program === undefined || active === undefined || !settings) return <h1>Today</h1>;

  const complete = !!program && isPlanComplete(program);
  const next = program && !complete ? currentDay(program) : null;
  const day = next?.day;
  const hasLifts = !!day && day.slots.length > 0;
  // After the last week, keep prompting for the final check-in until it's recorded.
  const checkpoint = complete ? 'wk12' : next ? checkpointForWeek(next.week) : null;
  // A run (or ride, sport…) already logged or imported today that fits this plan day.
  const already = day?.cardio && !hasLifts ? (todaysCardio ?? []).filter((c) => matchesPlanCardio(c, day.cardio!)).sort((a, b) => b.date - a.date)[0] : undefined;
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
          <div class="muted small-text">
            started{' '}
            {dayStart(active.date) === dayStart(Date.now())
              ? new Date(active.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : new Date(active.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
          <Link class="btn primary block" style="margin-top:12px" href={`${BASE}/workout/${active.id}`}>Resume</Link>
        </div>
      )}

      {program && complete ? (
        <div class="card pr">
          <div class="muted small-text">{program.name}</div>
          <strong style="font-size:1.2rem">Plan complete 🎉</strong>
          <p style="margin:10px 0 0">
            You finished all {planLength(program)} weeks. Start it again from week 1, or pick a different plan.
          </p>
          {!active && (
            <>
              <button class="btn primary block" style="margin-top:12px" onClick={() => db.programs.update(program.id!, { cursor: { week: 1, day: 0 } })}>
                Start again from week 1
              </button>
              <Link class="btn block" style="margin-top:8px" href={`${BASE}/plans`}>Choose another plan</Link>
            </>
          )}
        </div>
      ) : program && next && day ? (
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
                <>
                  {already && (
                    <button class="btn primary block" style="margin-top:12px" onClick={() => advanceProgram(program.id!)}>
                      Count today's {formatDuration(already.durationSec)}
                      {already.distance ? ` · ${already.distance} ${settings.distanceUnit}` : ''} {already.activity === 'other' ? 'session' : already.activity}
                    </button>
                  )}
                  <Link class={already ? 'btn block' : 'btn primary block'} style={already ? 'margin-top:8px' : 'margin-top:12px'} href={`${BASE}/cardio/new?activity=${day.cardio.activity}&plan=${program.id}`}>
                    Log {already ? 'a different' : 'this'} {day.cardio.label.toLowerCase()}
                  </Link>
                </>
              ) : (
                <button class="btn primary block" style="margin-top:12px" onClick={() => advanceProgram(program.id!)}>
                  Rest done, show next day
                </button>
              )}
              {strava && day.cardio && !hasLifts && !already && (
                <>
                  <button class="btn block" style="margin-top:8px" onClick={pullFromStrava}>Get it from Strava</button>
                  {stravaMsg && <p class="muted small-text" style="margin:8px 0 0">{stravaMsg}</p>}
                </>
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
