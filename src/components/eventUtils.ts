import type { KeyboardEvent } from 'react';
import { addDays, addMinutes, differenceInMinutes, formatFullDate, formatTime, formatTimeRange, isSameDay } from '../lib/dates';
import type { EventPatch, Occurrence } from '../lib/types';

export const SNAP_MINUTES = 15;

export interface EventHandlers {
  onOpen: (occ: Occurrence) => void;
  onChange: (occ: Occurrence, patch: EventPatch, label: string) => void;
  onDelete: (occ: Occurrence) => void;
}

export function shiftOccurrence(occ: Occurrence, days: number, minutes = 0): { start: Date; end: Date } {
  const start = addMinutes(addDays(occ.start, days), minutes);
  const end = addMinutes(start, differenceInMinutes(occ.end, occ.start));
  return { start, end };
}

export function describeOccurrence(occ: Occurrence, calendarName?: string): string {
  const parts = [occ.title || '(No title)'];
  if (occ.allDay) {
    const lastDay = addDays(occ.end, -1);
    parts.push(isSameDay(occ.start, lastDay) ? `${formatFullDate(occ.start)}, all day` : `${formatFullDate(occ.start)} to ${formatFullDate(lastDay)}, all day`);
  } else if (isSameDay(occ.start, occ.end)) {
    parts.push(`${formatFullDate(occ.start)}, ${formatTime(occ.start)} to ${formatTime(occ.end)}`);
  } else {
    parts.push(`${formatFullDate(occ.start)} ${formatTime(occ.start)} to ${formatFullDate(occ.end)} ${formatTime(occ.end)}`);
  }
  if (calendarName) parts.push(`${calendarName} calendar`);
  if (occ.location) parts.push(occ.location);
  if (occ.recurring) parts.push(occ.isException ? 'repeats weekly, this occurrence changed' : 'repeats weekly');
  return parts.join(', ');
}

export function describeChange(occ: Occurrence, start: Date, end: Date): string {
  return occ.allDay ? `${occ.title} moved to ${formatFullDate(start)}` : `${occ.title}: ${formatFullDate(start)}, ${formatTimeRange(start, end)}`;
}

/**
 * Keyboard editing on a focused event.
 * - Time grid: ↑/↓ move 15 min, ←/→ move a day, Shift+↑/↓ change the end time.
 * - Day cells (month / all-day row): ←/→ move a day, ↑/↓ move a week (month only).
 */
export function handleEventKey(e: KeyboardEvent, occ: Occurrence, handlers: EventHandlers, context: 'grid' | 'allday' | 'month'): void {
  if (e.altKey || e.metaKey || e.ctrlKey) return;
  let patch: EventPatch | null = null;
  let label = 'Event moved';
  const timed = context === 'grid';
  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowDown': {
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (timed && e.shiftKey) {
        const end = addMinutes(occ.end, dir * SNAP_MINUTES);
        if (differenceInMinutes(end, occ.start) < SNAP_MINUTES) return;
        patch = { end };
        label = 'Duration changed';
      } else if (timed) patch = shiftOccurrence(occ, 0, dir * SNAP_MINUTES);
      else if (context === 'month') patch = shiftOccurrence(occ, dir * 7);
      break;
    }
    case 'ArrowLeft':
    case 'ArrowRight':
      if (e.shiftKey) return;
      patch = shiftOccurrence(occ, e.key === 'ArrowLeft' ? -1 : 1);
      break;
    case 'Delete':
    case 'Backspace':
      e.preventDefault();
      e.stopPropagation();
      handlers.onDelete(occ);
      return;
    default:
      return;
  }
  if (!patch) return;
  e.preventDefault();
  e.stopPropagation();
  handlers.onChange(occ, patch, label);
}

export const EVENT_KEY_HINT = 'Enter to edit. Arrow keys move the event, Shift with Up or Down changes its duration, Delete removes it.';
