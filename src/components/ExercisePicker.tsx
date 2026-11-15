import { useMemo, useState } from 'preact/hooks';
import { db } from '../lib/db';
import { useLive } from '../lib/use-live';
import { Sheet } from './Sheet';

export function ExercisePicker(props: { onPick: (name: string) => void; onClose: () => void; title?: string }) {
  const exercises = useLive(() => db.exercises.orderBy('name').toArray());
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () => (exercises ?? []).filter((e) => !needle || e.name.toLowerCase().includes(needle) || e.primaryMuscle.toLowerCase().includes(needle)),
    [exercises, needle],
  );
  const exact = (exercises ?? []).some((e) => e.name.toLowerCase() === needle);

  async function create() {
    const name = q.trim();
    await db.exercises.add({ name, primaryMuscle: 'Other', secondaryMuscles: [], equipment: 'Other', type: 'weight_reps', defaultRest: 90, custom: true });
    props.onPick(name);
  }

  return (
    <Sheet title={props.title ?? 'Add exercise'} onClose={props.onClose}>
      <input class="input" type="search" placeholder="Search" value={q} autofocus onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <ul class="list" style="max-height:50vh; overflow:auto; margin-top:8px">
        {needle && !exact && (
          <li class="list-item">
            <span>Create “{q.trim()}”</span>
            <button class="btn small primary" onClick={create}>Create</button>
          </li>
        )}
        {list.slice(0, needle ? 60 : 200).map((e) => (
          <li key={e.id} class="list-item tappable" onClick={() => props.onPick(e.name)}>
            <div>
              <div>{e.name}</div>
              <div class="muted small-text">{e.primaryMuscle} · {e.equipment}</div>
            </div>
            <span class="muted">+</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
