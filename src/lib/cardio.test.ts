import { describe, expect, it } from 'vitest';
import { describeEffort, formatDuration, formatPace, formatSpeed, parseDuration } from './cardio';

describe('parseDuration', () => {
  it('reads minutes, mm:ss and h:mm:ss', () => {
    expect(parseDuration('45')).toBe(2700);
    expect(parseDuration('45:30')).toBe(2730);
    expect(parseDuration('1:05:20')).toBe(3920);
    expect(parseDuration(' 7.5 ')).toBe(450);
  });
  it('rejects junk', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:2:3:4')).toBeNull();
    expect(parseDuration('45:')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(2730)).toBe('45:30');
    expect(formatDuration(3920)).toBe('1:05:20');
  });
  it('formats pace and speed', () => {
    expect(formatPace(30 * 60, 3.1)).toBe('9:41');
    expect(formatPace(600, 1)).toBe('10:00');
    expect(formatSpeed(3600, 15.5)).toBe('15.5');
    expect(formatPace(0, 3)).toBeNull();
  });
  it('picks pace for runs and speed for bikes', () => {
    expect(describeEffort('run', 1800, 3, 'mi')).toBe('10:00 /mi');
    expect(describeEffort('bike', 3600, 20, 'mi')).toBe('20.0 mi/h');
    expect(describeEffort('other', 1500, undefined, 'mi')).toBe('25:00');
  });
});
