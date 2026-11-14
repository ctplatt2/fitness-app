import { Link } from 'preact-router';
import { useMemo, useState } from 'preact/hooks';
import { db, type Exercise } from '../lib/db';
import { useLive } from '../lib/use-live';
import { BASE } from '../base';

const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Traps', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Calves', 'Core', 'Full Body', 'Other'];
const EQUIPMENT = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Kettlebell', 'Other'];

export function Library(_props: { path?: string }) {
  const exercises = useLive(() => db.exercises.orderBy('name').toArray());
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<Exercise, 'id' | 'custom'>>({
    name: '',
    primaryMuscle: 'Chest',
    secondaryMuscles: [],
    equipment: 'Barbell',
    type: 'weight_reps',
    defaultRest: 90,
  });
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const needle = q.trim().toLowerCase();
    return exercises.filter(
      (e) => (!muscle || e.primaryMuscle === muscle) && (!needle || e.name.toLowerCase().includes(needle) || e.equipment.toLowerCase().includes(needle)),
    );
  }, [exercises, q, muscle]);

  async function add() {
    const name = draft.name.trim();
    if (!name) return setError('Give it a name');
    const exists = await db.exercises.where('name').equalsIgnoreCase(name).first();
    if (exists) return setError(`"${exists.name}" already exists`);
    await db.exercises.add({ ...draft, name, custom: true });
    setDraft({ ...draft, name: '' });
    setError('');
    setAdding(false);
  }

  async function remove(e: Exercise) {
    if (!e.custom) return;
    await db.exercises.delete(e.id!);
  }

  return (
    <>
      <div class="row-between">
        <h1>Exercises</h1>
        <Link class="btn small" href={`${BASE}/plans`}>Back</Link>
      </div>

      <input
        class="input"
        type="search"
        placeholder="Search exercises"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      <div class="chips scroll">
        <button class={muscle === '' ? 'chip active' : 'chip'} onClick={() => setMuscle('')}>All</button>
        {MUSCLES.map((m) => (
          <button key={m} class={muscle === m ? 'chip active' : 'chip'} onClick={() => setMuscle(m)}>{m}</button>
        ))}
      </div>

      {!adding ? (
        <button class="btn block" onClick={() => setAdding(true)}>+ Add custom exercise</button>
      ) : (
        <div class="card">
          <strong>New exercise</strong>
          <input class="input" placeholder="Name" value={draft.name} onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })} />
          <div class="grid2">
            <label>
              <span class="muted">Muscle</span>
              <select class="input" value={draft.primaryMuscle} onChange={(e) => setDraft({ ...draft, primaryMuscle: (e.target as HTMLSelectElement).value })}>
                {MUSCLES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>
              <span class="muted">Equipment</span>
              <select class="input" value={draft.equipment} onChange={(e) => setDraft({ ...draft, equipment: (e.target as HTMLSelectElement).value })}>
                {EQUIPMENT.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>
              <span class="muted">Logs</span>
              <select class="input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: (e.target as HTMLSelectElement).value as Exercise['type'] })}>
                <option value="weight_reps">Weight × reps</option>
                <option value="reps">Reps only</option>
                <option value="time">Time</option>
                <option value="distance">Distance</option>
              </select>
            </label>
            <label>
              <span class="muted">Rest (sec)</span>
              <input class="input" type="number" inputMode="numeric" value={draft.defaultRest} onInput={(e) => setDraft({ ...draft, defaultRest: Number((e.target as HTMLInputElement).value) || 0 })} />
            </label>
          </div>
          {error && <p class="err" style="margin:8px 0 0">{error}</p>}
          <div class="chips" style="margin-top:12px">
            <button class="btn small primary" onClick={add}>Add</button>
            <button class="btn small" onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <p class="muted">{filtered.length} of {exercises?.length ?? 0}</p>
      <ul class="list">
        {filtered.map((e) => (
          <li key={e.id} class="list-item">
            <div>
              <div>{e.name} {e.custom && <span class="badge subtle">custom</span>}</div>
              <div class="muted small-text">{e.primaryMuscle} · {e.equipment}{e.secondaryMuscles.length ? ` · also ${e.secondaryMuscles.join(', ')}` : ''}</div>
            </div>
            {e.custom && <button class="btn small" onClick={() => remove(e)}>Remove</button>}
          </li>
        ))}
      </ul>
    </>
  );
}
