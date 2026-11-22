/**
 * Local "floating" date-time, `YYYY-MM-DDTHH:mm`. Events are stored in wall-clock
 * time so they render the same regardless of the device's time zone offset.
 */
export type LocalDateTime = string;
/** Local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;

export interface CalendarCategory {
  id: string;
  name: string;
  color: string;
}

export interface WeeklyRecurrence {
  freq: 'weekly';
  /** Repeat every N weeks (1 = every week). */
  interval: number;
  /** Weekdays the event repeats on, 0 = Sunday … 6 = Saturday. */
  byWeekday: number[];
  /** Last date (inclusive) an occurrence may start on. */
  until?: LocalDate;
}

/** Fields an individual occurrence of a series may override. */
export interface OccurrenceOverride {
  start: LocalDateTime;
  end: LocalDateTime;
  title?: string;
  allDay?: boolean;
  calendarId?: string;
  location?: string;
  notes?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** Inclusive start. For all-day events this is midnight of the first day. */
  start: LocalDateTime;
  /** Exclusive end. For all-day events this is midnight after the last day. */
  end: LocalDateTime;
  allDay: boolean;
  calendarId: string;
  location?: string;
  notes?: string;
  recurrence?: WeeklyRecurrence;
  /** Original occurrence dates that were deleted from the series. */
  exdates?: LocalDate[];
  /** Per-occurrence changes keyed by the occurrence's original start date. */
  overrides?: Record<LocalDate, OccurrenceOverride>;
}

/** A concrete, renderable instance of an event (a series is expanded into many). */
export interface Occurrence {
  /** Unique key: event id, plus original date for series occurrences. */
  key: string;
  eventId: string;
  /** Original start date of this occurrence within its series. */
  occurrenceDate?: LocalDate;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendarId: string;
  location?: string;
  notes?: string;
  recurring: boolean;
  /** True if this occurrence of a series has been individually modified. */
  isException: boolean;
}

export type EditScope = 'single' | 'series';

export interface EventPatch {
  title?: string;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  calendarId?: string;
  location?: string;
  notes?: string;
  /** `null` turns repetition off; `undefined` leaves it untouched. */
  recurrence?: WeeklyRecurrence | null;
}

export interface CalendarData {
  events: CalendarEvent[];
  calendars: CalendarCategory[];
}

export type ViewMode = 'day' | 'week' | 'month';
