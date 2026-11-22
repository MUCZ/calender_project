import { addDays, differenceInCalendarDays, differenceInMinutes, MINUTES_PER_DAY, startOfDay } from './dates';
import type { Occurrence } from './types';

/** Timed events this long or longer are shown with all-day events, like most calendar apps. */
export const LONG_EVENT_MINUTES = MINUTES_PER_DAY;

export function isSpanning(occ: Occurrence): boolean {
  return occ.allDay || differenceInMinutes(occ.end, occ.start) >= LONG_EVENT_MINUTES;
}

export interface DaySegment {
  occ: Occurrence;
  dayIndex: number;
  /** Minutes from the start of the day. */
  startMin: number;
  endMin: number;
  /** The event started on an earlier day. */
  continuesBefore: boolean;
  /** The event continues onto a later day. */
  continuesAfter: boolean;
}

/** Splits timed occurrences into one segment per visible day (handles events crossing midnight). */
export function splitIntoDaySegments(occs: Occurrence[], days: Date[]): DaySegment[] {
  const segments: DaySegment[] = [];
  if (!days.length) return segments;
  const first = startOfDay(days[0]);
  for (const occ of occs) {
    if (isSpanning(occ)) continue;
    const startIdx = differenceInCalendarDays(occ.start, first);
    // An event ending exactly at midnight does not appear on the next day.
    const lastIdx = differenceInCalendarDays(occ.end, first) - (occ.end.getTime() === startOfDay(occ.end).getTime() && occ.end > occ.start ? 1 : 0);
    for (let i = Math.max(0, startIdx); i <= Math.min(days.length - 1, lastIdx); i++) {
      const dayStart = addDays(first, i);
      const s = i === startIdx ? differenceInMinutes(occ.start, dayStart) : 0;
      const e = i === lastIdx ? Math.max(s, differenceInMinutes(occ.end, dayStart)) : MINUTES_PER_DAY;
      segments.push({
        occ,
        dayIndex: i,
        startMin: Math.max(0, s),
        endMin: Math.min(MINUTES_PER_DAY, e),
        continuesBefore: i > startIdx,
        continuesAfter: i < lastIdx,
      });
    }
  }
  return segments;
}

export interface PositionedSegment extends DaySegment {
  /** Column index within the overlap group. */
  column: number;
  /** Number of columns in the overlap group. */
  columns: number;
  /** How many columns this segment may stretch across (>= 1). */
  span: number;
}

/**
 * Lays out the segments of a single day so overlapping events sit side by side.
 * `minDuration` reserves room for very short events so their labels stay legible.
 */
export function layoutDay(segments: DaySegment[], minDuration = 20): PositionedSegment[] {
  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const visualEnd = (s: DaySegment) => Math.max(s.endMin, s.startMin + minDuration);
  const out: PositionedSegment[] = [];
  let cluster: { seg: DaySegment; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const columns = columnEnds.length;
    for (const { seg, column } of cluster) {
      let span = 1;
      // Expand to the right while the neighbouring columns are free for this time range.
      while (column + span < columns) {
        const blocked = cluster.some(
          (o) => o.column === column + span && o.seg.startMin < visualEnd(seg) && visualEnd(o.seg) > seg.startMin,
        );
        if (blocked) break;
        span++;
      }
      out.push({ ...seg, column, columns, span });
    }
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const seg of sorted) {
    if (cluster.length && seg.startMin >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= seg.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(visualEnd(seg));
    } else {
      columnEnds[column] = visualEnd(seg);
    }
    cluster.push({ seg, column });
    clusterEnd = Math.max(clusterEnd, visualEnd(seg));
  }
  if (cluster.length) flush();
  return out;
}

export interface SpanItem {
  occ: Occurrence;
  /** First visible day index (clamped). */
  startIdx: number;
  /** Last visible day index, inclusive (clamped). */
  endIdx: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Inclusive index of the last day an occurrence covers. */
function lastDayIndex(occ: Occurrence, first: Date): number {
  const endsAtMidnight = occ.end.getTime() === startOfDay(occ.end).getTime() && occ.end > occ.start;
  return differenceInCalendarDays(occ.end, first) - (endsAtMidnight ? 1 : 0);
}

/**
 * Assigns horizontal bars (all-day row / month week rows) to lanes so they don't overlap.
 * Occurrences are clipped to [0, dayCount).
 */
export function layoutSpans(occs: Occurrence[], firstDay: Date, dayCount: number): { items: SpanItem[]; laneCount: number } {
  const first = startOfDay(firstDay);
  const raw = occs
    .map((occ) => {
      const s = differenceInCalendarDays(occ.start, first);
      const e = Math.max(s, lastDayIndex(occ, first));
      return { occ, s, e };
    })
    .filter(({ s, e }) => e >= 0 && s < dayCount)
    .sort((a, b) => a.s - b.s || b.e - b.s - (a.e - a.s) || Number(b.occ.allDay) - Number(a.occ.allDay) || a.occ.start.getTime() - b.occ.start.getTime());

  const laneEnds: number[] = [];
  const items: SpanItem[] = raw.map(({ occ, s, e }) => {
    const startIdx = Math.max(0, s);
    const endIdx = Math.min(dayCount - 1, e);
    let lane = laneEnds.findIndex((end) => end < startIdx);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endIdx);
    } else laneEnds[lane] = endIdx;
    return { occ, startIdx, endIdx, lane, continuesBefore: s < 0, continuesAfter: e > dayCount - 1 };
  });
  return { items, laneCount: laneEnds.length };
}
