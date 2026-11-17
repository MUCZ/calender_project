import { describe, expect, it } from 'vitest';
import { daysOf, parseLocal } from './dates';
import { layoutDay, layoutSpans, splitIntoDaySegments, type DaySegment } from './layout';
import type { Occurrence } from './types';

let n = 0;
function occ(start: string, end: string, allDay = false): Occurrence {
  n++;
  return {
    key: `o${n}`,
    eventId: `o${n}`,
    title: `Event ${n}`,
    start: parseLocal(start),
    end: parseLocal(end),
    allDay,
    calendarId: 'work',
    recurring: false,
    isException: false,
  };
}

const week = daysOf(parseLocal('2026-11-16'), 7); // Mon..Sun

describe('splitIntoDaySegments', () => {
  it('splits an event crossing midnight into two segments', () => {
    const segs = splitIntoDaySegments([occ('2026-11-19T22:00', '2026-11-20T01:30')], week);
    expect(segs.map((s) => [s.dayIndex, s.startMin, s.endMin, s.continuesBefore, s.continuesAfter])).toEqual([
      [3, 1320, 1440, false, true],
      [4, 0, 90, true, false],
    ]);
  });

  it('does not create an empty segment for events ending exactly at midnight', () => {
    const segs = splitIntoDaySegments([occ('2026-11-19T22:00', '2026-11-20T00:00')], week);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ dayIndex: 3, endMin: 1440, continuesAfter: false });
  });

  it('clips segments to the visible days', () => {
    const segs = splitIntoDaySegments([occ('2026-11-22T23:00', '2026-11-23T02:00')], week);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ dayIndex: 6, continuesAfter: true });
  });

  it('leaves all-day and 24h+ events to the all-day row', () => {
    const segs = splitIntoDaySegments([occ('2026-11-17', '2026-11-18', true), occ('2026-11-17T08:00', '2026-11-18T09:00')], week);
    expect(segs).toHaveLength(0);
  });
});

describe('layoutDay', () => {
  const seg = (startMin: number, endMin: number): DaySegment => ({
    occ: occ('2026-11-16T00:00', '2026-11-16T01:00'),
    dayIndex: 0,
    startMin,
    endMin,
    continuesBefore: false,
    continuesAfter: false,
  });

  it('gives non-overlapping events the full width', () => {
    const out = layoutDay([seg(60, 120), seg(120, 180)]);
    expect(out.map((p) => [p.column, p.columns, p.span])).toEqual([
      [0, 1, 1],
      [0, 1, 1],
    ]);
  });

  it('places overlapping events in side-by-side columns', () => {
    // 10:00-11:30, 10:30-11:00, 11:00-12:00 (Design review / 1:1 / Customer call)
    const out = layoutDay([seg(600, 690), seg(630, 660), seg(660, 720)]);
    const byStart = Object.fromEntries(out.map((p) => [p.startMin, [p.column, p.columns, p.span]]));
    expect(byStart[600]).toEqual([0, 2, 1]);
    expect(byStart[630]).toEqual([1, 2, 1]);
    expect(byStart[660]).toEqual([1, 2, 1]); // reuses the freed column
  });

  it('lets an event expand into free columns to its right', () => {
    // A long event plus two short ones that overlap each other but not the last event.
    const out = layoutDay([seg(0, 120), seg(0, 60), seg(0, 30), seg(60, 120)]);
    const late = out.find((p) => p.startMin === 60)!;
    expect(late.columns).toBe(3);
    expect(late.column).toBe(1);
    expect(late.span).toBe(2);
  });
});

describe('layoutSpans', () => {
  it('stacks overlapping multi-day events in separate lanes', () => {
    const a = occ('2026-11-17', '2026-11-19', true); // Tue-Wed
    const b = occ('2026-11-18', '2026-11-19', true); // Wed
    const c = occ('2026-11-20', '2026-11-21', true); // Fri
    const { items, laneCount } = layoutSpans([a, b, c], week[0], 7);
    expect(laneCount).toBe(2);
    const lanes = Object.fromEntries(items.map((i) => [i.occ.key, [i.startIdx, i.endIdx, i.lane]]));
    expect(lanes[a.key]).toEqual([1, 2, 0]);
    expect(lanes[b.key]).toEqual([2, 2, 1]);
    expect(lanes[c.key]).toEqual([4, 4, 0]);
  });

  it('clips spans to the visible range and flags continuation', () => {
    const long = occ('2026-11-14', '2026-11-18', true);
    const { items } = layoutSpans([long], week[0], 7);
    expect(items[0]).toMatchObject({ startIdx: 0, endIdx: 1, continuesBefore: true, continuesAfter: false });
  });
});
