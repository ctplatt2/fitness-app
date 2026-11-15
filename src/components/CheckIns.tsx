import { db, type Settings } from '../lib/db';

export const CHECKPOINTS = [
  { id: 'base', label: 'Baseline' },
  { id: 'wk6', label: 'Week 6' },
  { id: 'wk12', label: 'Week 12' },
] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number]['id'];

/** Which check-in a plan week calls for, if any. */
export function checkpointForWeek(week: number): CheckpointId | null {
  return week === 1 ? 'base' : week === 6 ? 'wk6' : week === 12 ? 'wk12' : null;
}

/** Tests still blank for a checkpoint (ones marked optional don't count). */
export function missingTests(s: Settings, cp: CheckpointId): number {
  return s.testMetrics.filter((m) => !/optional/i.test(m) && !(s.testValues[`${m}|${cp}`] ?? '').trim()).length;
}

/** Baseline, week 6 and week 12 results side by side. Type a result and it saves. */
export function CheckIns(props: { settings: Settings; current?: CheckpointId | null }) {
  const s = props.settings;
  const save = (key: string, value: string) => {
    const testValues = { ...s.testValues };
    if (value.trim()) testValues[key] = value.trim();
    else delete testValues[key];
    return db.settings.put({ ...s, testValues });
  };
  return (
    <div class="card" id="checkins">
      <strong>Check-in tests</strong>
      <p class="muted small-text" style="margin:4px 0 0">
        Record these at the start, week 6 and week 12 to see what changed. Don't test sprints while sore or tired.
      </p>
      {s.testMetrics.length === 0 && <p class="muted small-text">No tests listed. Add some in Settings.</p>}
      {s.testMetrics.map((m) => (
        <div key={m} class="checkin">
          <div class="small-text">{m}</div>
          <div class="grid3" style="margin-top:4px">
            {CHECKPOINTS.map((cp) => {
              const key = `${m}|${cp.id}`;
              return (
                <label key={cp.id}>
                  <span class={props.current === cp.id ? 'small-text' : 'muted small-text'}>{cp.label}</span>
                  <input
                    class="input"
                    key={s.testValues[key] ?? ''}
                    defaultValue={s.testValues[key] ?? ''}
                    placeholder="–"
                    aria-label={`${m}, ${cp.label}`}
                    onChange={(e) => save(key, (e.target as HTMLInputElement).value)}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
