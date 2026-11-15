import { useEffect, useState } from 'preact/hooks';

interface TimerState {
  endsAt: number;
  total: number;
  fired: boolean;
  /** When the alarm actually sounded (can be later than endsAt if the app was asleep). */
  firedAt?: number;
}

const KEY = 'liftlog.restTimer';
const LOCK_KEY = 'liftlog.lockAlarm';
/** How long "Rest over" stays on screen after the alarm sounds. */
const LINGER_MS = 20_000;

let current: TimerState | null = load();
const listeners = new Set<() => void>();
let audio: AudioContext | null = null;
let track: HTMLAudioElement | null = null;
let trackUrl = '';

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

// ---- Lock-screen alarm (experimental) --------------------------------------
// Phones suspend a web app's timers once it is in the background, so the beep
// above can't fire. A media track keeps playing, though: we generate a sound
// file that is silence for the length of the rest followed by the beeps, and
// start it when the rest starts.

export function lockAlarmEnabled(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLockAlarm(on: boolean) {
  try {
    if (on) localStorage.setItem(LOCK_KEY, '1');
    else localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
  if (!on) stopTrack();
}

/** 8 kHz, 8-bit mono WAV: `seconds` of silence, then three beeps. */
export function buildAlarmWav(seconds: number): Uint8Array {
  const rate = 8000;
  const silence = Math.max(0, Math.round(seconds * rate));
  const beepLen = Math.round(0.2 * rate);
  const gapLen = Math.round(0.1 * rate);
  const dataLen = silence + 3 * (beepLen + gapLen);
  const out = new Uint8Array(44 + dataLen);
  const view = new DataView(out.buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, dataLen, true);
  out.fill(128, 44); // 128 = silence for unsigned 8-bit
  let o = 44 + silence;
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i < beepLen; i++) {
      const fade = Math.min(1, i / 80, (beepLen - i) / 80);
      out[o + i] = 128 + Math.round(100 * fade * Math.sin((2 * Math.PI * 880 * i) / rate));
    }
    o += beepLen + gapLen;
  }
  return out;
}

function stopTrack() {
  if (track) {
    track.pause();
    track.removeAttribute('src');
  }
  if (trackUrl) URL.revokeObjectURL(trackUrl);
  trackUrl = '';
}

function startTrack(seconds: number) {
  try {
    stopTrack();
    track ??= new Audio();
    trackUrl = URL.createObjectURL(new Blob([buildAlarmWav(seconds) as BlobPart], { type: 'audio/wav' }));
    track.src = trackUrl;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Rest timer', artist: 'Lift Log' });
    }
    void track.play().catch(() => stopTrack());
  } catch {
    stopTrack();
  }
}

const trackPlaying = () => !!track && !!trackUrl && !track.paused && !track.ended;

// ---- Notifications ----------------------------------------------------------

export function notificationState(): 'unsupported' | NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function askForNotifications(): Promise<'unsupported' | NotificationPermission> {
  if (!('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function notify() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
  const options = { body: 'Time for your next set.', tag: 'rest-timer' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification('Rest over', options);
    else new Notification('Rest over', options);
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
  // The lock-screen track carries its own beeps; don't double up.
  if (!trackPlaying()) beep();
  void notify();
}

export const restTimer = {
  start(seconds: number) {
    unlockAudio();
    if (lockAlarmEnabled()) startTrack(seconds);
    set({ endsAt: Date.now() + seconds * 1000, total: seconds, fired: false });
  },
  adjust(deltaSec: number) {
    if (!current) return;
    const endsAt = Math.max(Date.now(), current.endsAt + deltaSec * 1000);
    if (lockAlarmEnabled()) startTrack((endsAt - Date.now()) / 1000);
    set({ endsAt, total: Math.max(1, current.total + deltaSec), fired: false });
  },
  stop() {
    stopTrack();
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
  /** Seconds since the rest was due to end. */
  over: number;
}

/** Live view of the rest timer; fires the alarm once when it reaches zero. */
export function useRestTimer(): TimerView | null {
  const [, force] = useState(0);
  useEffect(() => {
    const bump = () => force((x) => x + 1);
    listeners.add(bump);
    const tick = () => {
      const c = current;
      const now = Date.now();
      if (c && !c.fired && now >= c.endsAt) {
        alarm();
        set({ ...c, fired: true, firedAt: now });
      } else if (c?.fired && now - (c.firedAt ?? c.endsAt) > LINGER_MS) {
        set(null);
      }
      bump();
    };
    const iv = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      listeners.delete(bump);
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  if (!current) return null;
  const now = Date.now();
  return {
    remaining: Math.max(0, Math.ceil((current.endsAt - now) / 1000)),
    total: current.total,
    fired: current.fired,
    over: Math.max(0, Math.floor((now - current.endsAt) / 1000)),
  };
}

export function fmtClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
