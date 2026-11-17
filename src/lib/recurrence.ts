import {
  addDays,
  addMinutes,
  atMinutes,
  differenceInCalendarDays,
  differenceInMinutes,
  minutesOfDay,
  parseLocal,
  startOfDay,
  toDateKey,
  toLocalISO,
} from './dates';
import type {
  CalendarEvent,
  EditScope,
  EventPatch,
  LocalDate,
  Occurrence,
  OccurrenceOverride,
  WeeklyRecurrence,
} from './types';

export const occurrenceKey = (eventId: string, date?: LocalDate) => (date ? `${eventId}::${date}` : eventId);

function baseOccurrence(event: CalendarEvent): Omit<Occurrence, 'key' | 'start' | 'end' | 'occurrenceDate'> {
  return {
    eventId: event.id,
    title: event.title,
    allDay: event.allDay,
    calendarId: event.calendarId,
    location: event.location,
    notes: event.notes,
    recurring: !!event.recurrence,
    isException: false,
  };
}

function applyOverride(event: CalendarEvent, date: LocalDate, ov: OccurrenceOverride): Occurrence {
  return {
    ...baseOccurrence(event),
    key: occurrenceKey(event.id, date),
    occurrenceDate: date,
    title: ov.title ?? event.title,
    allDay: ov.allDay ?? event.allDay,
    calendarId: ov.calendarId ?? event.calendarId,
    location: ov.location ?? event.location,
    notes: ov.notes ?? event.notes,
    start: parseLocal(ov.start),
    end: parseLocal(ov.end),
    isException: true,
  };
}

const overlaps = (start: Date, end: Date, rangeStart: Date, rangeEnd: Date) =>
  start < rangeEnd && (end > rangeStart || (end.getTime() === start.getTime() && start >= rangeStart));

/** Start of the base (un-overridden) occurrence of a series on `date`. */
export function seriesStartOn(event: CalendarEvent, date: LocalDate): Date {
  return atMinutes(parseLocal(date), minutesOfDay(parseLocal(event.start)));
}

/** Weekly occurrence dates of a series whose start falls within [from, to). */
export function seriesDates(event: CalendarEvent, from: Date, to: Date): LocalDate[] {
  const rule = event.recurrence;
  if (!rule) return [];
  const first = startOfDay(parseLocal(event.start));
  const until = rule.until ? parseLocal(rule.until) : null;
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const weekdays = [...new Set(rule.byWeekday)].filter((d) => d >= 0 && d <= 6).sort();
  if (!weekdays.length) return [toDateKey(first)];

  const anchorWeek = addDays(first, -first.getDay()); // Sunday of the first week
  let cursor = startOfDay(from < first ? first : from);
  cursor = addDays(cursor, -cursor.getDay());
  const dates: LocalDate[] = [];
  for (let guard = 0; cursor < to && guard < 2000; guard++, cursor = addDays(cursor, 7)) {
    const weekIndex = Math.round(differenceInCalendarDays(cursor, anchorWeek) / 7);
    if (weekIndex % interval !== 0) continue;
    for (const wd of weekdays) {
      const day = addDays(cursor, wd);
      if (day < first || day >= to || day < startOfDay(from)) continue;
      if (until && day > until) return dates;
      dates.push(toDateKey(day));
    }
  }
  return dates;
}

/** Expands events (including weekly series) into occurrences overlapping [rangeStart, rangeEnd). */
export function expandEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const result: Occurrence[] = [];
  for (const event of events) {
    const start = parseLocal(event.start);
    const end = parseLocal(event.end);
    if (!event.recurrence) {
      if (overlaps(start, end, rangeStart, rangeEnd)) {
        result.push({ ...baseOccurrence(event), key: event.id, start, end });
      }
      continue;
    }
    const duration = differenceInMinutes(end, start);
    const exdates = new Set(event.exdates ?? []);
    const overrides = event.overrides ?? {};
    // Look back far enough to catch occurrences that started earlier but still overlap.
    const from = addDays(addMinutes(rangeStart, -duration), -1);
    for (const date of seriesDates(event, from, rangeEnd)) {
      if (exdates.has(date) || overrides[date]) continue;
      const occStart = seriesStartOn(event, date);
      const occEnd = addMinutes(occStart, duration);
      if (overlaps(occStart, occEnd, rangeStart, rangeEnd)) {
        result.push({ ...baseOccurrence(event), key: occurrenceKey(event.id, date), occurrenceDate: date, start: occStart, end: occEnd });
      }
    }
    for (const [date, ov] of Object.entries(overrides)) {
      if (exdates.has(date)) continue;
      const occ = applyOverride(event, date, ov);
      if (overlaps(occ.start, occ.end, rangeStart, rangeEnd)) result.push(occ);
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
}

function shiftDateKey(date: LocalDate, days: number): LocalDate {
  return days ? toDateKey(addDays(parseLocal(date), days)) : date;
}

export function normalizeRecurrence(rule: WeeklyRecurrence, start: Date): WeeklyRecurrence {
  const days = new Set(rule.byWeekday);
  days.add(start.getDay());
  return {
    freq: 'weekly',
    interval: Math.max(1, Math.floor(rule.interval || 1)),
    byWeekday: [...days].sort(),
    ...(rule.until ? { until: rule.until } : {}),
  };
}

function patchFields(patch: EventPatch) {
  const out: Partial<CalendarEvent> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.allDay !== undefined) out.allDay = patch.allDay;
  if (patch.calendarId !== undefined) out.calendarId = patch.calendarId;
  if (patch.location !== undefined) out.location = patch.location;
  if (patch.notes !== undefined) out.notes = patch.notes;
  return out;
}

