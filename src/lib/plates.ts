/** Plates to load on each side of the bar, heaviest first. Null when it can't be made exactly. */
export function platesPerSide(target: number, bar: number, plates: number[]): number[] | null {
  if (target < bar) return null;
  let perSide = (target - bar) / 2;
  const out: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (perSide >= p - 1e-9) {
      out.push(p);
      perSide -= p;
    }
  }
  return Math.abs(perSide) < 1e-9 ? out : null;
}

/** Smallest weight change the plates allow (two of the smallest plate). */
export function smallestStep(plates: number[]): number {
  return plates.length ? Math.min(...plates) * 2 : 5;
}

export function roundToStep(weight: number, step: number): number {
  return Math.round(weight / step) * step;
}

/** A ramp of warm-up sets up to a working weight, rounded to what the plates allow. */
export function warmupRamp(work: number, bar: number, step: number): { weight: number; reps: number }[] {
  if (work <= bar) return [];
  const ramp: { weight: number; reps: number }[] = [];
  const scheme: [number, number][] = [
    [0.5, 5],
    [0.7, 3],
    [0.85, 1],
  ];
  if (work >= bar * 1.5) ramp.push({ weight: bar, reps: 10 });
  for (const [pct, reps] of scheme) {
    const w = roundToStep(work * pct, step);
    if (w <= bar || w >= work) continue;
    if (ramp.length && ramp[ramp.length - 1].weight >= w) continue;
    ramp.push({ weight: w, reps });
  }
  return ramp;
}
