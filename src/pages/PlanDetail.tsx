import { Link, route } from 'preact-router';
import { useState } from 'preact/hooks';
import { db, getSettings, type PlanSlot } from '../lib/db';
import { useLive } from '../lib/use-live';
import { serializePlan } from '../lib/plan-parser';
import { setActiveProgram } from '../lib/programs';
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

export function PlanDetail(props: { path?: string; id?: string }) {
  const id = Number(props.id);
  const program = useLive(() => db.programs.get(id).then((p) => p ?? null), [id]);
  const settings = useLive(() => getSettings());
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  return (
    <>
      <div class="row-between">
        <h1 style="margin-bottom:0">{program.name}</h1>
        <Link class="btn small" href={`${BASE}/plans`}>Back</Link>
      </div>
      <p class="muted" style="margin:4px 0 16px">
        {program.active ? `Active · next up: week ${program.cursor.week}, day ${program.cursor.day + 1}` : 'Not active'}
      </p>

      <div class="chips">
        {!program.active && (
          <button class="btn small primary" onClick={() => setActiveProgram(id)}>Make active</button>
        )}
        <Link class="btn small" href={`${BASE}/plans/${id}/edit`}>Edit text</Link>
        <button class="btn small" onClick={copyText}>{copied ? 'Copied!' : 'Copy as text'}</button>
      </div>

      {program.weeks.map((w) => (
        <section key={w.range.join('-')}>
          {!(program.weeks.length === 1 && w.range[0] === 1 && w.range[1] === 1) && (
            <h2>{w.range[0] === w.range[1] ? `Week ${w.range[0]}` : `Weeks ${w.range[0]}–${w.range[1]}`}</h2>
          )}
          {w.days.map((d, di) => (
            <div class="card" key={di}>
              <strong>{d.name}</strong>
              <ul class="slots">
                {d.slots.map((s, si) => (
                  <li key={si}>
                    <div class="slot-main">
                      <span>
                        {s.superset && <span class="ss">{s.superset}</span>}
                        {s.exerciseName}
                      </span>
                      <span class="muted">{describeSlot(s, units)}</span>
                    </div>
                    {(progressionLabel(s, units) || s.note || s.rest) && (
                      <div class="slot-sub muted">
                        {[progressionLabel(s, units), s.rest ? `rest ${Math.floor(s.rest / 60)}:${String(s.rest % 60).padStart(2, '0')}` : '', s.note]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

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
    </>
  );
}
