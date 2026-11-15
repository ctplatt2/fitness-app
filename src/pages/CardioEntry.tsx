import { route } from 'preact-router';
import { useEffect, useState } from 'preact/hooks';
import { ACTIVITIES, describeEffort, formatDuration, parseDuration } from '../lib/cardio';
import { db, getSettings, type Cardio, type CardioActivity } from '../lib/db';
import { advanceProgram, currentDay } from '../lib/programs';
import { useLive } from '../lib/use-live';
import { BASE } from '../base';

function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CardioEntry(props: { path?: string; id?: string }) {
  const editingId = props.id ? Number(props.id) : undefined;
  const settings = useLive(() => getSettings());
  // Opened from a plan day: ?activity=run&plan=<id>
  const query = new URLSearchParams(location.search);
  const planId = !editingId && query.get('plan') ? Number(query.get('plan')) : undefined;
  const preset = ACTIVITIES.find((a) => a.id === query.get('activity'))?.id;
  const [activity, setActivity] = useState<CardioActivity>(preset ?? 'run');
  const [when, setWhen] = useState(toLocalInput(Date.now()));
  const [duration, setDuration] = useState('');
  const [distance, setDistance] = useState('');
  const [hr, setHr] = useState('');
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(!editingId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    db.cardio.get(editingId).then((c) => {
      if (c) {
        setActivity(c.activity);
        setWhen(toLocalInput(c.date));
        setDuration(formatDuration(c.durationSec));
        setDistance(c.distance?.toString() ?? '');
        setHr(c.avgHr?.toString() ?? '');
        setNotes(c.notes ?? '');
      }
      setLoaded(true);
    });
  }, [editingId]);

  if (!settings || !loaded) return <h1>Cardio</h1>;

  const sec = parseDuration(duration);
  const dist = distance.trim() ? Number(distance) : undefined;
  const distOk = dist === undefined || (!Number.isNaN(dist) && dist >= 0);
  const canSave = sec !== null && sec > 0 && distOk;
  const effort = sec && distOk ? describeEffort(activity, sec, dist, settings.distanceUnit) : null;

  async function save() {
    if (!canSave) return;
    const row: Omit<Cardio, 'id'> = {
      date: new Date(when).getTime() || Date.now(),
      activity,
      durationSec: sec!,
      distance: dist || undefined,
      avgHr: hr.trim() ? Number(hr) || undefined : undefined,
      notes: notes.trim() || undefined,
    };
    if (editingId) await db.cardio.update(editingId, row);
    else await db.cardio.add(row);
    if (planId) {
      // Only move the plan on if it is still sitting on a cardio day.
      const p = await db.programs.get(planId);
      if (p && currentDay(p).day?.cardio) await advanceProgram(planId);
      return route(`${BASE}/`, true);
    }
    route(`${BASE}/history`, true);
  }

  async function remove() {
    if (editingId) await db.cardio.delete(editingId);
    route(`${BASE}/history`, true);
  }

  return (
    <>
      <div class="row-between">
        <h1>{editingId ? 'Edit cardio' : 'Log cardio'}</h1>
        <button class="btn small" onClick={() => history.back()}>Cancel</button>
      </div>

      <div class="chips scroll">
        {ACTIVITIES.map((a) => (
          <button key={a.id} class={activity === a.id ? 'chip active' : 'chip'} onClick={() => setActivity(a.id)}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      <div class="card">
        <div class="grid2">
          <label>
            <span class="muted small-text">Duration</span>
            <input class="input" inputMode="numeric" placeholder="45:00 or 1:05:00" value={duration} onInput={(e) => setDuration((e.target as HTMLInputElement).value)} />
          </label>
          <label>
            <span class="muted small-text">Distance ({settings.distanceUnit})</span>
            <input class="input" type="number" inputMode="decimal" step="any" placeholder="optional" value={distance} onInput={(e) => setDistance((e.target as HTMLInputElement).value)} />
          </label>
          <label>
            <span class="muted small-text">Avg HR (bpm)</span>
            <input class="input" type="number" inputMode="numeric" placeholder="optional" value={hr} onInput={(e) => setHr((e.target as HTMLInputElement).value)} />
          </label>
          <label>
            <span class="muted small-text">When</span>
            <input class="input" type="datetime-local" value={when} onInput={(e) => setWhen((e.target as HTMLInputElement).value)} />
          </label>
        </div>
        <label style="display:block; margin-top:10px">
          <span class="muted small-text">Notes</span>
          <input class="input" placeholder="e.g. easy, felt good" value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} />
        </label>
        {duration.trim() && sec === null && <p class="err" style="margin:8px 0 0">Duration should look like 45:00 or 1:05:00.</p>}
        {effort && (
          <div class="effort">
            <span class="stat-v">{effort}</span>
            <span class="muted small-text">{dist ? ` · ${formatDuration(sec!)} · ${dist} ${settings.distanceUnit}` : ''}</span>
          </div>
        )}
      </div>

      {planId && <p class="muted small-text">Saving this also moves your plan on to the next day.</p>}
      <button class="btn primary block" disabled={!canSave} onClick={save}>
        {editingId ? 'Save changes' : 'Save'}
      </button>

      {editingId && (
        <div style="margin-top:24px; text-align:center">
          {confirmDelete ? (
            <div class="chips" style="justify-content:center">
              <button class="btn small danger" onClick={remove}>Yes, delete</button>
              <button class="btn small" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          ) : (
            <button class="btn small" onClick={() => setConfirmDelete(true)}>Delete entry</button>
          )}
        </div>
      )}
    </>
  );
}
