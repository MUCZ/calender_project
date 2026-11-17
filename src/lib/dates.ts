import type { LocalDate, LocalDateTime } from './types';

export const MINUTES_PER_DAY = 24 * 60;
export const WEEK_STARTS_ON = 1; // Monday

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalISO(d: Date): LocalDateTime {
  return `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` as local wall-clock time. */
export function parseLocal(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) throw new Error(`Invalid local date: ${value}`);
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
}

export function isValidLocal(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return !Number.isNaN(parseLocal(value).getTime());
  } catch {
    return false;
  }
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Adds calendar days, preserving wall-clock time across DST changes. */
export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

export function startOfWeek(d: Date, weekStartsOn = WEEK_STARTS_ON): Date {
  const day = startOfDay(d);
  const diff = (day.getDay() - weekStartsOn + 7) % 7;
  return addDays(day, -diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whole calendar days from `b` to `a` (DST-safe). */
export function differenceInCalendarDays(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / 86_400_000);
}

export function differenceInMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60_000);
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function atMinutes(day: Date, minutes: number): Date {
  const r = startOfDay(day);
  r.setMinutes(minutes);
  return r;
}

export function snapMinutes(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function daysOf(start: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Six weeks of days covering the month containing `d`. */
export function monthGridDays(d: Date): Date[] {
  return daysOf(startOfWeek(startOfMonth(d)), 42);
}

// ---------- Formatting ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, options);
    fmtCache.set(key, f);
  }
  return f;
}

export const formatTime = (d: Date) => fmt({ hour: 'numeric', minute: '2-digit' }).format(d);
export const formatHourLabel = (hour: number) => fmt({ hour: 'numeric' }).format(new Date(2000, 0, 1, hour));
export const formatWeekday = (d: Date) => fmt({ weekday: 'short' }).format(d);
export const formatWeekdayNarrow = (d: Date) => fmt({ weekday: 'narrow' }).format(d);
export const formatMonthYear = (d: Date) => fmt({ month: 'long', year: 'numeric' }).format(d);
export const formatMonthShort = (d: Date) => fmt({ month: 'short' }).format(d);
export const formatFullDate = (d: Date) => fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
export const formatShortDate = (d: Date) => fmt({ weekday: 'short', month: 'short', day: 'numeric' }).format(d);

export function formatTimeRange(start: Date, end: Date): string {
  if (isSameDay(start, end) || (minutesOfDay(end) === 0 && differenceInCalendarDays(end, start) === 1)) {
    return `${formatTime(start)} – ${formatTime(end)}`;
  }
  return `${formatShortDate(start)} ${formatTime(start)} – ${formatShortDate(end)} ${formatTime(end)}`;
}

/** Human-readable range label for a header, e.g. "Nov 16 – 22, 2026". */
export function formatRangeTitle(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) return formatMonthYear(start);
  const a = fmt({ month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).format(start);
  const b = fmt({ month: 'short', year: 'numeric' }).format(end);
  return `${a} – ${b}`;
}
