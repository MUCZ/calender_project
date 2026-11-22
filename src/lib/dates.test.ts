import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  monthGridDays,
  parseLocal,
  startOfWeek,
  toDateKey,
  toLocalISO,
} from './dates';

describe('dates', () => {
  it('round-trips local date-times', () => {
    expect(toLocalISO(parseLocal('2026-11-17T09:05'))).toBe('2026-11-17T09:05');
    expect(toDateKey(parseLocal('2026-02-03'))).toBe('2026-02-03');
  });

  it('runs tests in a DST zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  });

  it('starts weeks on Monday', () => {
    expect(toDateKey(startOfWeek(parseLocal('2026-11-17')))).toBe('2026-11-16'); // Tue -> Mon
    expect(toDateKey(startOfWeek(parseLocal('2026-11-22')))).toBe('2026-11-16'); // Sun -> Mon
    expect(toDateKey(startOfWeek(parseLocal('2026-11-16')))).toBe('2026-11-16');
  });

  it('adds days across a DST change without drifting the wall-clock time', () => {
    // US DST ends on 2026-11-01.
    const d = addDays(parseLocal('2026-10-31T09:00'), 1);
    expect(toLocalISO(d)).toBe('2026-11-01T09:00');
    expect(differenceInCalendarDays(parseLocal('2026-11-02'), parseLocal('2026-10-31'))).toBe(2);
  });

  it('clamps month arithmetic to the end of shorter months', () => {
    expect(toDateKey(addMonths(parseLocal('2026-01-31'), 1))).toBe('2026-02-28');
  });

  it('builds a 6-week month grid starting on Monday', () => {
    const days = monthGridDays(parseLocal('2026-11-17'));
    expect(days).toHaveLength(42);
    expect(toDateKey(days[0])).toBe('2026-10-26');
    expect(days[0].getDay()).toBe(1);
  });
});
