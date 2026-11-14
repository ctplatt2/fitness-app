import { useEffect, useState } from 'preact/hooks';
import { db, getSettings, type Settings } from '../lib/db';

export function SettingsPage(_props: { path?: string }) {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    getSettings().then(setS);
  }, []);

  async function setUnits(units: Settings['units']) {
    if (!s) return;
    const next: Settings = {
      ...s,
      units,
      barWeight: units === 'kg' ? 20 : 45,
      plates: units === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5],
    };
    await db.settings.put(next);
    setS(next);
  }

  if (!s) return <h1>Settings</h1>;
  return (
    <>
      <h1>Settings</h1>
      <div class="card">
        <strong>Units</strong>
        <div style="display:flex; gap:8px; margin-top:8px">
          {(['lb', 'kg'] as const).map((u) => (
            <button key={u} class={s.units === u ? 'btn primary' : 'btn'} onClick={() => setUnits(u)}>
              {u}
            </button>
          ))}
        </div>
        <p class="muted" style="margin:12px 0 0">
          Bar {s.barWeight} {s.units} · plates {s.plates.join(', ')}
        </p>
      </div>
      <div class="card">
        <strong>Distance</strong>
        <div style="display:flex; gap:8px; margin-top:8px">
          {(['mi', 'km'] as const).map((u) => (
            <button
              key={u}
              class={s.distanceUnit === u ? 'btn primary' : 'btn'}
              onClick={async () => {
                const next = { ...s, distanceUnit: u };
                await db.settings.put(next);
                setS(next);
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <div class="card">
        <strong>Data</strong>
        <p class="muted" style="margin:8px 0 0">Backup and restore arrive in phase 6.</p>
      </div>
    </>
  );
}
