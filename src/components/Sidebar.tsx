import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, addMonths, formatMonthYear, formatWeekdayNarrow, isSameDay, monthGridDays, startOfWeek } from '../lib/dates';
import type { CalendarCategory, ViewMode } from '../lib/types';
import { ChevronLeft, ChevronRight, Keyboard, More, Plus, Reset } from './icons';

interface Props {
  cursor: Date;
  view: ViewMode;
  now: Date;
  calendars: CalendarCategory[];
  hidden: string[];
  onPickDate: (d: Date) => void;
  onToggleCalendar: (id: string) => void;
  onEditCalendar: (c: CalendarCategory) => void;
  onAddCalendar: () => void;
  onShowShortcuts: () => void;
  onResetDemo: () => void;
}

export function Sidebar(props: Props) {
  const { calendars, hidden, onToggleCalendar, onEditCalendar, onAddCalendar, onShowShortcuts, onResetDemo } = props;
  return (
    <div className="sidebar-inner">
      <MiniMonth {...props} />
      <section className="cal-list" aria-labelledby="cal-list-title">
        <div className="section-head">
          <h2 id="cal-list-title">My calendars</h2>
          <button type="button" className="icon-btn sm" onClick={onAddCalendar} aria-label="Add calendar" title="Add calendar">
            <Plus size={16} />
          </button>
        </div>
        <ul>
          {calendars.map((c) => {
            const visible = !hidden.includes(c.id);
            return (
              <li key={c.id} className="cal-item">
                <label className="cal-toggle">
                  <input type="checkbox" checked={visible} onChange={() => onToggleCalendar(c.id)} />
                  <span className="cal-check" style={{ '--c': c.color } as React.CSSProperties} aria-hidden="true" />
                  <span className="cal-name">{c.name}</span>
                </label>
                <button type="button" className="icon-btn sm cal-more" onClick={() => onEditCalendar(c)} aria-label={`Edit ${c.name} calendar`}>
                  <More size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="sidebar-footer">
        <button type="button" className="text-btn" onClick={onShowShortcuts}>
          <Keyboard size={16} /> Keyboard shortcuts
        </button>
        <button type="button" className="text-btn" onClick={onResetDemo}>
          <Reset size={16} /> Reset demo data
        </button>
      </div>
    </div>
  );
}

/** Small month navigator with a roving tabindex (arrow keys move between days). */
function MiniMonth({ cursor, view, now, onPickDate }: Props) {
  const [month, setMonth] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const [focusDate, setFocusDate] = useState(cursor);
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  useEffect(() => {
    setMonth(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    setFocusDate(cursor);
  }, [cursor]);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, [focusDate, month]);

  const days = monthGridDays(month);
  const weekStart = startOfWeek(cursor);
  const inSelection = (d: Date) =>
    view === 'week' ? d >= weekStart && d < addDays(weekStart, 7) : view === 'day' ? isSameDay(d, cursor) : d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();

  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(focusDate, step);
    shouldFocus.current = true;
    setFocusDate(next);
    if (next.getMonth() !== month.getMonth()) setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const focusInGrid = days.some((d) => isSameDay(d, focusDate)) ? focusDate : days[7];

  return (
    <section className="mini" aria-label="Date picker">
      <div className="mini-head">
        <span className="mini-title" aria-live="polite">
          {formatMonthYear(month)}
        </span>
        <button type="button" className="icon-btn sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className="icon-btn sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="mini-grid" role="grid" ref={gridRef} onKeyDown={onKey}>
        {days.slice(0, 7).map((d) => (
          <span key={`h${d.getDay()}`} className="mini-dow" aria-hidden="true">
            {formatWeekdayNarrow(d)}
          </span>
        ))}
        {days.map((d) => {
          const cls = [
            'mini-day',
            d.getMonth() !== month.getMonth() && 'is-outside',
            isSameDay(d, now) && 'is-today',
            inSelection(d) && 'is-selected',
            isSameDay(d, cursor) && 'is-cursor',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={cls}
              tabIndex={isSameDay(d, focusInGrid) ? 0 : -1}
              aria-label={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              aria-current={isSameDay(d, now) ? 'date' : undefined}
              onClick={() => {
                setFocusDate(d);
                onPickDate(d);
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}
