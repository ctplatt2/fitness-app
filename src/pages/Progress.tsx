import { useEffect, useMemo, useState } from 'preact/hooks';
import { CHART_GREEN, SeriesChart } from '../components/SeriesChart';
import { CheckIns, checkpointForWeek } from '../components/CheckIns';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { formatDuration } from '../lib/cardio';
import { db, getSettings } from '../lib/db';
import { currentDay, getActiveProgram } from '../lib/programs';
import { addWeeks, bestLifts, dayStart, exerciseSeries, weekStart, weekStreak, weeklyCardio, weeklyMuscleSets } from '../lib/stats';
import { useLive } from '../lib/use-live';

const shortDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
type Metric = 'e1rm' | 'top' | 'volume';

export function Progress(_props: { path?: string }) {
  const workoutsAll = useLive(() => db.workouts.toArray());
  const sets = useLive(() => db.sets.toArray());
  const cardioAll = useLive(() => db.cardio.toArray());
  const program = useLive(() => getActiveProgram());
  const exercises = useLive(() => db.exercises.toArray());
  const body = useLive(() => db.body.orderBy('date').toArray());
  const settings = useLive(() => getSettings());
  const [picked, setPicked] = useState('');
  const [metric, setMetric] = useState<Metric>('e1rm');
  const [weekOffset, setWeekOffset] = useState(0);
  const [bw, setBw] = useState('');

  const workouts = useMemo(() => (workoutsAll ?? []).filter((w) => w.finishedAt), [workoutsAll]);
  const bests = useMemo(() => bestLifts(sets ?? [], workouts), [sets, workouts]);

  const ready = !!(workoutsAll && sets && cardioAll && exercises && body && settings);
  // Opened from the Today check-in prompt: jump to the tests.
  useEffect(() => {
    if (ready && new URLSearchParams(location.search).get('show') === 'checkins') {
      requestAnimationFrame(() => document.getElementById('checkins')?.scrollIntoView({ block: 'start' }));
    }
  }, [ready]);

  if (!workoutsAll || !sets || !cardioAll || !exercises || !body || !settings) return <h1>Progress</h1>;
  // Mobility circuits are logged alongside cardio but tracked separately.
  const cardio = cardioAll.filter((c) => c.activity !== 'mobility');
  const mobilityDays = new Set(cardioAll.filter((c) => c.activity === 'mobility').map((c) => dayStart(c.date)));
  const checkins = <CheckIns settings={settings} current={program ? checkpointForWeek(currentDay(program).week) : null} />;

  const now = Date.now();
  const u = settings.units;
  const du = settings.distanceUnit;
  const sessionDates = [...workouts.map((w) => w.date), ...cardioAll.map((c) => c.date)];
  const thisWeek = weekStart(now);
  const sessionsThisWeek = sessionDates.filter((d) => d >= thisWeek).length;
  const streak = weekStreak(sessionDates, now);

  if (sessionDates.length === 0 && body.length === 0) {
    return (
      <>
        <h1>Progress</h1>
        <div class="empty">Finish a workout or log some cardio and your charts, records and streak will appear here.</div>
        {checkins}
        <BodyWeight body={body} units={u} bw={bw} setBw={setBw} />
      </>
    );
  }

  // --- calendar: last 5 weeks ---
  const liftDays = new Set(workouts.map((w) => dayStart(w.date)));
  const cardioDays = new Set(cardio.map((c) => dayStart(c.date)));
  const calStart = addWeeks(thisWeek, -4);
  const days = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(calStart);
    d.setDate(d.getDate() + i);
    return d.getTime();
  });

  // --- exercise chart ---
  const name = picked || bests[0]?.name || '';
  const series = name ? exerciseSeries(name, sets, workouts) : [];
  const weighted = series.some((p) => p.topWeight > 0);
  const activeMetric: Metric = weighted ? metric : 'top';
  const value = (p: (typeof series)[number]) =>
    activeMetric === 'e1rm' ? p.e1rm : activeMetric === 'volume' ? p.volume : weighted ? p.topWeight : p.topReps;
  const metricLabel = activeMetric === 'e1rm' ? `Est. 1RM (${u})` : activeMetric === 'volume' ? `Volume (${u})` : weighted ? `Top weight (${u})` : 'Top reps';
  const latest = series.length ? value(series[series.length - 1]) : 0;
  const first = series.length ? value(series[0]) : 0;
  const change = series.length > 1 ? latest - first : 0;

  // --- muscles ---
  const muscleWeek = addWeeks(thisWeek, weekOffset);
  const muscles = weeklyMuscleSets(sets, workouts, exercises, muscleWeek);
  const maxMuscle = Math.max(1, ...muscles.map((m) => m.sets));

  // --- cardio ---
  const cardioWeeks = weeklyCardio(cardio, 8, now);
  const hasDistance = cardioWeeks.some((w) => w.distance > 0);
  const runs = cardio.filter((c) => c.activity === 'run' && c.distance && c.distance > 0).sort((a, b) => a.date - b.date).slice(-12);

  return (
    <>
      <h1>Progress</h1>

      <div class="stats">
        <div class="stat"><div class="stat-v">{sessionsThisWeek}</div><div class="muted small-text">this week</div></div>
        <div class="stat"><div class="stat-v">{streak}</div><div class="muted small-text">week streak</div></div>
        <div class="stat"><div class="stat-v">{workouts.length}</div><div class="muted small-text">workouts</div></div>
      </div>

      <div class="card">
        <strong>Last 5 weeks</strong>
        <div class="cal" style="margin-top:10px">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} class="cal-h muted small-text">{d}</div>)}
          {days.map((d) => {
            const lift = liftDays.has(d);
            const run = cardioDays.has(d);
            const mob = mobilityDays.has(d);
            const future = d > now;
            return (
              <div key={d} class={`cal-d${dayStart(now) === d ? ' today' : ''}${future ? ' future' : ''}`} title={`${shortDate(d)}${lift ? ' · lifting' : ''}${run ? ' · cardio' : ''}${mob ? ' · mobility' : ''}`}>
                <span>{new Date(d).getDate()}</span>
                <span class="cal-marks">
                  {lift && <i class="mk lift" />}
                  {run && <i class="mk cardio" />}
                  {mob && <i class="mk mob" />}
                </span>
              </div>
            );
          })}
        </div>
        <div class="legend muted small-text">
          <span><i class="mk lift" /> Lifting</span>
          <span><i class="mk cardio" /> Cardio</span>
          <span><i class="mk mob" /> Mobility</span>
        </div>
      </div>

      {bests.length > 0 && (
        <div class="card">
          <strong>Exercise progress</strong>
          <select class="input" value={name} onChange={(e) => setPicked((e.target as HTMLSelectElement).value)}>
            {bests.map((b) => <option key={b.name} value={b.name}>{b.name} ({b.sessions})</option>)}
          </select>
          {weighted && (
            <div class="chips">
              {([['e1rm', 'Est. 1RM'], ['top', 'Top weight'], ['volume', 'Volume']] as const).map(([id, label]) => (
                <button key={id} class={metric === id ? 'chip active' : 'chip'} onClick={() => setMetric(id)}>{label}</button>
              ))}
            </div>
          )}
          <div class="hero">
            <span class="stat-v">{Math.round(latest * 10) / 10}</span>
            <span class="muted small-text"> {metricLabel.toLowerCase()} · latest</span>
            {series.length > 1 && (
              <span class="muted small-text"> · {change > 0 ? '▲' : change < 0 ? '▼' : '='} {Math.abs(Math.round(change * 10) / 10)} since {shortDate(series[0].date)}</span>
            )}
          </div>
          <SeriesChart kind="line" label={metricLabel} labels={series.map((p) => shortDate(p.date))} values={series.map(value)} />
          <strong style="display:block; margin-top:16px">Every session</strong>
          <div class="muted small-text">Each set as you logged it ({weighted ? `${u} × reps` : 'reps'}). W marks a warm-up.</div>
          <ExerciseHistory key={name} name={name} units={u} />
        </div>
      )}

      {bests.length > 0 && (
        <div class="card">
          <strong>🏆 Personal records</strong>
          <ul class="slots">
            {bests.slice(0, 12).map((b) => (
              <li key={b.name}>
                <div class="slot-main">
                  <span>{b.name}</span>
                  <span>{b.weight ? `${b.weight} ${u} × ${b.reps}` : `${b.reps} reps`}</span>
                </div>
                <div class="slot-sub muted">{b.e1rm ? `est. 1RM ${b.e1rm} ${u} · ` : ''}{shortDate(b.date)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {workouts.length > 0 && (
        <div class="card">
          <div class="row-between">
            <strong>Sets per muscle</strong>
            <div class="chips" style="margin:0">
              <button class={weekOffset === 0 ? 'chip active' : 'chip'} onClick={() => setWeekOffset(0)}>This week</button>
              <button class={weekOffset === -1 ? 'chip active' : 'chip'} onClick={() => setWeekOffset(-1)}>Last week</button>
            </div>
          </div>
          {muscles.length === 0 ? (
            <p class="muted small-text" style="margin:12px 0 0">No lifting logged that week.</p>
          ) : (
            <div class="hbars">
              {muscles.map((m) => (
                <div key={m.muscle} class="hbar-row" title={`${m.muscle}: ${m.sets} sets`}>
                  <span class="small-text">{m.muscle}</span>
                  <span class="hbar-track"><span class="hbar" style={{ width: `${(m.sets / maxMuscle) * 100}%` }} /></span>
                  <span class="small-text hbar-v">{m.sets}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cardio.length > 0 && (
        <div class="card">
          <strong>Cardio · weekly {hasDistance ? `distance (${du})` : 'time (min)'}</strong>
          <SeriesChart
            kind="bar"
            color={CHART_GREEN}
            label={hasDistance ? `Distance (${du})` : 'Minutes'}
            labels={cardioWeeks.map((w) => shortDate(w.start))}
            values={cardioWeeks.map((w) => (hasDistance ? w.distance : Math.round(w.durationSec / 60)))}
          />
          {runs.length > 0 && (
            <>
              <strong style="display:block; margin-top:16px">Run pace (min/{du})</strong>
              <div class="muted small-text">Higher on the chart is faster.</div>
              <SeriesChart
                kind="line"
                color={CHART_GREEN}
                reverse
                label={`Pace /${du}`}
                format={(v) => formatDuration(Math.round(v))}
                labels={runs.map((r) => shortDate(r.date))}
                values={runs.map((r) => r.durationSec / r.distance!)}
              />
            </>
          )}
        </div>
      )}

      {checkins}
      <BodyWeight body={body} units={u} bw={bw} setBw={setBw} />
    </>
  );
}

function BodyWeight(props: { body: { id?: number; date: number; weight?: number }[]; units: string; bw: string; setBw: (v: string) => void }) {
  const rows = props.body.filter((b) => b.weight);
  const v = Number(props.bw);
  const ok = props.bw.trim() !== '' && !Number.isNaN(v) && v > 0;
  async function add() {
    if (!ok) return;
    await db.body.add({ date: Date.now(), weight: v });
    props.setBw('');
  }
  return (
    <div class="card">
      <strong>Body weight ({props.units})</strong>
      <div style="display:flex; gap:8px; align-items:flex-end">
        <input class="input" type="number" inputMode="decimal" step="any" placeholder="Today's weight" value={props.bw} onInput={(e) => props.setBw((e.target as HTMLInputElement).value)} />
        <button class="btn primary" style="min-height:44px" disabled={!ok} onClick={add}>Add</button>
      </div>
      {rows.length > 0 && (
        <>
          <SeriesChart kind="line" label={`Weight (${props.units})`} labels={rows.map((r) => shortDate(r.date))} values={rows.map((r) => r.weight!)} />
          <ul class="list">
            {[...rows].reverse().slice(0, 5).map((r) => (
              <li key={r.id} class="list-item">
                <span>{r.weight} {props.units} <span class="muted small-text">· {shortDate(r.date)}</span></span>
                <button class="btn small" onClick={() => db.body.delete(r.id!)}>Remove</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
