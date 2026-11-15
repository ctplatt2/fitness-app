/** Estimated one-rep max (Epley). Returns the weight itself for a single. */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

/** Pace in seconds per unit distance (e.g. sec/mile). */
export function paceSecPerUnit(durationSec: number, distance: number): number | null {
  if (!distance || distance <= 0 || durationSec <= 0) return null;
  return durationSec / distance;
}

export function formatPace(secPerUnit: number | null): string {
  if (secPerUnit === null) return '–';
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * How long a workout lasted, in seconds. Normally start to finish, but if Finish
 * was tapped long after the last set (the workout was left open), it ends at the
 * last completed set instead.
 */
export function sessionSeconds(start: number, finishedAt: number, doneTimes: number[], idleMs = 30 * 60_000): number {
  const last = Math.max(0, ...doneTimes.filter((t) => t >= start && t <= finishedAt));
  const end = last > 0 && finishedAt - last > idleMs ? last : finishedAt;
  return Math.max(0, Math.round((end - start) / 1000));
}
