import { route } from 'preact-router';
import { useState } from 'preact/hooks';
import { db, getSettings } from '../lib/db';
import { weekStart } from '../lib/stats';
import { useLive } from '../lib/use-live';
import { BASE } from '../base';

/** Mobility circuits logged since Monday. */
export async function mobilityThisWeek(): Promise<number> {
  const start = weekStart(Date.now());
  return db.cardio.filter((c) => c.activity === 'mobility' && c.date >= start).count();
}

export function Mobility(_props: { path?: string }) {
  const settings = useLive(() => getSettings());
  const [done, setDone] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  if (!settings) return <h1>Mobility</h1>;
  const items = settings.mobility;

  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  async function save() {
    if (saving || done.size === 0) return;
    setSaving(true);
    await db.cardio.add({ date: Date.now(), activity: 'mobility', durationSec: 600, notes: `${done.size} of ${items.length} moves` });
    route(`${BASE}/`, true);
  }

  return (
    <>
      <div class="row-between">
        <h1>Mobility circuit</h1>
        <button class="btn small" onClick={() => history.back()}>Cancel</button>
      </div>
      <p class="muted small-text">About 10 minutes. Pick 5–6 moves, start with bodyweight, and back off if anything is sharp or worse the next day.</p>

      {items.length === 0 ? (
        <div class="empty">No moves listed. Add some in Settings.</div>
      ) : (
        <ul class="list checklist">
          {items.map((item, i) => {
            const [name, dose] = item.split(' · ');
            return (
              <li key={i} class={done.has(i) ? 'list-item tappable checked' : 'list-item tappable'} onClick={() => toggle(i)} role="checkbox" aria-checked={done.has(i)}>
                <div>
                  <div>{name}</div>
                  {dose && <div class="muted small-text">{dose}</div>}
                </div>
                <span class={done.has(i) ? 'check done' : 'check'} style="width:44px; display:inline-flex; align-items:center; justify-content:center">✓</span>
              </li>
            );
          })}
        </ul>
      )}

      <button class="btn primary block" style="margin-top:16px" disabled={done.size === 0 || saving} onClick={save}>
        {done.size === 0 ? 'Tick the moves you did' : `Log circuit (${done.size} of ${items.length})`}
      </button>
      <p class="muted small-text">Edit this list in Settings.</p>
    </>
  );
}
