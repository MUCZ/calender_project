import { describe, expect, it } from 'vitest';
import { addDays, daysOf, parseLocal, startOfWeek, toLocalISO } from './dates';
import { createDemoData } from './demo';
import { splitIntoDaySegments, layoutDay } from './layout';
import { expandEvents } from './recurrence';
import { searchEvents } from './search';
import { DEFAULT_SETTINGS, loadState, saveState, STORAGE_KEY } from './storage';
import { calendarReducer, HISTORY_LIMIT, initState } from './store';
import type { CalendarData, CalendarEvent } from './types';

const base: CalendarData = {
  calendars: [
    { id: 'work', name: 'Work', color: '#36c' },
    { id: 'home', name: 'Home', color: '#3a6' },
  ],
  events: [{ id: 'a', title: 'Alpha', start: '2026-11-16T09:00', end: '2026-11-16T10:00', allDay: false, calendarId: 'work' }],
};

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe('calendarReducer undo/redo', () => {
  it('undoes and redoes a move', () => {
    let s = initState(base);
    const [occ] = expandEvents(s.present.events, parseLocal('2026-11-16'), parseLocal('2026-11-17'));
    s = calendarReducer(s, { type: 'updateOccurrence', occ, patch: { start: parseLocal('2026-11-16T11:00'), end: parseLocal('2026-11-16T12:00') }, scope: 'single', label: 'Event moved' });
    expect(s.present.events[0].start).toBe('2026-11-16T11:00');
    expect(s.lastChange).toMatchObject({ label: 'Event moved', kind: 'do' });

    s = calendarReducer(s, { type: 'undo' });
    expect(s.present.events[0].start).toBe('2026-11-16T09:00');
    expect(s.lastChange).toMatchObject({ label: 'Event moved', kind: 'undo' });

    s = calendarReducer(s, { type: 'redo' });
    expect(s.present.events[0].start).toBe('2026-11-16T11:00');
    expect(s.future).toHaveLength(0);
  });

  it('clears the redo stack after a new change', () => {
    let s = initState(base);
    s = calendarReducer(s, { type: 'createEvent', event: { ...base.events[0], id: 'b' } });
    s = calendarReducer(s, { type: 'undo' });
    expect(s.future).toHaveLength(1);
    s = calendarReducer(s, { type: 'createEvent', event: { ...base.events[0], id: 'c' } });
    expect(s.future).toHaveLength(0);
    expect(calendarReducer(s, { type: 'redo' })).toBe(s);
  });

  it('caps history length', () => {
    let s = initState(base);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = calendarReducer(s, { type: 'createEvent', event: { ...base.events[0], id: `x${i}` } });
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });

  it('moves events to another calendar when theirs is deleted', () => {
    let s = initState(base);
    s = calendarReducer(s, { type: 'deleteCalendar', id: 'work' });
    expect(s.present.calendars.map((c) => c.id)).toEqual(['home']);
    expect(s.present.events[0].calendarId).toBe('home');
  });

  it('refuses to delete the last calendar', () => {
    let s = initState({ ...base, calendars: [base.calendars[0]] });
    const before = s;
    s = calendarReducer(s, { type: 'deleteCalendar', id: 'work' });
    expect(s).toBe(before);
  });
});

describe('storage', () => {
  it('round-trips state', () => {
    const storage = memoryStorage();
    saveState({ version: 1, data: base, settings: { view: 'month', hiddenCalendars: ['home'] } }, storage);
    expect(loadState(storage)).toEqual({ version: 1, data: base, settings: { view: 'month', hiddenCalendars: ['home'] } });
  });

  it('ignores corrupt data and drops invalid events', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadState(storage)).toBeNull();
    const bad = { ...base, events: [...base.events, { id: 'z', title: 'Broken', start: 'nope' } as unknown as CalendarEvent] };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: bad, settings: DEFAULT_SETTINGS }));
    expect(loadState(storage)?.data.events.map((e) => e.id)).toEqual(['a']);
  });

  it('reports failure when storage throws', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(saveState({ version: 1, data: base, settings: DEFAULT_SETTINGS }, storage)).toBe(false);
  });
});

describe('search', () => {
  it('matches title, location and notes, all terms required', () => {
    const now = parseLocal('2026-11-17T08:00');
    const data = createDemoData(now);
    expect(searchEvents(data.events, 'room orion', now).map((o) => o.title)).toEqual(['Roadmap workshop']);
    expect(searchEvents(data.events, 'renewal', now).map((o) => o.title)).toEqual(['Customer call']);
    expect(searchEvents(data.events, '', now)).toEqual([]);
  });

  it('returns the next upcoming occurrence of a series once', () => {
    const now = parseLocal('2026-11-17T12:00'); // Tuesday
    const data = createDemoData(now);
    const results = searchEvents(data.events, 'yoga', now);
    expect(results).toHaveLength(1);
    expect(toLocalISO(results[0].start)).toBe('2026-11-19T18:30'); // Thursday
  });
});

describe('demo data', () => {
  const today = parseLocal('2026-11-18T10:00');
  const data = createDemoData(today);
  const week = daysOf(startOfWeek(today), 7);
  const occs = expandEvents(data.events, week[0], addDays(week[0], 7));

  it('contains recurring, midnight-spanning, all-day and overlapping events this week', () => {
    expect(occs.some((o) => o.recurring)).toBe(true);
    expect(occs.some((o) => o.isException)).toBe(true);
    expect(occs.some((o) => o.allDay)).toBe(true);
    expect(splitIntoDaySegments(occs, week).some((s) => s.continuesAfter)).toBe(true);
    const tuesday = splitIntoDaySegments(occs, week).filter((s) => s.dayIndex === 1);
    expect(Math.max(...layoutDay(tuesday).map((p) => p.columns))).toBeGreaterThan(1);
  });

  it('only references existing calendars', () => {
    const ids = new Set(data.calendars.map((c) => c.id));
    expect(data.events.every((e) => ids.has(e.calendarId))).toBe(true);
  });
});
