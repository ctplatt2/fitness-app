import { describe, expect, it } from 'vitest';
import { backupFilename, checkBackup } from './backup-format';
import { parseCsv, parseHistoryCsv, parseStrongDuration, parseWhen } from './csv-history';

describe('checkBackup', () => {
  const good = { app: 'liftlog', version: 1, exportedAt: 1, data: { exercises: [{}], programs: [], workouts: [{}, {}], sets: [], cardio: [], body: [], settings: [{}] } };
  it('accepts a good backup and counts rows', () => {
    const r = checkBackup(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.counts).toMatchObject({ exercises: 1, workouts: 2, settings: 1 });
  });
  it('rejects other files', () => {
    expect(checkBackup(null).ok).toBe(false);
    expect(checkBackup({ app: 'other' }).ok).toBe(false);
    expect(checkBackup({ ...good, version: 2 }).ok).toBe(false);
    const { sets: _s, ...rest } = good.data;
    const r = checkBackup({ ...good, data: rest });
    expect(r.ok === false && r.error).toContain('sets');
  });
  it('names the file by date', () => {
    expect(backupFilename(new Date(2026, 10, 4).getTime())).toBe('liftlog-backup-2026-11-04.json');
  });
});

describe('csv basics', () => {
  it('handles quotes, commas and newlines in fields', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n"two\nlines",z\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
      ['two\nlines', 'z'],
    ]);
  });
  it('parses dates and durations', () => {
    expect(parseWhen('2023-01-05 18:30:00')).toBe(new Date(2023, 0, 5, 18, 30).getTime());
    expect(parseWhen('5 Jan 2023, 18:30')).toBe(new Date(2023, 0, 5, 18, 30).getTime());
    expect(parseWhen('nonsense')).toBeNull();
    expect(parseStrongDuration('1h 5m')).toBe(3900);
    expect(parseStrongDuration('45m')).toBe(2700);
    expect(parseStrongDuration('3600')).toBe(3600);
  });
});

describe('parseHistoryCsv', () => {
  it('reads a Strong export', () => {
    const csv = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2023-01-05 18:30:00,"Legs, heavy",1h 5m,Squat (Barbell),1,185,5,0,0,,,8',
      '2023-01-05 18:30:00,"Legs, heavy",1h 5m,Squat (Barbell),2,185,5,0,0,felt good,,',
      '2023-01-05 18:30:00,"Legs, heavy",1h 5m,Squat (Barbell),Rest Timer,,,,120,,,',
      '2023-01-05 18:30:00,"Legs, heavy",1h 5m,Plank,1,0,0,0,60,,,',
      '2023-01-07 09:00:00,Push,45m,Bench Press (Barbell),W,95,5,0,0,,,',
    ].join('\n');
    const r = parseHistoryCsv(csv, 'lb');
    expect(r.error).toBeUndefined();
    expect(r.format).toBe('strong');
    expect(r.workouts).toHaveLength(2);
    expect(r.workouts[0]).toMatchObject({ name: 'Legs, heavy', durationSec: 3900 });
    expect(r.workouts[0].sets).toHaveLength(3);
    expect(r.workouts[0].sets[0]).toMatchObject({ exerciseName: 'Squat (Barbell)', weight: 185, reps: 5, rpe: 8 });
    expect(r.workouts[0].sets[1].note).toBe('felt good');
    expect(r.workouts[0].sets[2]).toMatchObject({ exerciseName: 'Plank', reps: 60, timed: true, weight: undefined });
    expect(r.workouts[1].sets[0].type).toBe('warmup');
  });
  it('reads a Hevy export and converts kg to lb', () => {
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      '"Upper","5 Jan 2023, 18:30","5 Jan 2023, 19:15","","Bench Press (Barbell)",,"",0,"warmup",40,10,,,',
      '"Upper","5 Jan 2023, 18:30","5 Jan 2023, 19:15","","Bench Press (Barbell)",,"",1,"normal",100,5,,,9',
      '"Upper","5 Jan 2023, 18:30","5 Jan 2023, 19:15","","Pull Up",,"",0,"failure",,12,,,',
    ].join('\n');
    const r = parseHistoryCsv(csv, 'lb');
    expect(r.format).toBe('hevy');
    expect(r.workouts).toHaveLength(1);
    expect(r.workouts[0].durationSec).toBe(2700);
    expect(r.workouts[0].sets.map((s) => s.type)).toEqual(['warmup', 'normal', 'failure']);
    expect(r.workouts[0].sets[1]).toMatchObject({ weight: 220.5, reps: 5, rpe: 9 });
  });
  it('reads semicolon-separated files and rejects unknown ones', () => {
    const semi = 'Date;Workout Name;Exercise Name;Set Order;Weight;Reps\n2023-01-05 18:30:00;A;Squat;1;100;5\n';
    expect(parseHistoryCsv(semi, 'kg').workouts[0].sets[0]).toMatchObject({ weight: 100, reps: 5 });
    expect(parseHistoryCsv('a,b\n1,2\n', 'lb').error).toContain('Strong or Hevy');
    expect(parseHistoryCsv('', 'lb').error).toBeDefined();
  });
});

describe('lock-screen alarm track', () => {
  it('is a valid WAV: silence for the rest, then beeps', async () => {
    const { buildAlarmWav } = await import('./timer');
    const wav = buildAlarmWav(2);
    const text = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    const view = new DataView(wav.buffer);
    expect(view.getUint32(40, true)).toBe(wav.length - 44);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    // two seconds of silence at 8 kHz…
    expect(wav.slice(44, 44 + 16000).every((b) => b === 128)).toBe(true);
    // …then sound
    expect(wav.slice(44 + 16000, 44 + 16000 + 1600).some((b) => Math.abs(b - 128) > 50)).toBe(true);
  });
});
