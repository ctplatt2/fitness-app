import type { PlanSlot, Progression } from './db';

export interface PerformedSet {
  weight?: number;
  reps?: number;
  done: boolean;
  type?: 'normal' | 'warmup' | 'drop' | 'failure';
}

export interface Target {
  weight?: number;
  minReps: number;
  maxReps: number;
}

/** Round to the smallest plate step (2.5 lb / 1.25 kg per side → 5 / 2.5 total). */
export function roundToStep(weight: number, step: number): number {
  if (step <= 0) return weight;
  return Math.round(weight / step) * step;
}

/**
 * Work out next session's target for a slot from how the last session went.
 * Only working sets (not warm-ups) count. With no history, the plan's own
 * numbers are the target.
 */
export function nextTarget(slot: PlanSlot, last: PerformedSet[] | undefined, step = 5): Target {
  const base: Target = { weight: slot.weight, minReps: slot.minReps, maxReps: slot.maxReps };
  const working = (last ?? []).filter((s) => s.done && s.type !== 'warmup');
  if (working.length === 0) return base;

  const lastWeight = Math.max(...working.map((s) => s.weight ?? 0));
  const rule: Progression = slot.progression;

  if (rule.kind === 'none') {
    return { ...base, weight: slot.weight ?? (lastWeight || undefined) };
  }

  if (rule.kind === 'lp') {
    const hitAll = working.length >= slot.sets && working.every((s) => (s.reps ?? 0) >= slot.minReps);
    const w = lastWeight || slot.weight || 0;
    return { ...base, weight: hitAll ? roundToStep(w + rule.increment, step) : w || undefined };
  }

  // dp: raise reps inside the range first, then add weight and reset reps.
  const hitTop = working.length >= slot.sets && working.every((s) => (s.reps ?? 0) >= rule.maxReps);
  const w = lastWeight || slot.weight || 0;
  if (hitTop) {
    return { weight: roundToStep(w + rule.increment, step), minReps: rule.minReps, maxReps: rule.maxReps };
  }
  const minAchieved = Math.min(...working.map((s) => s.reps ?? 0));
  const nextMin = Math.min(rule.maxReps, Math.max(rule.minReps, minAchieved + 1));
  return { weight: w || undefined, minReps: nextMin, maxReps: rule.maxReps };
}
