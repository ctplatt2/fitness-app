import { useEffect } from 'preact/hooks';
import { fmtClock, restTimer, useRestTimer } from '../lib/timer';

export function RestTimerBar() {
  const t = useRestTimer();
  useEffect(() => {
    document.body.classList.toggle('has-timer', !!t);
    return () => document.body.classList.remove('has-timer');
  }, [!!t]);
  if (!t) return null;
  const pct = t.total ? Math.max(0, Math.min(100, (t.remaining / t.total) * 100)) : 0;
  return (
    <div class={t.fired ? 'timer fired' : 'timer'} role="timer" aria-live="polite">
      <div class="timer-bar" style={{ width: `${pct}%` }} />
      {t.fired ? (
        <div class="timer-row">
          <div class="timer-clock">
            Rest over
            {t.over >= 5 && <span class="muted small-text"> · {fmtClock(t.over)} ago</span>}
          </div>
          <button class="btn small" onClick={() => restTimer.stop()}>Dismiss</button>
        </div>
      ) : (
        <div class="timer-row">
          <button class="btn small" onClick={() => restTimer.adjust(-30)} aria-label="30 seconds less">−30</button>
          <div class="timer-clock">
            {fmtClock(t.remaining)}
            <span class="muted small-text"> / {fmtClock(t.total)}</span>
          </div>
          <button class="btn small" onClick={() => restTimer.adjust(30)} aria-label="30 seconds more">+30</button>
          <button class="btn small" onClick={() => restTimer.stop()}>Skip</button>
        </div>
      )}
    </div>
  );
}