function cleanEvent(e: CalendarEvent): CalendarEvent {
  const out: CalendarEvent = { ...e };
  if (!out.recurrence) {
    delete out.recurrence;
    delete out.exdates;
    delete out.overrides;
  } else {
    if (out.exdates && !out.exdates.length) delete out.exdates;
    if (out.overrides && !Object.keys(out.overrides).length) delete out.overrides;
  }
  if (!out.location) delete out.location;
  if (!out.notes) delete out.notes;
  return out;
}

/**
 * Applies a patch to the event behind `occ`.
 * - Non-recurring events are updated directly.
 * - `single` stores an override for just this occurrence.
 * - `series` changes the whole series; a moved occurrence shifts the series' time of day,
 *   duration and (if dragged to another day) its weekdays.
 */
export function updateWithScope(event: CalendarEvent, occ: Occurrence, patch: EventPatch, scope: EditScope): CalendarEvent {
  const newStart = patch.start ?? occ.start;
  const newEnd = patch.end ?? occ.end;

  if (!event.recurrence) {
    const next: CalendarEvent = { ...event, ...patchFields(patch), start: toLocalISO(newStart), end: toLocalISO(newEnd) };
    if (patch.recurrence) next.recurrence = normalizeRecurrence(patch.recurrence, newStart);
    return cleanEvent(next);
  }

  const date = occ.occurrenceDate;
  if (scope === 'single' && date) {
    const prev = event.overrides?.[date];
    const ov: OccurrenceOverride = { ...prev, start: toLocalISO(newStart), end: toLocalISO(newEnd) };
    const fields = patchFields(patch);
    for (const k of ['title', 'allDay', 'calendarId', 'location', 'notes'] as const) {
      if (fields[k] === undefined) continue;
      if (fields[k] === event[k]) delete ov[k];
      else (ov as unknown as Record<string, unknown>)[k] = fields[k];
    }
    return cleanEvent({ ...event, overrides: { ...event.overrides, [date]: ov } });
  }

  // Entire series.
  if (patch.recurrence === null) {
    return cleanEvent({ ...event, ...patchFields(patch), recurrence: undefined, start: toLocalISO(newStart), end: toLocalISO(newEnd) });
  }

  const masterStart = parseLocal(event.start);
  const masterEnd = parseLocal(event.end);
  const timeChanged = !!(patch.start || patch.end);
  let start = masterStart;
  let end = masterEnd;
  let dayShift = 0;
  if (timeChanged && date) {
    const base = seriesStartOn(event, date);
    dayShift = differenceInCalendarDays(newStart, base);
    start = atMinutes(addDays(masterStart, dayShift), minutesOfDay(newStart));
    end = addMinutes(start, differenceInMinutes(newEnd, newStart));
  }
  let rule: WeeklyRecurrence = patch.recurrence ?? {
    ...event.recurrence,
    byWeekday: event.recurrence.byWeekday.map((d) => (((d + dayShift) % 7) + 7) % 7),
  };
  rule = normalizeRecurrence(rule, start);
  if (patch.recurrence === undefined && rule.until && dayShift) rule.until = shiftDateKey(rule.until, dayShift);

  const overrides: Record<LocalDate, OccurrenceOverride> = {};
  for (const [k, v] of Object.entries(event.overrides ?? {})) {
    if (k === date) continue; // this occurrence now follows the series
    overrides[shiftDateKey(k, dayShift)] = v;
  }
  const exdates = (event.exdates ?? []).map((d) => shiftDateKey(d, dayShift));

  return cleanEvent({
    ...event,
    ...patchFields(patch),
    start: toLocalISO(start),
    end: toLocalISO(end),
    recurrence: rule,
    overrides,
    exdates,
  });
}

/** Returns the updated event, or `null` if the whole event should be removed. */
export function deleteWithScope(event: CalendarEvent, occ: Occurrence, scope: EditScope): CalendarEvent | null {
  if (!event.recurrence || scope === 'series' || !occ.occurrenceDate) return null;
  const date = occ.occurrenceDate;
  const overrides = { ...event.overrides };
  delete overrides[date];
  return cleanEvent({ ...event, overrides, exdates: [...new Set([...(event.exdates ?? []), date])] });
}

export function describeRecurrence(rule: WeeklyRecurrence): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [...rule.byWeekday].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  let dayText = days.map((d) => names[d]).join(', ');
  if (days.length === 7) dayText = 'every day';
  else if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) dayText = 'weekdays';
  const every = rule.interval > 1 ? `Every ${rule.interval} weeks` : 'Weekly';
  const until = rule.until ? ` until ${parseLocal(rule.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
  return `${every} on ${dayText}${until}`;
}
