import { describe, expect, it } from 'vitest';
import { EXAMPLE_PLAN, parsePlan, parseProgression, parseSlotLine, serializePlan, weekBlockFor } from './plan-parser';

describe('parseSlotLine', () => {
  it('parses a full line', () => {
    const errs: string[] = [];
    const s = parseSlotLine('Bench Press / 3x8 / 135lb / rest 2:30 / progress: lp(5lb) / rpe 8 / superset A / pause reps', 1, errs);
    expect(errs).toEqual([]);
    expect(s).toMatchObject({
      exerciseName: 'Bench Press',
      sets: 3,
      minReps: 8,
      maxReps: 8,
      weight: 135,
      rest: 150,
      rpe: 8,
      superset: 'A',
      note: 'pause reps',
      progression: { kind: 'lp', increment: 5 },
    });
  });
  it('parses rep ranges, AMRAP, timed sets and bodyweight', () => {
    const errs: string[] = [];
    expect(parseSlotLine('Incline DB Press / 3x8-12 / progress: dp(5, 8, 12)', 1, errs)).toMatchObject({
      minReps: 8,
      maxReps: 12,
      progression: { kind: 'dp', increment: 5, minReps: 8, maxReps: 12 },
    });
    expect(parseSlotLine('Squat / 1x5+ / 225', 2, errs)).toMatchObject({ amrap: true, minReps: 5, weight: 225 });
    expect(parseSlotLine('Plank / 3x60s', 3, errs)).toMatchObject({ timed: true, minReps: 60 });
    expect(parseSlotLine('Pull-Up / 3x8 / bw', 4, errs)).toMatchObject({ weight: undefined });
    expect(parseSlotLine('Row / 3x8 / rest 90s', 5, errs)).toMatchObject({ rest: 90 });
    expect(parseSlotLine('Row / 3x8 / rest 2min', 6, errs)).toMatchObject({ rest: 120 });
    expect(errs).toEqual([]);
  });
  it('reports bad progression and missing sets', () => {
    const errs: string[] = [];
    parseSlotLine('Curl / 3x10 / progress: magic(2)', 7, errs);
    parseSlotLine('Curl', 8, errs);
    expect(errs[0]).toContain('unknown progression');
    expect(errs[1]).toContain('no sets x reps');
  });
});

describe('parseProgression', () => {
  it('handles units and none', () => {
    expect(parseProgression('lp(2.5kg)')).toEqual({ kind: 'lp', increment: 2.5 });
    expect(parseProgression('none')).toEqual({ kind: 'none' });
    expect(parseProgression('dp(5lb, 12, 8)')).toBeNull();
  });
});

describe('parsePlan', () => {
  it('parses the example plan', () => {
    const p = parsePlan(EXAMPLE_PLAN);
    expect(p.errors).toEqual([]);
    expect(p.name).toBe('Push Pull Legs');
    expect(p.weeks).toHaveLength(2);
    expect(p.weeks[0].range).toEqual([1, 3]);
    expect(p.weeks[1].range).toEqual([4, 4]);
    expect(p.weeks[0].days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Legs']);
    expect(p.weeks[0].days[0].slots).toHaveLength(5);
    expect(p.exerciseNames).toContain('Face Pull');
  });
  it('works with no week or day headers', () => {
    const p = parsePlan('Squat / 3x5\nBench Press / 3x5');
    expect(p.errors).toEqual([]);
    expect(p.name).toBe('Untitled plan');
    expect(p.weeks).toEqual([
      { range: [1, 1], days: [{ name: 'Day 1', slots: expect.any(Array) }] },
    ]);
  });
  it('round-trips through serializePlan', () => {
    const p = parsePlan(EXAMPLE_PLAN);
    const text = serializePlan(p.name, p.weeks, 'lb');
    const again = parsePlan(text);
    expect(again.errors).toEqual([]);
    expect(again.weeks).toEqual(p.weeks);
  });
  it('flags empty days and backwards ranges', () => {
    const p = parsePlan('# X\n## Week 4-2\n### A\n');
    expect(p.errors.join('\n')).toContain('backwards');
    expect(p.errors.join('\n')).toContain('no exercises');
  });
});

describe('weekBlockFor', () => {
  it('loops after the last week', () => {
    const { weeks } = parsePlan(EXAMPLE_PLAN);
    expect(weekBlockFor(weeks, 2).block.range).toEqual([1, 3]);
    expect(weekBlockFor(weeks, 4).block.range).toEqual([4, 4]);
    expect(weekBlockFor(weeks, 5)).toMatchObject({ weekNumber: 1 });
  });
});
