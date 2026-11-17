import { describe, expect, it } from 'vitest';
import { parseLocal, toLocalISO } from './dates';
import { deleteWithScope, describeRecurrence, expandEvents, updateWithScope } from './recurrence';
import type { CalendarEvent, Occurrence } from './types';

const range = (a: string, b: string) => [parseLocal(a), parseLocal(b)] as const;
const iso = (o: Occurrence) => `${toLocalISO(o.start)}/${toLocalISO(o.end)}`;

// Mon/Wed 09:00–10:00 starting Monday 2026-11-02.
const series: CalendarEvent = {
  id: 's1',
  title: 'Standup',
  start: '2026-11-02T09:00',
  end: '2026-11-02T10:00',
  allDay: false,
  calendarId: 'work',
  recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 3] },
};

function occOn(event: CalendarEvent, date: string): Occurrence {
  const occ = expandEvents([event], ...range(date, `${date}T23:59`)).find((o) => o.occurrenceDate === date);
  if (!occ) throw new Error(`no occurrence on ${date}`);
  return occ;
}

describe('expandEvents', () => {
  it('expands a weekly series on the chosen weekdays', () => {
    const occs = expandEvents([series], ...range('2026-11-09', '2026-11-16'));
    expect(occs.map(iso)).toEqual(['2026-11-09T09:00/2026-11-09T10:00', '2026-11-11T09:00/2026-11-11T10:00']);
    expect(occs.every((o) => o.recurring)).toBe(true);
  });

  it('does not produce occurrences before the series starts or after `until`', () => {
    const limited = { ...series, recurrence: { ...series.recurrence!, until: '2026-11-09' } };
    const occs = expandEvents([limited], ...range('2026-10-26', '2026-11-30'));
    expect(occs.map((o) => o.occurrenceDate)).toEqual(['2026-11-02', '2026-11-04', '2026-11-09']);
  });

  it('honours an every-2-weeks interval', () => {
    const biweekly = { ...series, recurrence: { ...series.recurrence!, interval: 2, byWeekday: [1] } };
    const occs = expandEvents([biweekly], ...range('2026-11-01', '2026-12-01'));
    expect(occs.map((o) => o.occurrenceDate)).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
  });

  it('keeps the wall-clock time across a DST change', () => {
    const occs = expandEvents([{ ...series, start: '2026-10-26T09:00', end: '2026-10-26T10:00' }], ...range('2026-10-26', '2026-11-03'));
    expect(occs.map((o) => toLocalISO(o.start))).toEqual(['2026-10-26T09:00', '2026-10-28T09:00', '2026-11-02T09:00']);
  });

  it('includes an occurrence crossing midnight into the range', () => {
    const late: CalendarEvent = { ...series, start: '2026-11-02T23:00', end: '2026-11-03T01:00', recurrence: { freq: 'weekly', interval: 1, byWeekday: [1] } };
    const occs = expandEvents([late], ...range('2026-11-10', '2026-11-11'));
    expect(occs.map(iso)).toEqual(['2026-11-09T23:00/2026-11-10T01:00']);
  });

  it('applies exdates and overrides, even when an override moves outside the base window', () => {
    const e: CalendarEvent = {
      ...series,
      exdates: ['2026-11-09'],
      overrides: { '2026-11-11': { start: '2026-11-20T15:00', end: '2026-11-20T15:30', title: 'Moved' } },
    };
    expect(expandEvents([e], ...range('2026-11-09', '2026-11-16'))).toHaveLength(0);
    const moved = expandEvents([e], ...range('2026-11-20', '2026-11-21'));
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ title: 'Moved', isException: true, occurrenceDate: '2026-11-11' });
  });
});

