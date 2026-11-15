import type { DistanceUnit, PlanWeek, Units } from './db';

const LB_PER_KG = 2.20462;
const KM_PER_MI = 1.609344;

/** Convert a logged weight to the other unit, to the nearest 0.5. */
export function convertWeight(w: number, to: Units): number {
  return Math.round((to === 'kg' ? w / LB_PER_KG : w * LB_PER_KG) * 2) / 2;
}

/** Convert a planned weight, rounded to something loadable (2.5 kg or 5 lb). */
export function convertPlanWeight(w: number, to: Units): number {
  const step = to === 'kg' ? 2.5 : 5;
  const raw = to === 'kg' ? w / LB_PER_KG : w * LB_PER_KG;
  return Math.max(step, Math.round(raw / step) * step);
}

/** Progression steps use the gym convention: 5 lb is 2.5 kg, 10 lb is 5 kg. */
export function convertIncrement(inc: number, to: Units): number {
  return to === 'kg' ? inc / 2 : inc * 2;
}

/** A copy of a plan with its weights and progression steps in the other unit. */
export function convertPlanWeeks(weeks: PlanWeek[], to: Units): PlanWeek[] {
  return weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => ({
      ...d,
      slots: d.slots.map((s) => ({
        ...s,
        weight: s.weight === undefined ? undefined : convertPlanWeight(s.weight, to),
        progression: s.progression.kind === 'none' ? s.progression : { ...s.progression, increment: convertIncrement(s.progression.increment, to) },
      })),
    })),
  }));
}

/** Convert a distance to the other unit, to two decimals. */
export function convertDistance(d: number, to: DistanceUnit): number {
  return Math.round((to === 'km' ? d * KM_PER_MI : d / KM_PER_MI) * 100) / 100;
}

export const EQUIPMENT: Record<Units, { barWeight: number; plates: number[] }> = {
  lb: { barWeight: 45, plates: [45, 35, 25, 10, 5, 2.5] },
  kg: { barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
};
