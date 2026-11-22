import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  addDays,
  addMinutes,
  atMinutes,
  clamp,
  differenceInMinutes,
  formatHourLabel,
  formatTime,
  formatTimeRange,
  formatWeekday,
  isSameDay,
  minutesOfDay,
  MINUTES_PER_DAY,
  snapMinutes,
  startOfDay,
} from '../lib/dates';
import { isSpanning, layoutDay, layoutSpans, splitIntoDaySegments, type DaySegment, type PositionedSegment } from '../lib/layout';
import { matchesQuery } from '../lib/search';
import type { CalendarCategory, Occurrence } from '../lib/types';
import { describeOccurrence, handleEventKey, SNAP_MINUTES, type EventHandlers } from './eventUtils';
import { Repeat } from './icons';

export const HOUR_PX = 48;
const ALLDAY_LANE_PX = 24;
const DRAG_THRESHOLD = 4;

interface Props extends EventHandlers {
  days: Date[];
  occurrences: Occurrence[];
  calendars: Map<string, CalendarCategory>;
  now: Date;
  query: string;
  compact: boolean;
  onCreate: (start: Date, end: Date, allDay: boolean) => void;
  onSelectDay?: (day: Date) => void;
}

type DragMode = 'move' | 'resize-start' | 'resize-end' | 'create' | 'span-move';

interface DragData {
  mode: DragMode;
  occ?: Occurrence;
  pointerId: number;
  startX: number;
  startY: number;
  originDay: number;
  originMin: number;
  active: boolean;
  lastX: number;
  lastY: number;
}

interface Preview {
  mode: DragMode;
  occ?: Occurrence;
  start: Date;
  end: Date;
}

const colorVar = (color?: string) => ({ '--c': color ?? '#6b7280' }) as CSSProperties;

