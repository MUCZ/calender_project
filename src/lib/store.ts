import { deleteWithScope, updateWithScope } from './recurrence';
import type { CalendarCategory, CalendarData, CalendarEvent, EditScope, EventPatch, Occurrence } from './types';

export const HISTORY_LIMIT = 100;

interface HistoryEntry {
  data: CalendarData;
  label: string;
}

export interface CalendarState {
  past: HistoryEntry[];
  present: CalendarData;
  future: HistoryEntry[];
  /** Describes the last change so the UI can announce it (and offer undo). */
  lastChange: { label: string; kind: 'do' | 'undo' | 'redo'; seq: number } | null;
}

export type CalendarAction =
  | { type: 'createEvent'; event: CalendarEvent; label?: string }
  | { type: 'updateOccurrence'; occ: Occurrence; patch: EventPatch; scope: EditScope; label?: string }
  | { type: 'deleteOccurrence'; occ: Occurrence; scope: EditScope }
  | { type: 'addCalendar'; calendar: CalendarCategory }
  | { type: 'updateCalendar'; id: string; changes: Partial<Omit<CalendarCategory, 'id'>> }
  | { type: 'deleteCalendar'; id: string }
  | { type: 'replaceAll'; data: CalendarData; label: string }
  | { type: 'undo' }
  | { type: 'redo' };

export function initState(data: CalendarData): CalendarState {
  return { past: [], present: data, future: [], lastChange: null };
}

function commit(state: CalendarState, data: CalendarData, label: string): CalendarState {
  if (data === state.present) return state;
  const past = [...state.past, { data: state.present, label }].slice(-HISTORY_LIMIT);
  const seq = (state.lastChange?.seq ?? 0) + 1;
  return { past, present: data, future: [], lastChange: { label, kind: 'do', seq } };
}

function mapEvent(data: CalendarData, id: string, fn: (e: CalendarEvent) => CalendarEvent | null): CalendarData {
  const events: CalendarEvent[] = [];
  let changed = false;
  for (const e of data.events) {
    if (e.id !== id) {
      events.push(e);
      continue;
    }
    changed = true;
    const next = fn(e);
    if (next) events.push(next);
  }
  return changed ? { ...data, events } : data;
}

export function calendarReducer(state: CalendarState, action: CalendarAction): CalendarState {
  const data = state.present;
  const seq = (state.lastChange?.seq ?? 0) + 1;
  switch (action.type) {
    case 'createEvent':
      return commit(state, { ...data, events: [...data.events, action.event] }, action.label ?? 'Event created');
    case 'updateOccurrence': {
      const next = mapEvent(data, action.occ.eventId, (e) => updateWithScope(e, action.occ, action.patch, action.scope));
      return commit(state, next, action.label ?? 'Event updated');
    }
    case 'deleteOccurrence': {
      const next = mapEvent(data, action.occ.eventId, (e) => deleteWithScope(e, action.occ, action.scope));
      const label = action.occ.recurring && action.scope === 'single' ? 'Occurrence deleted' : 'Event deleted';
      return commit(state, next, label);
    }
    case 'addCalendar':
      return commit(state, { ...data, calendars: [...data.calendars, action.calendar] }, 'Calendar added');
    case 'updateCalendar':
      return commit(
        state,
        { ...data, calendars: data.calendars.map((c) => (c.id === action.id ? { ...c, ...action.changes } : c)) },
        'Calendar updated',
      );
    case 'deleteCalendar': {
      const calendars = data.calendars.filter((c) => c.id !== action.id);
      if (!calendars.length || calendars.length === data.calendars.length) return state;
      // Events keep existing by moving to the first remaining calendar.
      const fallback = calendars[0].id;
      const events = data.events.map((e) => {
        let next = e.calendarId === action.id ? { ...e, calendarId: fallback } : e;
        if (next.overrides) {
          const overrides = Object.fromEntries(
            Object.entries(next.overrides).map(([k, v]) => [k, v.calendarId === action.id ? { ...v, calendarId: fallback } : v]),
          );
          next = { ...next, overrides };
        }
        return next;
      });
      return commit(state, { calendars, events }, 'Calendar deleted');
    }
    case 'replaceAll':
      return commit(state, action.data, action.label);
    case 'undo': {
      const entry = state.past[state.past.length - 1];
      if (!entry) return state;
      return {
        past: state.past.slice(0, -1),
        present: entry.data,
        future: [{ data: state.present, label: entry.label }, ...state.future],
        lastChange: { label: entry.label, kind: 'undo', seq },
      };
    }
    case 'redo': {
      const [entry, ...future] = state.future;
      if (!entry) return state;
      return {
        past: [...state.past, { data: state.present, label: entry.label }],
        present: entry.data,
        future,
        lastChange: { label: entry.label, kind: 'redo', seq },
      };
    }
  }
}

export const newId = (prefix = 'evt') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
