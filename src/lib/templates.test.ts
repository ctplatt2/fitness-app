import { describe, expect, it } from 'vitest';
import { parsePlan } from './plan-parser';
import { SEED_EXERCISES } from './seed-exercises';
import { TEMPLATES } from './templates';

describe('built-in templates', () => {
  const known = new Set(SEED_EXERCISES.map((e) => e.name.toLowerCase()));
  for (const t of TEMPLATES) {
    it(`${t.name} parses cleanly and uses only library exercises`, () => {
      const p = parsePlan(t.text);
      expect(p.errors).toEqual([]);
      const unknown = p.exerciseNames.filter((n) => !known.has(n.toLowerCase()));
      expect(unknown).toEqual([]);
    });
  }
  it('the 12-week plan covers weeks 1–12 with 4 days each', () => {
    const p = parsePlan(TEMPLATES[0].text);
    expect(p.weeks.map((w) => w.range)).toEqual([[1, 3], [4, 4], [5, 7], [8, 8], [9, 11], [12, 12]]);
    for (const w of p.weeks) expect(w.days).toHaveLength(4);
  });
});
