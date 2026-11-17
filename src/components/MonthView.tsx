import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { addDays, differenceInCalendarDays, formatMonthShort, formatTime, formatWeekday, formatWeekdayNarrow, isSameDay, parseLocal, startOfDay, toDateKey } from '../lib/dates';
import { isSpanning, layoutSpans, type SpanItem } from '../lib/layout';
import { matchesQuery } from '../lib/search';
import type { CalendarCategory, Occurrence } from '../lib/types';
import { describeOccurrence, handleEventKey, type EventHandlers } from './eventUtils';
import { Repeat } from './icons';

interface Props extends EventHandlers {
  days: Date[]; // 42 days, Monday-first
  month: number;
  occurrences: Occurrence[];
  calendars: Map<string, CalendarCategory>;
  now: Date;
  query: string;
  compact: boolean;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onSelectDay: (day: Date) => void;
}

const LANE_PX = 22;
const HEADER_PX = 28;

interface DragData {
  occ: Occurrence;
  pointerId: number;
  startX: number;
  startY: number;
  originDate: string;
  targetDate: string;
  active: boolean;
}

const dateFromPoint = (x: number, y: number): string | null => {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  return el?.closest<HTMLElement>('[data-date]')?.dataset.date ?? null;
};

export function MonthView(props: Props) {
  const { days, month, occurrences, calendars, now, query, compact, onCreate, onOpen, onChange, onSelectDay } = props;
  const weeksRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(110);
  const [drag, setDrag] = useState<DragData | null>(null);
  const dragRef = useRef<DragData | null>(null);
  const suppressClickUntil = useRef(0);

  useLayoutEffect(() => {
    const el = weeksRef.current;
    if (!el) return;
    const measure = () => setRowHeight(el.clientHeight / 6);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const laneHeight = compact ? 18 : LANE_PX;
  const headerHeight = compact ? 24 : HEADER_PX;
  // Lanes that fit in a row, reserving one for the "+N more" link when needed.
  const maxLanes = Math.max(1, Math.floor((rowHeight - headerHeight - 4) / laneHeight));

  const weeks = useMemo(() => {
    // Timed events shorter than a day appear as single-day items on their start day.
    const items = occurrences.map((o) => (isSpanning(o) ? o : { ...o, end: o.start }));
    const originals = new Map(occurrences.map((o) => [o.key, o]));
    return Array.from({ length: 6 }, (_, w) => {
      const weekStart = days[w * 7];
      const { items: spans } = layoutSpans(items, weekStart, 7);
      return spans.map((s) => ({ ...s, occ: originals.get(s.occ.key)! }));
    });
  }, [occurrences, days]);

  const endDrag = useCallback(
    (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      document.body.classList.remove('is-dragging');
      if (!d?.active) return;
      suppressClickUntil.current = performance.now() + 250;
      if (!commit) return;
      const delta = differenceInCalendarDays(parseLocal(d.targetDate), parseLocal(d.originDate));
      if (!delta) return;
      onChange(d.occ, { start: addDays(d.occ.start, delta), end: addDays(d.occ.end, delta) }, 'Event moved');
    },
    [onChange],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
      if (!d.active) document.body.classList.add('is-dragging');
      const target = dateFromPoint(e.clientX, e.clientY) ?? d.targetDate;
      const next = { ...d, active: true, targetDate: target };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = (e: PointerEvent) => {
      if (dragRef.current?.pointerId === e.pointerId) endDrag(e.type === 'pointerup');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current?.active) {
        e.preventDefault();
        e.stopPropagation();
        endDrag(false);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [endDrag]);

  const beginDrag = (e: ReactPointerEvent, occ: Occurrence) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    e.stopPropagation();
    const originDate = dateFromPoint(e.clientX, e.clientY) ?? toDateKey(occ.start);
    dragRef.current = { occ, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originDate, targetDate: originDate, active: false };
  };

  const clickAllowed = () => performance.now() > suppressClickUntil.current;

  // Highlight the days the dragged event would cover.
  const dropRange = useMemo(() => {
    if (!drag?.active) return null;
    const delta = differenceInCalendarDays(parseLocal(drag.targetDate), parseLocal(drag.originDate));
    const start = startOfDay(addDays(drag.occ.start, delta));
    const lastDay = isSpanning(drag.occ) ? startOfDay(addDays(drag.occ.end, delta - (drag.occ.allDay ? 1 : 0))) : start;
    return { start, end: lastDay < start ? start : lastDay };
  }, [drag]);

  return (
    <div className={`mv${compact ? ' is-compact' : ''}`}>
      <div className="mv-weekdays" aria-hidden="true">
        {days.slice(0, 7).map((d, i) => (
          <div key={i} className="mv-weekday">
            {compact ? formatWeekdayNarrow(d) : formatWeekday(d)}
          </div>
        ))}
      </div>
      <div className="mv-weeks" ref={weeksRef} role="grid" aria-label="Month">
        {weeks.map((spans, w) => {
          const weekDays = days.slice(w * 7, w * 7 + 7);
          const covering = weekDays.map((_, i) => spans.filter((s) => s.startIdx <= i && s.endIdx >= i));
          // A day needs a "+N more" link when anything covering it sits beyond the last lane.
          const needsMore = covering.map((list) => list.some((s) => s.lane >= maxLanes));
          const visibleLanes = (i: number) => (needsMore[i] ? maxLanes - 1 : maxLanes);
          return (
            <div key={w} className="mv-week" role="row">
              {weekDays.map((d, i) => {
                const outside = d.getMonth() !== month;
                const isToday = isSameDay(d, now);
                const inDrop = dropRange && d >= dropRange.start && d <= dropRange.end;
                const dayLabel = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
                const hiddenCount = needsMore[i] ? covering[i].filter((s) => s.lane >= visibleLanes(i)).length : 0;
                return (
                  <div
                    key={i}
                    role="gridcell"
                    data-date={toDateKey(d)}
                    className={`mv-day${outside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${inDrop ? ' is-drop' : ''}`}
                    onClick={(e) => {
                      if (!clickAllowed() || (e.target as HTMLElement).closest('.event, button')) return;
                      onCreate(startOfDay(d), addDays(startOfDay(d), 1), true);
                    }}
                  >
                    <button type="button" className="mv-date" onClick={() => onSelectDay(d)} aria-label={`${dayLabel}${isToday ? ', today' : ''}. Open day view`}>
                      {d.getDate() === 1 && !compact ? `${formatMonthShort(d)} 1` : d.getDate()}
                    </button>
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        className="mv-more"
                        style={{ top: headerHeight + visibleLanes(i) * laneHeight }}
                        onClick={() => onSelectDay(d)}
                        aria-label={`${hiddenCount} more events on ${dayLabel}. Open day view`}
                      >
                        +{hiddenCount}
                        {compact ? '' : ' more'}
                      </button>
                    )}
                  </div>
                );
              })}
              {spans.map((s) => (
                <MonthEvent
                  key={s.occ.key}
                  item={s}
                  hidden={Array.from({ length: s.endIdx - s.startIdx + 1 }, (_, k) => s.lane >= visibleLanes(s.startIdx + k)).some(Boolean)}
                  top={headerHeight + s.lane * laneHeight}
                  calendar={calendars.get(s.occ.calendarId)}
                  dimmed={!!query && !matchesQuery(s.occ, query)}
                  matched={!!query && matchesQuery(s.occ, query)}
                  dragging={drag?.active === true && drag.occ.key === s.occ.key}
                  onPointerDown={(e) => beginDrag(e, s.occ)}
                  onClick={() => clickAllowed() && onOpen(s.occ)}
                  onKeyDown={(e) => handleEventKey(e, s.occ, props, 'month')}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MonthEventProps {
  item: SpanItem;
  top: number;
  hidden: boolean;
  calendar?: CalendarCategory;
  dimmed: boolean;
  matched: boolean;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function MonthEvent({ item, top, hidden, calendar, dimmed, matched, dragging, onPointerDown, onClick, onKeyDown }: MonthEventProps) {
  const { occ } = item;
  const bar = isSpanning(occ);
  if (hidden) return null;
  const style = {
    '--c': calendar?.color ?? '#6b7280',
    top,
    left: `calc(${(item.startIdx / 7) * 100}% + 3px)`,
    width: `calc(${((item.endIdx - item.startIdx + 1) / 7) * 100}% - 7px)`,
  } as CSSProperties;
  return (
    <button
      type="button"
      data-occ-key={occ.key}
      className={`event mv-event ${bar ? 'event-bar' : 'mv-dot-event'}${item.continuesBefore ? ' cont-before' : ''}${item.continuesAfter ? ' cont-after' : ''}${dimmed ? ' is-dimmed' : ''}${matched ? ' is-match' : ''}${dragging ? ' is-drag-source' : ''}`}
      style={style}
      aria-label={describeOccurrence(occ, calendar?.name)}
      aria-describedby="event-key-hint"
      onPointerDown={onPointerDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {!bar && <span className="mv-dot" aria-hidden="true" />}
      {!bar && <span className="event-time">{formatTime(occ.start)}</span>}
      {occ.recurring && bar && <Repeat size={11} className="event-repeat" />}
      <span className="event-title">{occ.title || '(No title)'}</span>
    </button>
  );
}
