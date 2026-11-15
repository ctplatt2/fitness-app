import type { CardioActivity } from './db';

export const ACTIVITIES: { id: CardioActivity; label: string; icon: string; paced: boolean }[] = [
  { id: 'run', label: 'Run', icon: '🏃', paced: true },
  { id: 'walk', label: 'Walk', icon: '🚶', paced: true },
  { id: 'bike', label: 'Bike', icon: '🚴', paced: false },
  { id: 'row', label: 'Row', icon: '🚣', paced: true },
  { id: 'swim', label: 'Swim', icon: '🏊', paced: true },
  { id: 'other', label: 'Other', icon: '⏱', paced: false },
  { id: 'mobility', label: 'Mobility', icon: '🧘', paced: false },
];

/** "45", "45:30" or "1:05:20" → seconds. Null when it isn't a time. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return Math.round(nums[0] * 60);
  if (nums.length === 2) return Math.round(nums[0] * 60 + nums[1]);
  if (nums.length === 3) return Math.round(nums[0] * 3600 + nums[1] * 60 + nums[2]);
  return null;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** min:sec per distance unit, e.g. "9:41". */
export function formatPace(durationSec: number, distance: number): string | null {
  if (!distance || distance <= 0 || durationSec <= 0) return null;
  const per = durationSec / distance;
  const m = Math.floor(per / 60);
  const s = Math.round(per % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Distance units per hour, one decimal. */
export function formatSpeed(durationSec: number, distance: number): string | null {
  if (!distance || distance <= 0 || durationSec <= 0) return null;
  return (distance / (durationSec / 3600)).toFixed(1);
}

/** The headline number for an activity: pace for runs, speed for bikes. */
export function describeEffort(activity: CardioActivity, durationSec: number, distance: number | undefined, distUnit: string): string {
  const a = ACTIVITIES.find((x) => x.id === activity);
  if (!distance) return formatDuration(durationSec);
  if (a?.paced) {
    const p = formatPace(durationSec, distance);
    return p ? `${p} /${distUnit}` : formatDuration(durationSec);
  }
  const s = formatSpeed(durationSec, distance);
  return s ? `${s} ${distUnit}/h` : formatDuration(durationSec);
}
