import { route } from 'preact-router';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { ExercisePicker } from '../components/ExercisePicker';
import { PlateSheet } from '../components/PlateSheet';
import { Sheet } from '../components/Sheet';
import { db, getSettings, type Exercise, type SetType, type Settings, type WorkoutSet } from '../lib/db';
import { smallestStep, warmupRamp } from '../lib/plates';
import { fmtClock, restTimer } from '../lib/timer';
import { useLive } from '../lib/use-live';
import {
  addExercise,
  addSet,
  addWarmupSets,
  completeSet,
  discardWorkout,
  finishWorkout,
  previousSets,
  removeExercise,
  removeSet,
  swapExercise,
  uncompleteSet,
  updateSet,
} from '../lib/workouts';
import { BASE } from '../base';

const TYPE_CYCLE: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const TYPE_LABEL: Record<SetType, string> = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* denied or unsupported */
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, []);
}

function useElapsed(since: number | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  return since ? Math.floor((Date.now() - since) / 1000) : 0;
}

export function WorkoutPage(props: { path?: string; id?: string }) {
  const id = Number(props.id);
  const workout = useLive(() => db.workouts.get(id).then((w) => w ?? null), [id]);
  const sets = useLive(() => db.sets.where('workoutId').equals(id).toArray(), [id]);
  const settings = useLive(() => getSettings());
  const exercises = useLive(() => db.exercises.toArray());
  const [prev, setPrev] = useState<Record<string, WorkoutSet[]>>({});
  const [picker, setPicker] = useState(false);
  const [plates, setPlates] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<'finish' | 'discard' | null>(null);
  const [busy, setBusy] = useState(false);
  useWakeLock();
  const elapsed = useElapsed(workout?.date);

  const exMap = useMemo(() => new Map((exercises ?? []).map((e) => [e.name, e])), [exercises]);

  const groups = useMemo(() => {
    const byOrder = new Map<number, WorkoutSet[]>();
    for (const s of sets ?? []) (byOrder.get(s.order) ?? byOrder.set(s.order, []).get(s.order)!).push(s);
    return [...byOrder.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([order, list]) => ({ order, name: list[0].exerciseName, sets: list.sort((a, b) => a.setIndex - b.setIndex) }));
  }, [sets]);

  const nameKey = groups.map((g) => g.name).join('|');
  useEffect(() => {
    if (!nameKey) return;
    let live = true;
    previousSets(nameKey.split('|')).then((p) => live && setPrev(p));
    return () => {
      live = false;
    };
  }, [nameKey]);

  if (workout === undefined || !sets || !settings) return <h1>Workout</h1>;
  if (!workout) {
    return (
      <>
        <h1>Workout not found</h1>
        <button class="btn" onClick={() => route(`${BASE}/`)}>Home</button>
      </>
    );
  }
  if (workout.finishedAt) {
    route(`${BASE}/workout/${id}/summary`, true);
    return null;
  }

  const undone = sets.filter((s) => !s.done).length;
  const doneCount = sets.length - undone;

  async function onFinish() {
    if (busy) return;
    setBusy(true);
    restTimer.stop();
    const logged = await finishWorkout(id);
    route(logged ? `${BASE}/workout/${id}/summary` : `${BASE}/`, true);
  }
  async function onDiscard() {
    restTimer.stop();
    await discardWorkout(id);
    route(`${BASE}/`, true);
  }

  /** After completing a set, bring the next one into view (supersets alternate exercises). */
  function advanceFrom(set: WorkoutSet) {
    const all = groups.flatMap((g) => g.sets);
    let next: WorkoutSet | undefined;
    if (set.superset) {
      const peers = groups.filter((g) => g.sets[0]?.superset === set.superset);
      const idx = peers.findIndex((g) => g.order === set.order);
      for (let k = 1; k <= peers.length && !next; k++) {
        const g = peers[(idx + k) % peers.length];
        next = g.sets.find((s) => !s.done && s.id !== set.id);
      }
    }
    if (!next) {
      const i = all.findIndex((s) => s.id === set.id);
      next = all.slice(i + 1).find((s) => !s.done) ?? all.find((s) => !s.done && s.id !== set.id);
    }
    if (next) {
      requestAnimationFrame(() => document.getElementById(`set-${next!.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
  }

  return (
    <>
      <div class="row-between">
        <div>
          <h1 style="margin-bottom:0">{workout.dayName ?? 'Workout'}</h1>
          <div class="muted small-text">
            {fmtClock(elapsed)} · {doneCount}/{sets.length} sets
          </div>
        </div>
        <button class="btn small primary" onClick={() => (undone || doneCount === 0 ? setConfirm('finish') : onFinish())} disabled={busy}>
          Finish
        </button>
      </div>

      {groups.map((g) => (
        <ExerciseBlock
          key={g.order}
          workoutId={id}
          name={g.name}
          sets={g.sets}
          prev={prev[g.name] ?? []}
          exercise={exMap.get(g.name)}
          settings={settings}
          onPlates={(w) => setPlates(w)}
          onDone={advanceFrom}
        />
      ))}

      <button class="btn block" style="margin-top:8px" onClick={() => setPicker(true)}>+ Add exercise</button>

      <div style="margin-top:32px; text-align:center">
        <button class="btn small" onClick={() => setConfirm('discard')}>Discard workout</button>
      </div>

      {picker && (
        <ExercisePicker
          onClose={() => setPicker(false)}
          onPick={async (name) => {
            setPicker(false);
            await addExercise(id, name);
          }}
        />
      )}
      {plates !== null && <PlateSheet weight={plates} settings={settings} onClose={() => setPlates(null)} />}
      {confirm === 'finish' && (
        <Sheet title={doneCount === 0 ? 'Nothing logged yet' : 'Finish workout?'} onClose={() => setConfirm(null)}>
          <p>
            {doneCount === 0
              ? 'No sets are marked done, so this workout won’t be saved and your plan stays on this day.'
              : `${undone} set${undone === 1 ? '' : 's'} not marked done will be dropped.`}
          </p>
          <div class="chips">
            <button class={doneCount === 0 ? 'btn danger' : 'btn primary'} onClick={onFinish} disabled={busy}>
              {doneCount === 0 ? 'Discard workout' : 'Finish'}
            </button>
            <button class="btn" onClick={() => setConfirm(null)}>Keep going</button>
          </div>
        </Sheet>
      )}
      {confirm === 'discard' && (
        <Sheet title="Discard workout?" onClose={() => setConfirm(null)}>
          <p>This deletes everything logged in this workout. The plan won't advance.</p>
          <div class="chips">
            <button class="btn danger" onClick={onDiscard}>Discard</button>
            <button class="btn" onClick={() => setConfirm(null)}>Keep</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function ExerciseBlock(props: {
  workoutId: number;
  name: string;
  sets: WorkoutSet[];
  prev: WorkoutSet[];
  exercise?: Exercise;
  settings: Settings;
  onPlates: (weight: number) => void;
  onDone: (set: WorkoutSet) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const type = props.exercise?.type ?? 'weight_reps';
  const timed = type === 'time' || props.sets.some((s) => s.timed);
  const showWeight = type !== 'reps' && type !== 'time';
  const rest = props.sets[0]?.restSec ?? props.exercise?.defaultRest ?? props.settings.defaultRest;
  const superset = props.sets[0]?.superset;
  const working = props.sets.filter((s) => s.type !== 'warmup');
  const warmWeight = working[0]?.weight ?? working[0]?.targetWeight;
  const canWarmup = showWeight && !!warmWeight && warmWeight > props.settings.barWeight && !props.sets.some((s) => s.type === 'warmup');
  const workingIndex = new Map<number, number>();
  let n = 0;
  for (const s of props.sets) if (s.type !== 'warmup') workingIndex.set(s.id!, ++n);
  const prevWorking = props.prev;

  return (
    <div class="card block">
      <div class="row-between">
        <div class="block-title">
          {superset && <span class="ss">{superset}</span>}
          <strong>{props.name}</strong>
          <div class="muted small-text">
            rest {fmtClock(rest)}
            {working[0]?.targetWeight !== undefined && working[0].targetMinReps !== undefined
              ? ` · target ${working[0].targetWeight} ${props.settings.units} × ${working[0].targetMinReps}${
                  working[0].targetMaxReps !== working[0].targetMinReps ? '–' + working[0].targetMaxReps : ''
                }`
              : ''}
          </div>
        </div>
        <button class="btn small" onClick={() => setMenu((v) => !v)} aria-label="Exercise options">⋯</button>
      </div>
      {history && (
        <Sheet title={`${props.name} history`} onClose={() => setHistory(false)}>
          <ExerciseHistory name={props.name} units={props.settings.units} initial={8} />
        </Sheet>
      )}
      {swapping && (
        <ExercisePicker
          title={`Swap ${props.name} for…`}
          onClose={() => setSwapping(false)}
          onPick={async (name) => {
            setSwapping(false);
            await swapExercise(props.workoutId, props.sets[0].order, name);
          }}
        />
      )}
      {menu && (
        <div class="chips">
          <button class="btn small" onClick={() => { setMenu(false); setHistory(true); }}>History</button>
          {props.sets.some((x) => !x.done) && (
            <button class="btn small" onClick={() => { setMenu(false); setSwapping(true); }}>Swap exercise</button>
          )}
          {canWarmup && (
            <button
              class="btn small"
              onClick={async () => {
                setMenu(false);
                await addWarmupSets(props.workoutId, props.sets[0].order, warmupRamp(warmWeight!, props.settings.barWeight, smallestStep(props.settings.plates)));
              }}
            >
              Add warm-up sets
            </button>
          )}
          {showWeight && warmWeight ? (
            <button class="btn small" onClick={() => { setMenu(false); props.onPlates(warmWeight); }}>Plates</button>
          ) : null}
          <button class="btn small danger" onClick={() => removeExercise(props.workoutId, props.sets[0].order)}>Remove exercise</button>
        </div>
      )}

      <div class={showWeight ? 'setgrid' : 'setgrid noweight'}>
        <div class="muted small-text">Set</div>
        <div class="muted small-text">Prev</div>
        {showWeight && <div class="muted small-text">{props.settings.units}</div>}
        <div class="muted small-text">{timed ? 'sec' : 'reps'}</div>
        <div />
        {props.sets.map((s) => (
          <SetRow
            key={s.id}
            set={s}
            label={s.type === 'warmup' ? 'W' : String(workingIndex.get(s.id!))}
            prev={s.type === 'warmup' ? undefined : prevWorking[(workingIndex.get(s.id!) ?? 1) - 1]}
            showWeight={showWeight}
            units={props.settings.units}
            defaultRest={rest}
            onDone={props.onDone}
          />
        ))}
      </div>
      <button class="btn small block" style="margin-top:10px" onClick={() => addSet(props.workoutId, props.sets[0].order)}>+ Add set</button>
    </div>
  );
}

function SetRow(props: {
  set: WorkoutSet;
  label: string;
  prev?: WorkoutSet;
  showWeight: boolean;
  units: string;
  defaultRest: number;
  onDone: (set: WorkoutSet) => void;
}) {
  const { set } = props;
  const [weight, setWeight] = useState(set.weight?.toString() ?? '');
  const [reps, setReps] = useState(set.reps?.toString() ?? '');
  const [editing, setEditing] = useState(false);
  const [more, setMore] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setWeight(set.weight?.toString() ?? '');
      setReps(set.reps?.toString() ?? '');
    }
  }, [set.weight, set.reps]);

  const locked = set.done && !editing;
  const prevText = props.prev
    ? props.showWeight
      ? `${props.prev.weight ?? '—'}×${props.prev.reps ?? '—'}`
      : `${props.prev.reps ?? '—'}`
    : '—';
  const repsPlaceholder =
    set.targetMinReps !== undefined
      ? set.amrap
        ? `${set.targetMinReps}+`
        : set.targetMaxReps !== undefined && set.targetMaxReps !== set.targetMinReps
          ? `${set.targetMinReps}–${set.targetMaxReps}`
          : String(set.targetMinReps)
      : '';

  function commit(field: 'weight' | 'reps', raw: string) {
    const v = raw.trim() === '' ? undefined : Number(raw);
    if (v !== undefined && Number.isNaN(v)) return;
    void updateSet(set.id!, { [field]: v });
  }

  async function toggleDone() {
    if (set.done) {
      await uncompleteSet(set.id!);
      setEditing(false);
      return;
    }
    const rest = await completeSet(set, props.defaultRest);
    if (rest > 0) restTimer.start(rest);
    props.onDone(set);
  }

  function cycleType() {
    const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(set.type) + 1) % TYPE_CYCLE.length];
    void updateSet(set.id!, { type: next });
  }

  return (
    <>
      <button id={`set-${set.id}`} class={`setnum ${set.type}`} onClick={cycleType} title="Tap to change set type">
        {TYPE_LABEL[set.type] || props.label}
      </button>
      <div class="muted small-text prev" onClick={() => setMore((v) => !v)}>{prevText}</div>
      {props.showWeight && (
        <input
          class="input cell"
          type="number"
          inputMode="decimal"
          step="any"
          placeholder={set.targetWeight !== undefined ? String(set.targetWeight) : ''}
          value={weight}
          disabled={locked}
          onFocus={() => (focused.current = true)}
          onBlur={() => (focused.current = false)}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setWeight(v);
            commit('weight', v);
          }}
          onClick={() => locked && setEditing(true)}
        />
      )}
      <input
        class="input cell"
        type="number"
        inputMode="numeric"
        placeholder={repsPlaceholder}
        value={reps}
        disabled={locked}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setReps(v);
          commit('reps', v);
        }}
      />
      <button class={set.done ? 'check done' : 'check'} onClick={toggleDone} aria-label={set.done ? 'Mark not done' : 'Mark done'}>
        ✓
      </button>
      {locked && (
        <div class="lockrow" onClick={() => setEditing(true)}>
          <span class="muted small-text">done · tap to edit</span>
        </div>
      )}
      {more && (
        <div class="morerow">
          <label class="muted small-text">
            RPE
            <select class="input" value={set.rpe ?? ''} onChange={(e) => updateSet(set.id!, { rpe: Number((e.target as HTMLSelectElement).value) || undefined })}>
              <option value="">–</option>
              {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label class="muted small-text" style="flex:1">
            Note
            <input class="input" value={set.note ?? ''} placeholder="e.g. felt heavy" onChange={(e) => updateSet(set.id!, { note: (e.target as HTMLInputElement).value || undefined })} />
          </label>
          <button class="btn small" onClick={() => removeSet(set.id!)} aria-label="Remove set">🗑</button>
        </div>
      )}
    </>
  );
}