describe('updateWithScope', () => {
  it('updates a non-recurring event directly', () => {
    const e: CalendarEvent = { id: 'a', title: 'A', start: '2026-11-02T09:00', end: '2026-11-02T10:00', allDay: false, calendarId: 'work' };
    const [occ] = expandEvents([e], ...range('2026-11-02', '2026-11-03'));
    const next = updateWithScope(e, occ, { start: parseLocal('2026-11-03T22:00'), end: parseLocal('2026-11-04T01:00') }, 'single');
    expect(next).toMatchObject({ start: '2026-11-03T22:00', end: '2026-11-04T01:00' });
  });

  it('"this occurrence only" creates an override and leaves the series untouched', () => {
    const occ = occOn(series, '2026-11-11');
    const next = updateWithScope(series, occ, { start: parseLocal('2026-11-11T14:00'), end: parseLocal('2026-11-11T15:00'), title: 'Special' }, 'single');
    expect(next.start).toBe(series.start);
    expect(next.overrides).toEqual({ '2026-11-11': { start: '2026-11-11T14:00', end: '2026-11-11T15:00', title: 'Special' } });
    const occs = expandEvents([next], ...range('2026-11-09', '2026-11-16'));
    expect(occs.map((o) => `${o.title}@${toLocalISO(o.start)}`)).toEqual(['Standup@2026-11-09T09:00', 'Special@2026-11-11T14:00']);
  });

  it('"entire series" shifts time of day and duration for every occurrence', () => {
    const occ = occOn(series, '2026-11-11');
    const next = updateWithScope(series, occ, { start: parseLocal('2026-11-11T09:30'), end: parseLocal('2026-11-11T11:00') }, 'series');
    expect(next).toMatchObject({ start: '2026-11-02T09:30', end: '2026-11-02T11:00' });
    const occs = expandEvents([next], ...range('2026-11-16', '2026-11-23'));
    expect(occs.map(iso)).toEqual(['2026-11-16T09:30/2026-11-16T11:00', '2026-11-18T09:30/2026-11-18T11:00']);
  });

  it('"entire series" dragged to another day shifts weekdays, exdates and overrides', () => {
    const e: CalendarEvent = {
      ...series,
      exdates: ['2026-11-16'],
      overrides: { '2026-11-18': { start: '2026-11-18T12:00', end: '2026-11-18T13:00' } },
    };
    const occ = occOn(e, '2026-11-09');
    const next = updateWithScope(e, occ, { start: parseLocal('2026-11-10T09:00'), end: parseLocal('2026-11-10T10:00') }, 'series');
    expect(next.recurrence!.byWeekday).toEqual([2, 4]);
    expect(next.start).toBe('2026-11-03T09:00');
    expect(next.exdates).toEqual(['2026-11-17']);
    expect(Object.keys(next.overrides!)).toEqual(['2026-11-19']);
  });

  it('series title changes propagate to occurrences without their own title', () => {
    const withOverride = updateWithScope(series, occOn(series, '2026-11-11'), { start: parseLocal('2026-11-11T14:00'), end: parseLocal('2026-11-11T15:00') }, 'single');
    const renamed = updateWithScope(withOverride, occOn(withOverride, '2026-11-09'), { title: 'Daily sync' }, 'series');
    const occs = expandEvents([renamed], ...range('2026-11-09', '2026-11-16'));
    expect(occs.map((o) => o.title)).toEqual(['Daily sync', 'Daily sync']);
    expect(toLocalISO(occs[1].start)).toBe('2026-11-11T14:00');
  });

  it('turning repetition off for the series leaves a single event', () => {
    const occ = occOn(series, '2026-11-11');
    const next = updateWithScope(series, occ, { recurrence: null }, 'series');
    expect(next.recurrence).toBeUndefined();
    expect(next.start).toBe('2026-11-11T09:00');
  });

  it('adding repetition to a single event always includes its own weekday', () => {
    const e: CalendarEvent = { id: 'a', title: 'A', start: '2026-11-04T09:00', end: '2026-11-04T10:00', allDay: false, calendarId: 'work' };
    const [occ] = expandEvents([e], ...range('2026-11-04', '2026-11-05'));
    const next = updateWithScope(e, occ, { recurrence: { freq: 'weekly', interval: 1, byWeekday: [5] } }, 'series');
    expect(next.recurrence!.byWeekday).toEqual([3, 5]);
  });
});

describe('deleteWithScope', () => {
  it('removes one occurrence via exdate', () => {
    const next = deleteWithScope(series, occOn(series, '2026-11-09'), 'single');
    expect(next?.exdates).toEqual(['2026-11-09']);
    expect(expandEvents([next!], ...range('2026-11-09', '2026-11-10'))).toHaveLength(0);
  });

  it('removes the whole series', () => {
    expect(deleteWithScope(series, occOn(series, '2026-11-09'), 'series')).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('summarises common patterns', () => {
    expect(describeRecurrence({ freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] })).toBe('Weekly on weekdays');
    expect(describeRecurrence({ freq: 'weekly', interval: 2, byWeekday: [4, 1] })).toBe('Every 2 weeks on Mon, Thu');
  });
});
