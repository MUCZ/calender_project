import { addDays } from './dates';
import { expandEvents } from './recurrence';
import type { CalendarEvent, Occurrence } from './types';

export function matchesQuery(occ: Pick<Occurrence, 'title' | 'location' | 'notes'>, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = `${occ.title} ${occ.location ?? ''} ${occ.notes ?? ''}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/**
 * Finds occurrences matching `query`. Each series contributes its next upcoming match
 * (or its most recent past match) so results stay concise.
 */
export function searchEvents(events: CalendarEvent[], query: string, now: Date, limit = 30): Occurrence[] {
  if (!query.trim()) return [];
  const occs = expandEvents(events, addDays(now, -365), addDays(now, 365)).filter((o) => matchesQuery(o, query));
  const bySeries = new Map<string, Occurrence>();
  for (const o of occs) {
    if (!o.recurring) {
      bySeries.set(o.key, o);
      continue;
    }
    const current = bySeries.get(o.eventId);
    const isUpcoming = o.end >= now;
    if (!current) bySeries.set(o.eventId, o);
    else if (current.end < now && isUpcoming) bySeries.set(o.eventId, o);
    else if (current.end < now && !isUpcoming && o.start > current.start) bySeries.set(o.eventId, o);
  }
  const results = [...bySeries.values()];
  // Upcoming first (soonest first), then past events (most recent first).
  results.sort((a, b) => {
    const au = a.end >= now;
    const bu = b.end >= now;
    if (au !== bu) return au ? -1 : 1;
    return au ? a.start.getTime() - b.start.getTime() : b.start.getTime() - a.start.getTime();
  });
  return results.slice(0, limit);
}
