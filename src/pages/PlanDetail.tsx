import { Link, route } from 'preact-router';
import { useMemo, useState } from 'preact/hooks';
import { ExercisePicker } from '../components/ExercisePicker';
import { Sheet } from '../components/Sheet';
import { db, getSettings, type PlanSlot, type PlanWeek, type Progression } from '../lib/db';
import { useLive } from '../lib/use-live';
import { parsePlan, serializePlan, weekBlockFor } from '../lib/plan-parser';
import { cardioMinutes, planLength, saveProgramWeeks, setActiveProgram, updateFromTemplate, upcomingDays } from '../lib/programs';
import { TEMPLATES } from '../lib/templates';
import { BASE } from '../base';

export function describeSlot(s: PlanSlot, units: string): string {
  let reps = `${s.sets}×${s.minReps}`;
  if (s.maxReps !== s.minReps) reps += `–${s.maxReps}`;
  if (s.amrap) reps += '+';
  if (s.timed) reps += 's';
  const bits = [reps];
  if (s.weight !== undefined) bits.push(`${s.weight} ${units}`);
  if (s.rpe !== undefined) bits.push(`RPE ${s.rpe}`);
  return bits.join(' · ');
}

export function progressionLabel(s: PlanSlot, units: string): string {
  const p = s.progression;
  if (p.kind === 'lp') return `+${p.increment} ${units} when all sets hit`;
  if (p.kind === 'dp') {
    return p.increment > 0 ? `${p.minReps}→${p.maxReps} reps, then +${p.increment} ${units}` : `${p.minReps}→${p.maxReps} reps`;
  }
  return '';
}

