import { useState } from 'preact/hooks';
import type { Settings } from '../lib/db';
import { platesPerSide } from '../lib/plates';
import { Sheet } from './Sheet';

export function PlateSheet(props: { weight: number; settings: Settings; onClose: () => void }) {
  const [w, setW] = useState(props.weight);
  const { barWeight, plates, units } = props.settings;
  const per = platesPerSide(w, barWeight, plates);
  return (
    <Sheet title="Plate calculator" onClose={props.onClose}>
      <label>
        <span class="muted small-text">Total weight ({units}), {barWeight} {units} bar</span>
        <input class="input" type="number" inputMode="decimal" value={w} onInput={(e) => setW(Number((e.target as HTMLInputElement).value) || 0)} />
      </label>
      <div class="plates">
        {per === null ? (
          <p class="warn">Can't make {w} {units} exactly with your plates.</p>
        ) : per.length === 0 ? (
          <p class="muted">Empty bar.</p>
        ) : (
          <>
            <p class="muted small-text" style="margin:12px 0 6px">Per side</p>
            <div class="plate-row">
              {per.map((p, i) => (
                <span key={i} class="plate" style={{ height: `${28 + Math.min(40, p)}px` }}>{p}</span>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
