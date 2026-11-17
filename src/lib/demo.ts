import { addDays, atMinutes, startOfWeek, toDateKey, toLocalISO } from './dates';
import type { CalendarData, CalendarEvent } from './types';

export const DEMO_CALENDARS = [
  { id: 'work', name: 'Work', color: '#3b6fd4' },
  { id: 'personal', name: 'Personal', color: '#2f9465' },
  { id: 'family', name: 'Family', color: '#8a5cc7' },
  { id: 'health', name: 'Health', color: '#d07a2a' },
];

/** Demo data placed relative to the week containing `today`, so the app always looks lived-in. */
export function createDemoData(today = new Date()): CalendarData {
  const mon = startOfWeek(today, 1);
  const day = (offset: number) => addDays(mon, offset);
  const at = (offset: number, h: number, m = 0) => toLocalISO(atMinutes(day(offset), h * 60 + m));
  const date = (offset: number) => toLocalISO(day(offset));
  let n = 0;
  const ev = (e: Omit<CalendarEvent, 'id'>): CalendarEvent => ({ id: `demo_${++n}`, ...e });

  const events: CalendarEvent[] = [
    // Weekly recurring series
    ev({
      title: 'Team standup',
      start: at(-14, 9, 30),
      end: at(-14, 9, 45),
      allDay: false,
      calendarId: 'work',
      location: 'Zoom',
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 2, 3, 4, 5] },
      // One occurrence this week was moved later.
      overrides: { [toDateKey(day(3))]: { start: at(3, 10, 0), end: at(3, 10, 15), title: 'Team standup (moved)' } },
    }),
    ev({
      title: 'Yoga',
      start: at(-7, 18, 30),
      end: at(-7, 19, 30),
      allDay: false,
      calendarId: 'health',
      location: 'Studio 3',
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [1, 4] },
    }),
    ev({
      title: 'Piano lesson',
      start: at(-7, 16, 0),
      end: at(-7, 17, 0),
      allDay: false,
      calendarId: 'family',
      recurrence: { freq: 'weekly', interval: 1, byWeekday: [3] },
    }),
    // Overlapping events on Tuesday
    ev({ title: 'Design review', start: at(1, 10, 0), end: at(1, 11, 30), allDay: false, calendarId: 'work', location: 'Room Atlas' }),
    ev({ title: '1:1 with Maya', start: at(1, 10, 30), end: at(1, 11, 0), allDay: false, calendarId: 'work' }),
    ev({ title: 'Customer call', start: at(1, 11, 0), end: at(1, 12, 0), allDay: false, calendarId: 'work', notes: 'Q4 renewal' }),
    ev({ title: 'Lunch with Sam', start: at(1, 12, 30), end: at(1, 13, 30), allDay: false, calendarId: 'personal', location: 'Café Lumen' }),
    // Monday
    ev({ title: 'Sprint planning', start: at(0, 13, 0), end: at(0, 14, 30), allDay: false, calendarId: 'work' }),
    ev({ title: 'Dentist', start: at(0, 15, 0), end: at(0, 16, 0), allDay: false, calendarId: 'health', location: 'Dr. Patel' }),
    // Wednesday overlaps
    ev({ title: 'Focus time', start: at(2, 9, 0), end: at(2, 12, 0), allDay: false, calendarId: 'work' }),
    ev({ title: 'Hiring sync', start: at(2, 10, 0), end: at(2, 10, 45), allDay: false, calendarId: 'work' }),
    ev({ title: 'Grocery pickup', start: at(2, 17, 30), end: at(2, 18, 0), allDay: false, calendarId: 'personal' }),
    // Thursday
    ev({ title: 'Roadmap workshop', start: at(3, 13, 30), end: at(3, 16, 0), allDay: false, calendarId: 'work', location: 'Room Orion' }),
    // Events spanning midnight
    ev({
      title: 'Release deploy window',
      start: at(3, 22, 0),
      end: at(4, 1, 30),
      allDay: false,
      calendarId: 'work',
      notes: 'On-call: watch dashboards after rollout.',
    }),
    ev({ title: 'Night train to Lyon', start: at(5, 21, 15), end: at(6, 6, 45), allDay: false, calendarId: 'personal', location: 'Gare de Lyon' }),
    // Friday
    ev({ title: 'Demo day', start: at(4, 14, 0), end: at(4, 15, 0), allDay: false, calendarId: 'work' }),
    ev({ title: 'Dinner with parents', start: at(4, 19, 0), end: at(4, 21, 0), allDay: false, calendarId: 'family' }),
    // Saturday
    ev({ title: 'Farmers market', start: at(5, 9, 0), end: at(5, 10, 30), allDay: false, calendarId: 'personal' }),
    ev({ title: 'Long run', start: at(6, 8, 0), end: at(6, 9, 15), allDay: false, calendarId: 'health' }),
    // All-day events
    ev({ title: 'Product offsite', start: date(1), end: date(3), allDay: true, calendarId: 'work', location: 'Lisbon' }),
    ev({ title: "Mom's birthday", start: date(4), end: date(5), allDay: true, calendarId: 'family' }),
    ev({ title: 'Weekend trip', start: date(5), end: date(7), allDay: true, calendarId: 'personal' }),
    // Next week, for month view
    ev({ title: 'Quarterly review', start: at(8, 10, 0), end: at(8, 12, 0), allDay: false, calendarId: 'work' }),
    ev({ title: 'Flu shot', start: at(10, 8, 30), end: at(10, 9, 0), allDay: false, calendarId: 'health' }),
    ev({ title: 'Conference', start: date(15), end: date(18), allDay: true, calendarId: 'work', location: 'Berlin' }),
    ev({ title: 'Book club', start: at(-3, 19, 0), end: at(-3, 20, 30), allDay: false, calendarId: 'personal' }),
  ];

  return { calendars: DEMO_CALENDARS.map((c) => ({ ...c })), events };
}