export function TimeGridView(props: Props) {
  const { days, occurrences, calendars, now, query, compact, onCreate, onOpen, onChange, onSelectDay } = props;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  const alldayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragData | null>(null);
  const suppressClickUntil = useRef(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const n = days.length;
  const first = days[0];
  const rangeEnd = addDays(first, n);

  const spanning = useMemo(() => occurrences.filter(isSpanning), [occurrences]);
  const timed = useMemo(() => occurrences.filter((o) => !isSpanning(o)), [occurrences]);
  const allday = useMemo(() => layoutSpans(spanning, first, n), [spanning, first, n]);
  const columns = useMemo(() => {
    const segs = splitIntoDaySegments(timed, days);
    return days.map((_, i) => layoutDay(segs.filter((s) => s.dayIndex === i)));
  }, [timed, days]);

  // Start the day at 7:00, or a bit before "now" when it's later in the day.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const hour = days.some((d) => isSameDay(d, now)) ? clamp(now.getHours() - 2, 7, 16) : 7;
    el.scrollTop = hour * HOUR_PX - 8;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- pointer helpers ----------
  const slotAt = useCallback(
    (clientX: number, clientY: number) => {
      const rect = daysRef.current!.getBoundingClientRect();
      const day = clamp(Math.floor(((clientX - rect.left) / rect.width) * n), 0, n - 1);
      const min = clamp(((clientY - rect.top) / HOUR_PX) * 60, 0, MINUTES_PER_DAY);
      return { day, min };
    },
    [n],
  );

  const spanDayAt = useCallback(
    (clientX: number) => {
      const rect = (alldayRef.current ?? daysRef.current)!.getBoundingClientRect();
      return clamp(Math.floor(((clientX - rect.left) / rect.width) * n), 0, n - 1);
    },
    [n],
  );

  const computePreview = useCallback(
    (d: DragData): Preview | null => {
      if (d.mode === 'span-move') {
        const occ = d.occ!;
        const delta = spanDayAt(d.lastX) - d.originDay;
        return { mode: d.mode, occ, start: addDays(occ.start, delta), end: addDays(occ.end, delta) };
      }
      const slot = slotAt(d.lastX, d.lastY);
      if (d.mode === 'create') {
        const a = atMinutes(days[d.originDay], Math.floor(d.originMin / SNAP_MINUTES) * SNAP_MINUTES);
        let b = atMinutes(days[slot.day], snapMinutes(slot.min, SNAP_MINUTES));
        if (b <= a) {
          // Dragging upwards: anchor at the end of the original slot.
          const end = addMinutes(a, SNAP_MINUTES);
          b = atMinutes(days[slot.day], Math.floor(slot.min / SNAP_MINUTES) * SNAP_MINUTES);
          return { mode: d.mode, start: b < end ? b : a, end: b < end ? end : addMinutes(b, SNAP_MINUTES) };
        }
        return { mode: d.mode, start: a, end: b };
      }
      const occ = d.occ!;
      const duration = differenceInMinutes(occ.end, occ.start);
      if (d.mode === 'move') {
        const raw = addMinutes(addDays(occ.start, slot.day - d.originDay), slot.min - d.originMin);
        const start = atMinutes(raw, snapMinutes(minutesOfDay(raw), SNAP_MINUTES));
        return { mode: d.mode, occ, start, end: addMinutes(start, duration) };
      }
      const t = atMinutes(days[slot.day], snapMinutes(slot.min, SNAP_MINUTES));
      if (d.mode === 'resize-end') {
        const minEnd = addMinutes(occ.start, SNAP_MINUTES);
        return { mode: d.mode, occ, start: occ.start, end: t < minEnd ? minEnd : t };
      }
      const maxStart = addMinutes(occ.end, -SNAP_MINUTES);
      return { mode: d.mode, occ, start: t > maxStart ? maxStart : t, end: occ.end };
    },
    [days, slotAt, spanDayAt],
  );

  const endDrag = useCallback(
    (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      setPreview(null);
      document.body.classList.remove('is-dragging');
      if (!d || !d.active) return;
      suppressClickUntil.current = performance.now() + 250;
      if (!commit) return;
      const p = computePreview(d);
      if (!p) return;
      if (d.mode === 'create') {
        onCreate(p.start, p.end, false);
        return;
      }
      const occ = d.occ!;
      if (p.start.getTime() === occ.start.getTime() && p.end.getTime() === occ.end.getTime()) return;
      const label = d.mode === 'move' || d.mode === 'span-move' ? 'Event moved' : 'Duration changed';
      onChange(occ, d.mode === 'resize-end' ? { end: p.end } : d.mode === 'resize-start' ? { start: p.start } : { start: p.start, end: p.end }, label);
    },
    [computePreview, onChange, onCreate],
  );

  // Window-level listeners while a pointer drag is in progress.
  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.lastX = e.clientX;
      d.lastY = e.clientY;
      if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      if (!d.active) {
        d.active = true;
        document.body.classList.add('is-dragging');
      }
      setPreview(computePreview(d));
    };
    const onUp = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) endDrag(e.type === 'pointerup');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current?.active) {
        e.preventDefault();
        e.stopPropagation();
        endDrag(false);
      }
    };
    // Auto-scroll when dragging near the top/bottom edge of the grid.
    const tick = () => {
      const d = dragRef.current;
      const el = scrollerRef.current;
      if (d?.active && el && d.mode !== 'span-move') {
        const rect = el.getBoundingClientRect();
        const headerH = (el.querySelector('.tg-header') as HTMLElement | null)?.offsetHeight ?? 0;
        const topEdge = rect.top + headerH;
        let dy = 0;
        if (d.lastY < topEdge + 32) dy = -Math.ceil((topEdge + 32 - d.lastY) / 4);
        else if (d.lastY > rect.bottom - 32) dy = Math.ceil((d.lastY - (rect.bottom - 32)) / 4);
        if (dy) {
          el.scrollTop += clamp(dy, -20, 20);
          setPreview(computePreview(d));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [computePreview, endDrag]);

  const beginDrag = (e: ReactPointerEvent, mode: DragMode, occ?: Occurrence) => {
    // Touch uses tap-to-edit plus the editor's quick-adjust controls instead of dragging,
    // so that swiping keeps scrolling the grid.
    if (e.button !== 0 || e.pointerType === 'touch') return;
    e.stopPropagation();
    const slot = mode === 'span-move' ? { day: spanDayAt(e.clientX), min: 0 } : slotAt(e.clientX, e.clientY);
    dragRef.current = {
      mode,
      occ,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      originDay: slot.day,
      originMin: slot.min,
      active: false,
    };
    if (mode !== 'move' && mode !== 'span-move') e.preventDefault();
  };

  const clickAllowed = () => performance.now() > suppressClickUntil.current;

  const onGridClick = (e: React.MouseEvent) => {
    if (!clickAllowed() || (e.target as HTMLElement).closest('.event')) return;
    const slot = slotAt(e.clientX, e.clientY);
    const start = atMinutes(days[slot.day], Math.floor(slot.min / 30) * 30);
    onCreate(start, addMinutes(start, 60), false);
  };

  const onAlldayClick = (e: React.MouseEvent) => {
    if (!clickAllowed() || (e.target as HTMLElement).closest('.event')) return;
    const day = days[spanDayAt(e.clientX)];
    onCreate(day, addDays(day, 1), true);
  };

  const openFromClick = (occ: Occurrence) => {
    if (clickAllowed()) onOpen(occ);
  };

  const dragging = preview?.occ?.key;
  const todayIdx = days.findIndex((d) => isSameDay(d, now));
  const nowTop = (minutesOfDay(now) / 60) * HOUR_PX;
  const alldayLanes = Math.max(1, allday.laneCount);

  const dim = (o: Occurrence) => (query ? (matchesQuery(o, query) ? ' is-match' : ' is-dimmed') : '');

  // Ghost segments for the timed-grid drag preview.
  const ghostSegments: DaySegment[] =
    preview && preview.mode !== 'span-move'
      ? splitIntoDaySegments(
          [
            preview.occ
              ? { ...preview.occ, start: preview.start, end: preview.end }
              : { key: '__new', eventId: '__new', title: 'New event', start: preview.start, end: preview.end, allDay: false, calendarId: '', recurring: false, isException: false },
          ],
          days,
        )
      : [];

  return (
    <div className={`tg${compact ? ' is-compact' : ''}${n === 7 ? ' is-week' : ' is-day'}`} ref={scrollerRef} style={{ '--days': n } as CSSProperties}>
      <div className="tg-header">
        <div className="tg-row tg-dayheads">
          <div className="tg-gutter-cell tg-tz" aria-hidden="true">
            {timezoneLabel()}
          </div>
          {days.map((d, i) => {
            const isToday = i === todayIdx;
            const label = (
              <>
                <span className="tg-dow">{formatWeekday(d)}</span>
                <span className={`tg-date${isToday ? ' is-today' : ''}`}>{d.getDate()}</span>
              </>
            );
            return onSelectDay && n > 1 ? (
              <button
                key={i}
                type="button"
                className={`tg-dayhead${isToday ? ' is-today' : ''}`}
                onClick={() => onSelectDay(d)}
                aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}. Open day view`}
              >
                {label}
              </button>
            ) : (
              <div key={i} className={`tg-dayhead${isToday ? ' is-today' : ''}`}>
                {label}
              </div>
            );
          })}
        </div>
        <div className="tg-row tg-allday">
          <div className="tg-gutter-cell tg-allday-label">All-day</div>
          <div
            className="tg-allday-area"
            ref={alldayRef}
            style={{ height: alldayLanes * ALLDAY_LANE_PX + 8 }}
            onClick={onAlldayClick}
            role="group"
            aria-label="All-day events"
          >
            {days.map((_, i) => (
              <div key={i} className={`tg-allday-cell${i === todayIdx ? ' is-today' : ''}`} style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }} />
            ))}
            {allday.items.map((item) => {
              const cal = calendars.get(item.occ.calendarId);
              const { occ } = item;
              return (
                <button
                  key={occ.key}
                  type="button"
                  data-occ-key={occ.key}
                  className={`event event-bar${occ.allDay ? '' : ' is-timed-span'}${item.continuesBefore ? ' cont-before' : ''}${item.continuesAfter ? ' cont-after' : ''}${dragging === occ.key ? ' is-drag-source' : ''}${dim(occ)}`}
                  style={{
                    ...colorVar(cal?.color),
                    left: `calc(${(item.startIdx / n) * 100}% + 2px)`,
                    width: `calc(${((item.endIdx - item.startIdx + 1) / n) * 100}% - 5px)`,
                    top: item.lane * ALLDAY_LANE_PX + 4,
                  }}
                  aria-label={describeOccurrence(occ, cal?.name)}
                  aria-describedby="event-key-hint"
                  onPointerDown={(e) => beginDrag(e, 'span-move', occ)}
                  onClick={() => openFromClick(occ)}
                  onKeyDown={(e) => handleEventKey(e, occ, props, 'allday')}
                >
                  {occ.recurring && <Repeat size={11} className="event-repeat" />}
                  <span className="event-title">{occ.title || '(No title)'}</span>
                  {!occ.allDay && <span className="event-time">{formatTime(occ.start)}</span>}
                </button>
              );
            })}
            {preview?.mode === 'span-move' && preview.occ && (() => {
              const s = clamp(Math.round((startOfDay(preview.start).getTime() - first.getTime()) / 86_400_000), 0, n - 1);
              const lastDay = addDays(preview.end, preview.occ.allDay ? -1 : 0);
              const e = clamp(Math.round((startOfDay(lastDay).getTime() - first.getTime()) / 86_400_000), s, n - 1);
              const cal = calendars.get(preview.occ.calendarId);
              const visible = preview.end > first && preview.start < rangeEnd;
              return visible ? (
                <div
                  className="event event-bar is-ghost"
                  style={{ ...colorVar(cal?.color), left: `calc(${(s / n) * 100}% + 2px)`, width: `calc(${((e - s + 1) / n) * 100}% - 5px)`, top: 4 }}
                  aria-hidden="true"
                >
                  <span className="event-title">{preview.occ.title}</span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      </div>

      <div className="tg-body">
        <div className="tg-gutter" aria-hidden="true">
          {Array.from({ length: 23 }, (_, i) => (
            <span key={i} className="tg-hour" style={{ top: (i + 1) * HOUR_PX }}>
              {formatHourLabel(i + 1)}
            </span>
          ))}
        </div>
        <div
          className="tg-days"
          ref={daysRef}
          style={{ height: 24 * HOUR_PX }}
          onPointerDown={(e) => {
            if (!(e.target as HTMLElement).closest('.event')) beginDrag(e, 'create');
          }}
          onClick={onGridClick}
        >
          {days.map((d, i) => (
            <div key={i} className={`tg-col${i === todayIdx ? ' is-today' : ''}${d.getDay() % 6 === 0 ? ' is-weekend' : ''}`} role="group" aria-label={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
              {columns[i].map((seg) => (
                <TimedEvent
                  key={`${seg.occ.key}-${seg.dayIndex}`}
                  seg={seg}
                  calendar={calendars.get(seg.occ.calendarId)}
                  className={`${dragging === seg.occ.key ? ' is-drag-source' : ''}${dim(seg.occ)}`}
                  onPointerDown={(e, mode) => beginDrag(e, mode, seg.occ)}
                  onClick={() => openFromClick(seg.occ)}
                  onKeyDown={(e) => handleEventKey(e, seg.occ, props, 'grid')}
                />
              ))}
              {i === todayIdx && (
                <div className="now-line" style={{ top: nowTop }} aria-hidden="true">
                  <span className="now-dot" />
                </div>
              )}
            </div>
          ))}
          {ghostSegments.map((seg) => {
            const cal = preview?.occ ? calendars.get(preview.occ.calendarId) : undefined;
            const top = (seg.startMin / 60) * HOUR_PX;
            const height = Math.max(((seg.endMin - seg.startMin) / 60) * HOUR_PX, 18);
            return (
              <div
                key={`ghost-${seg.dayIndex}`}
                className={`event event-timed is-ghost${preview?.mode === 'create' ? ' is-new' : ''}${seg.continuesBefore ? ' cont-before' : ''}${seg.continuesAfter ? ' cont-after' : ''}`}
                style={{ ...colorVar(cal?.color ?? '#2f6fde'), top, height: height - 1, left: `calc(${(seg.dayIndex / n) * 100}% + 1px)`, width: `calc(${100 / n}% - 6px)` }}
                aria-hidden="true"
              >
                <span className="event-title">{seg.occ.title || '(No title)'}</span>
                <span className="event-time">{formatTimeRange(seg.occ.start, seg.occ.end)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function timezoneLabel(): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '−';
  const h = Math.floor(Math.abs(offset) / 60);
  const m = Math.abs(offset) % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

interface TimedEventProps {
  seg: PositionedSegment;
  calendar?: CalendarCategory;
  className: string;
  onPointerDown: (e: ReactPointerEvent, mode: DragMode) => void;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function TimedEvent({ seg, calendar, className, onPointerDown, onClick, onKeyDown }: TimedEventProps) {
  const { occ } = seg;
  const top = (seg.startMin / 60) * HOUR_PX;
  const rawHeight = ((seg.endMin - seg.startMin) / 60) * HOUR_PX;
  const height = Math.max(rawHeight, 18);
  const short = height < 38;
  const width = `calc(${(seg.span / seg.columns) * 100}% - ${seg.column + seg.span === seg.columns ? 6 : 2}px)`;
  const left = `calc(${(seg.column / seg.columns) * 100}% + 1px)`;
  const timeText = seg.continuesBefore ? `until ${formatTime(occ.end)}` : seg.continuesAfter ? `${formatTime(occ.start)} – ${formatTime(occ.end)}` : formatTimeRange(occ.start, occ.end);
  const style = { ...colorVar(calendar?.color), top, height: height - 1, left, width, zIndex: 1 + seg.column };
  return (
    <div
      className={`event event-timed${short ? ' is-short' : ''}${seg.continuesBefore ? ' cont-before' : ''}${seg.continuesAfter ? ' cont-after' : ''}${occ.isException ? ' is-exception' : ''}${className}`}
      style={style}
    >
      <button
        type="button"
        className="event-hit"
        data-occ-key={seg.continuesBefore ? undefined : occ.key}
        tabIndex={seg.continuesBefore ? -1 : 0}
        aria-label={describeOccurrence(occ, calendar?.name)}
        aria-describedby="event-key-hint"
        onPointerDown={(e) => onPointerDown(e, 'move')}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <span className="event-title">
          {occ.recurring && <Repeat size={11} className="event-repeat" />}
          {occ.title || '(No title)'}
          {short && <span className="event-time-inline">{formatTime(seg.continuesBefore ? occ.end : occ.start)}</span>}
        </span>
        {!short && <span className="event-time">{timeText}</span>}
        {!short && height > 64 && occ.location && <span className="event-loc">{occ.location}</span>}
      </button>
      {!seg.continuesBefore && (
        <span className="resize-handle resize-top" aria-hidden="true" onPointerDown={(e) => onPointerDown(e, 'resize-start')} />
      )}
      {!seg.continuesAfter && (
        <span className="resize-handle resize-bottom" aria-hidden="true" onPointerDown={(e) => onPointerDown(e, 'resize-end')} />
      )}
    </div>
  );
}