const fmtRest = (sec: number) => `rest ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const blockTitle = (w: PlanWeek) => (w.range[0] === w.range[1] ? `Week ${w.range[0]}` : `Weeks ${w.range[0]}–${w.range[1]}`);

type SlotRef = { block: number; day: number; slot: number };

export function PlanDetail(props: { path?: string; id?: string }) {
  const id = Number(props.id);
  const program = useLive(() => db.programs.get(id).then((p) => p ?? null), [id]);
  const settings = useLive(() => getSettings());
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState<SlotRef | null>(null);
  const [addingTo, setAddingTo] = useState<{ block: number; day: number } | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  // A built-in plan of the same name that has run/sport/rest days this copy lacks.
  const newer = useMemo(() => {
    if (!program) return null;
    const hasExtras = (weeks: PlanWeek[]) => weeks.some((w) => w.days.some((d) => d.cardio || d.rest));
    if (hasExtras(program.weeks)) return null;
    const t = TEMPLATES.find((x) => x.name === program.name);
    return t && hasExtras(parsePlan(t.text).weeks) ? t : null;
  }, [program]);

  if (program === undefined || !settings) return <h1>Plan</h1>;
  if (program === null) {
    return (
      <>
        <h1>Plan not found</h1>
        <Link class="btn" href={`${BASE}/plans`}>Back to plans</Link>
      </>
    );
  }

  const units = settings.units;
  const nextBlock = weekBlockFor(program.weeks, program.cursor.week).block;
  const nextDay = Math.min(program.cursor.day, Math.max(0, nextBlock.days.length - 1));
  const coming = upcomingDays(program, 5);
  const single = program.weeks.length === 1;

  /** Apply a change to a copy of the plan and save it. */
  async function change(fn: (weeks: PlanWeek[]) => void) {
    const weeks = structuredClone(program!.weeks);
    fn(weeks);
    await saveProgramWeeks(id, program!.name, weeks, units);
  }

  async function copyText() {
    const text = program!.sourceText || serializePlan(program!.name, program!.weeks, units);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function remove() {
    await db.programs.delete(id);
    route(`${BASE}/plans`, true);
  }

  const editingSlot = editing ? program.weeks[editing.block]?.days[editing.day]?.slots[editing.slot] : undefined;
  const editingBlock = editing ? program.weeks[editing.block] : undefined;

  return (
    <>
      <div class="row-between">
        <h1 style="margin-bottom:0">{program.name}</h1>
        <Link class="btn small" href={`${BASE}/plans`}>Back</Link>
      </div>
      <p class="muted" style="margin:4px 0 16px">
        {program.active ? `Active · week ${coming[0]?.week ?? 1} of ${planLength(program)}` : 'Not active'}
      </p>

      <div class="chips">
        {!program.active && (
          <button class="btn small primary" onClick={() => setActiveProgram(id)}>Make active</button>
        )}
        <Link class="btn small" href={`${BASE}/plans/${id}/edit`}>Edit as text</Link>
        <button class="btn small" onClick={copyText}>{copied ? 'Copied!' : 'Copy as text'}</button>
      </div>

      {program.active && coming.length > 0 && (
        <div class="card active">
          <strong>Coming up</strong>
          <ul class="slots">
            {coming.map((d, i) => (
              <li key={i}>
                <div class="slot-main">
                  <span>
                    {i === 0 && <span class="ss">Next</span>}
                    {d.name}
                  </span>
                  <span class="muted small-text">week {d.week}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {newer && (
        <div class="notice" style="margin-bottom:12px">
          <div class="small-text">
            <strong>Update available.</strong> This plan now includes the Tuesday run, Saturday sport or run, and Sunday rest days, so Today can show them.
            {confirmUpdate && ' Updating replaces any changes you made to this plan\u2019s exercises. Your logged workouts and your place in the plan are kept.'}
          </div>
          <div class="chips" style="margin-bottom:0">
            {confirmUpdate ? (
              <>
                <button class="btn small primary" onClick={() => updateFromTemplate(program, newer.text)}>Yes, update</button>
                <button class="btn small" onClick={() => setConfirmUpdate(false)}>Cancel</button>
              </>
            ) : (
              <button class="btn small primary" onClick={() => setConfirmUpdate(true)}>Update plan</button>
            )}
          </div>
        </div>
      )}

      <p class="muted small-text">Tap an exercise to change it. Changes apply to every week in that block.</p>

      {program.weeks.map((w, bi) => {
        const days = w.days.map((d, di) => (
          <div class="card" key={di}>
            <div class="row-between">
              <strong>{d.name}</strong>
              {program.active &&
                (w === nextBlock && di === nextDay ? (
                  <span class="badge">Next up</span>
                ) : (
                  <button
                    class="btn small"
                    onClick={() => db.programs.update(id, { cursor: { week: w === nextBlock ? program.cursor.week : w.range[0], day: di } })}
                  >
                    Set as next
                  </button>
                ))}
            </div>
            {d.rest && <p class="muted" style="margin:8px 0 0">Rest day{d.note ? `: ${d.note}` : ''}</p>}
            {d.cardio && (
              <p style="margin:8px 0 0">
                {d.cardio.label}
                {cardioMinutes(d.cardio) ? ` · ${cardioMinutes(d.cardio)}` : ''}
                {d.cardio.note && <span class="muted small-text" style="display:block; margin-top:2px">{d.cardio.note}</span>}
              </p>
            )}
            <ul class="slots">
              {d.slots.map((s, si) => (
                <li key={si} class="tappable" onClick={() => setEditing({ block: bi, day: di, slot: si })}>
                  <div class="slot-main">
                    <span>
                      {s.superset && <span class="ss">{s.superset}</span>}
                      {s.exerciseName}
                    </span>
                    <span class="muted">{describeSlot(s, units)} ›</span>
                  </div>
                  {(progressionLabel(s, units) || s.note || s.rest) && (
                    <div class="slot-sub muted">
                      {[progressionLabel(s, units), s.rest ? fmtRest(s.rest) : '', s.note].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!d.rest && !d.cardio && (
              <button class="btn small block" style="margin-top:8px" onClick={() => setAddingTo({ block: bi, day: di })}>+ Add exercise</button>
            )}
          </div>
        ));
        return single ? (
          <section key={bi}>{days}</section>
        ) : (
          <details key={bi} class="block-details" open={w === nextBlock || !program.active}>
            <summary>
              {blockTitle(w)}
              {program.active && w === nextBlock && <span class="badge subtle">current</span>}
            </summary>
            {days}
          </details>
        );
      })}

      <div style="margin-top:24px">
        {confirmDelete ? (
          <div class="chips">
            <button class="btn small danger" onClick={remove}>Yes, delete</button>
            <button class="btn small" onClick={() => setConfirmDelete(false)}>Keep</button>
          </div>
        ) : (
          <button class="btn small" onClick={() => setConfirmDelete(true)}>Delete plan</button>
        )}
      </div>

      {editing && editingSlot && editingBlock && (
        <SlotEditor
          slot={editingSlot}
          units={units}
          scope={single ? '' : blockTitle(editingBlock)}
          count={program.weeks[editing.block].days[editing.day].slots.length}
          index={editing.slot}
          onClose={() => setEditing(null)}
          onSave={async (next) => {
            const at = editing;
            setEditing(null);
            await change((weeks) => (weeks[at.block].days[at.day].slots[at.slot] = next));
          }}
          onRemove={async () => {
            const at = editing;
            setEditing(null);
            await change((weeks) => weeks[at.block].days[at.day].slots.splice(at.slot, 1));
          }}
          onMove={async (delta) => {
            const at = editing;
            const to = at.slot + delta;
            setEditing({ ...at, slot: to });
            await change((weeks) => {
              const slots = weeks[at.block].days[at.day].slots;
              [slots[at.slot], slots[to]] = [slots[to], slots[at.slot]];
            });
          }}
        />
      )}
      {addingTo && (
        <ExercisePicker
          onClose={() => setAddingTo(null)}
          onPick={async (name) => {
            const at = addingTo;
            setAddingTo(null);
            await change((weeks) => weeks[at.block].days[at.day].slots.push({ exerciseName: name, sets: 3, minReps: 8, maxReps: 8, progression: { kind: 'none' } }));
            setEditing({ ...at, slot: program.weeks[at.block].days[at.day].slots.length });
          }}
        />
      )}
    </>
  );
}

function SlotEditor(props: {
  slot: PlanSlot;
  units: string;
  scope: string;
  index: number;
  count: number;
  onSave: (s: PlanSlot) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onClose: () => void;
}) {
  const s = props.slot;
  const [sets, setSets] = useState(String(s.sets));
  const [minReps, setMinReps] = useState(String(s.minReps));
  const [maxReps, setMaxReps] = useState(String(s.maxReps));
  const [weight, setWeight] = useState(s.weight?.toString() ?? '');
  const [rest, setRest] = useState(s.rest?.toString() ?? '');
  const [kind, setKind] = useState<Progression['kind']>(s.progression.kind);
  const [inc, setInc] = useState(s.progression.kind === 'none' ? '5' : String(s.progression.increment));
  const [note, setNote] = useState(s.note ?? '');
  const [error, setError] = useState('');

  function save() {
    const n = Math.round(Number(sets));
    const lo = Math.round(Number(minReps));
    const hi = Math.round(Number(maxReps || minReps));
    if (!(n >= 1)) return setError('Sets should be 1 or more.');
    if (!(lo >= 1)) return setError(`${s.timed ? 'Seconds' : 'Reps'} should be 1 or more.`);
    if (!(hi >= lo)) return setError('The top of the range should be at least the bottom.');
    const w = weight.trim() === '' ? undefined : Number(weight);
    if (w !== undefined && !(w >= 0)) return setError('Weight should be a number, or blank.');
    const r = rest.trim() === '' ? undefined : Math.round(Number(rest));
    if (r !== undefined && !(r >= 0)) return setError('Rest should be a number of seconds, or blank.');
    const step = Number(inc);
    if (kind !== 'none' && !(step >= 0)) return setError('The weight jump should be a number.');
    const progression: Progression =
      kind === 'lp' ? { kind: 'lp', increment: step } : kind === 'dp' ? { kind: 'dp', increment: step, minReps: lo, maxReps: hi } : { kind: 'none' };
    props.onSave({ ...s, sets: n, minReps: lo, maxReps: hi, weight: w, rest: r, progression, note: note.trim() || undefined });
  }

  const num = (set: (v: string) => void) => (e: Event) => set((e.target as HTMLInputElement).value);

  return (
    <Sheet title={s.exerciseName} onClose={props.onClose}>
      {props.scope && <p class="muted small-text" style="margin:0 0 4px">Applies to {props.scope.toLowerCase()}.</p>}
      <div class="grid3">
        <label>
          <span class="muted">Sets</span>
          <input class="input" type="number" inputMode="numeric" value={sets} onInput={num(setSets)} />
        </label>
        <label>
          <span class="muted">{s.timed ? 'Seconds' : 'Reps'} from</span>
          <input class="input" type="number" inputMode="numeric" value={minReps} onInput={num(setMinReps)} />
        </label>
        <label>
          <span class="muted">to</span>
          <input class="input" type="number" inputMode="numeric" value={maxReps} onInput={num(setMaxReps)} />
        </label>
      </div>
      <div class="grid2">
        <label>
          <span class="muted">Start weight ({props.units})</span>
          <input class="input" type="number" inputMode="decimal" step="any" placeholder="blank" value={weight} onInput={num(setWeight)} />
        </label>
        <label>
          <span class="muted">Rest (sec)</span>
          <input class="input" type="number" inputMode="numeric" placeholder="default" value={rest} onInput={num(setRest)} />
        </label>
      </div>
      <label style="display:block; margin-top:10px">
        <span class="muted small-text">How it progresses</span>
        <select class="input" value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value as Progression['kind'])}>
          <option value="none">Stays the same</option>
          <option value="lp">Add weight when every set hits its reps</option>
          <option value="dp">Build reps through the range, then add weight</option>
        </select>
      </label>
      {kind !== 'none' && (
        <label style="display:block; margin-top:10px">
          <span class="muted small-text">Weight jump ({props.units})</span>
          <input class="input" type="number" inputMode="decimal" step="any" value={inc} onInput={num(setInc)} />
        </label>
      )}
      <label style="display:block; margin-top:10px">
        <span class="muted small-text">Note</span>
        <input class="input" value={note} onInput={num(setNote)} />
      </label>
      {error && <p class="err small-text" style="margin:10px 0 0">{error}</p>}
      <div class="chips" style="margin-top:16px">
        <button class="btn primary" style="flex:1" onClick={save}>Save</button>
        <button class="btn small" disabled={props.index === 0} onClick={() => props.onMove(-1)} aria-label="Move up">↑</button>
        <button class="btn small" disabled={props.index >= props.count - 1} onClick={() => props.onMove(1)} aria-label="Move down">↓</button>
        <button class="btn small danger" onClick={props.onRemove}>Remove</button>
      </div>
    </Sheet>
  );
}
