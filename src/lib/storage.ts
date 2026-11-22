import { isValidLocal } from './dates';
import type { CalendarCategory, CalendarData, CalendarEvent, ViewMode } from './types';

export const STORAGE_KEY = 'calendar-app/v1';

export interface Settings {
  view: ViewMode;
  hiddenCalendars: string[];
}

export interface StoredState {
  version: 1;
  data: CalendarData;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { view: 'week', hiddenCalendars: [] };

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isCalendar(v: unknown): v is CalendarCategory {
  const c = v as CalendarCategory;
  return !!c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.color === 'string';
}

function isEvent(v: unknown): v is CalendarEvent {
  const e = v as CalendarEvent;
  return (
    !!e &&
    typeof e.id === 'string' &&
    typeof e.title === 'string' &&
    isValidLocal(e.start) &&
    isValidLocal(e.end) &&
    typeof e.allDay === 'boolean' &&
    typeof e.calendarId === 'string' &&
    (e.recurrence === undefined || (e.recurrence.freq === 'weekly' && Array.isArray(e.recurrence.byWeekday)))
  );
}

/** Reads and validates persisted state. Returns null when missing or corrupt. */
export function loadState(storage: StorageLike | undefined = globalThis.localStorage): StoredState | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (parsed.version !== 1 || !parsed.data) return null;
    const calendars = Array.isArray(parsed.data.calendars) ? parsed.data.calendars.filter(isCalendar) : [];
    const events = Array.isArray(parsed.data.events) ? parsed.data.events.filter(isEvent) : [];
    if (!calendars.length) return null;
    const s = parsed.settings ?? DEFAULT_SETTINGS;
    const view: ViewMode = s.view === 'day' || s.view === 'month' ? s.view : 'week';
    const hiddenCalendars = Array.isArray(s.hiddenCalendars) ? s.hiddenCalendars.filter((x) => typeof x === 'string') : [];
    return { version: 1, data: { calendars, events }, settings: { view, hiddenCalendars } };
  } catch {
    return null;
  }
}

export function saveState(state: StoredState, storage: StorageLike | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // quota exceeded or storage disabled (e.g. private mode)
  }
}
