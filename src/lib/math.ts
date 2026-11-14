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
