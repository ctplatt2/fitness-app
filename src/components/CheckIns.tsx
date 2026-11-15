import { db, type Settings } from '../lib/db';

export const CHECKPOINTS = [
  { id: 'base', label: 'Baseline' },
  { id: 'wk6', label: 'Week 6' },
  { id: 'wk12', label: 'Week 12' },
] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number]['id'];

/**
 * The three check-ins for a plan of `planWeeks` weeks: the start, the middle and the end.
 * (The ids are storage keys from the original 12-week layout.) Plans without a set length use 12.
 */
export function checkpointsFor(planWeeks?: number): { id: CheckpointId; label: string; week: number }[] {
  const len = planWeeks && planWeeks > 1 ? planWeeks : 12;
  const mid = Math.max(1, Math.round(len / 2));
  return [
    { id: 'base', label: 'Baseline', week: 1 },
    { id: 'wk6', label: `Week ${mid}`, week: mid },
    { id: 'wk12', label: `Week ${len}`, week: len },
  ];
}

/** Which check-in a plan week calls for, if any. */
export function checkpointForWeek(week: number, planWeeks?: number): CheckpointId | null {
  return checkpointsFor(planWeeks).find((c) => c.week === week)?.id ?? null;
}

/** Tests still blank for a checkpoint (ones marked optional don't count). */
export function missingTests(s: Settings, cp: CheckpointId): number {
  return s.testMetrics.filter((m) => !/optional/i.test(m) && !(s.testValues[`${m}|${cp}`] ?? '').trim()).length;
}

/** Baseline, week 6 and week 12 results side by side. Type a result and it saves. */
export function CheckIns(props: { settings: Settings; current?: CheckpointId | null; planWeeks?: number }) {
  const s = props.settings;
  const points = checkpointsFor(props.planWeeks);
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
        Record these at the start, in {points[1].label.toLowerCase()} and in {points[2].label.toLowerCase()} to see what changed. Don't test sprints while sore or tired.
      </p>
      {s.testMetrics.length === 0 && <p class="muted small-text">No tests listed. Add some in Settings.</p>}
      {s.testMetrics.map((m) => (
        <div key={m} class="checkin">
          <div class="small-text">{m}</div>
          <div class="grid3" style="margin-top:4px">
            {points.map((cp) => {
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
