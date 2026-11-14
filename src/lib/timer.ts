import { useEffect, useState } from 'preact/hooks';

interface TimerState {
  endsAt: number;
  total: number;
  fired: boolean;
}

const KEY = 'liftlog.restTimer';
let current: TimerState | null = load();
const listeners = new Set<() => void>();
let audio: AudioContext | null = null;

function load(): TimerState | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function set(next: TimerState | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/** Must be called from a user gesture so iOS lets us play sound later. */
function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function beep() {
  if (!audio) return;
  try {
    const t0 = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.25 + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0 + i * 0.25);
      osc.stop(t0 + i * 0.25 + 0.22);
    }
  } catch {
    /* ignore */
  }
}

function alarm() {
  try {
    navigator.vibrate?.([200, 100, 200, 100, 400]);
  } catch {
    /* ignore */
  }
  beep();
}

export const restTimer = {
  start(seconds: number) {
    unlockAudio();
    set({ endsAt: Date.now() + seconds * 1000, total: seconds, fired: false });
  },
  adjust(deltaSec: number) {
    if (!current) return;
    const endsAt = Math.max(Date.now(), current.endsAt + deltaSec * 1000);
    set({ ...current, endsAt, total: Math.max(1, current.total + deltaSec), fired: false });
  },
  stop() {
    set(null);
  },
  get() {
    return current;
  },
};

export interface TimerView {
  remaining: number;
  total: number;
  fired: boolean;
}

/** Live view of the rest timer; fires the alarm once when it reaches zero. */
export function useRestTimer(): TimerView | null {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = () => force((x) => x + 1);
    listeners.add(bump);
    const iv = setInterval(() => {
      const c = current;
      if (c && !c.fired && Date.now() >= c.endsAt) {
        alarm();
        set({ ...c, fired: true });
        setTimeout(() => {
          if (current?.fired) set(null);
        }, 5000);
      }
      bump();
    }, 250);
    return () => {
      listeners.delete(bump);
      clearInterval(iv);
    };
  }, []);
  if (!current) return null;
  return {
    remaining: Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000)),
    total: current.total,
    fired: current.fired,
  };
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
