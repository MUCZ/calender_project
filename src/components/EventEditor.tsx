import { useMemo, useState, type FormEvent } from 'react';
import { addDays, addMinutes, differenceInCalendarDays, differenceInMinutes, formatShortDate, parseLocal, toDateKey, toLocalISO } from '../lib/dates';
import { describeRecurrence, normalizeRecurrence } from '../lib/recurrence';
import { newId } from '../lib/store';
import type { CalendarCategory, CalendarEvent, EventPatch, Occurrence, WeeklyRecurrence } from '../lib/types';
import { Dialog } from './Dialog';
import { Clock, Notes, Pin, Repeat, Trash } from './icons';

export type EditorTarget =
  | { kind: 'create'; start: Date; end: Date; allDay: boolean }
  | { kind: 'edit'; occ: Occurrence; event: CalendarEvent };

interface Props {
  target: EditorTarget;
  calendars: CalendarCategory[];
  defaultCalendarId: string;
  onCreate: (event: CalendarEvent) => void;
  onUpdate: (occ: Occurrence, patch: EventPatch) => void;
  onDelete: (occ: Occurrence) => void;
  onClose: () => void;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const timeOf = (d: Date) => toLocalISO(d).slice(11);

interface FormState {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  calendarId: string;
  location: string;
  notes: string;
  repeat: boolean;
  weekdays: number[];
  interval: number;
  until: string;
}

function initialState(target: EditorTarget, defaultCalendarId: string): FormState {
  const src = target.kind === 'edit' ? target.occ : { ...target, title: '', calendarId: defaultCalendarId, location: '', notes: '' };
  const rule = target.kind === 'edit' ? target.event.recurrence : undefined;
  // All-day ends are exclusive; the form shows the inclusive last day.
  const endShown = src.allDay ? addDays(src.end, -1) : src.end;
  return {
    title: src.title,
    allDay: src.allDay,
    startDate: toDateKey(src.start),
    startTime: src.allDay ? '09:00' : timeOf(src.start),
    endDate: toDateKey(endShown < src.start ? src.start : endShown),
    endTime: src.allDay ? '10:00' : timeOf(src.end),
    calendarId: src.calendarId,
    location: src.location ?? '',
    notes: src.notes ?? '',
    repeat: !!rule,
    weekdays: rule?.byWeekday ?? [src.start.getDay()],
    interval: rule?.interval ?? 1,
    until: rule?.until ?? '',
  };
}

function toRange(f: FormState): { start: Date; end: Date } | null {
  try {
    if (f.allDay) {
      const start = parseLocal(f.startDate);
      return { start, end: addDays(parseLocal(f.endDate), 1) };
    }
    return { start: parseLocal(`${f.startDate}T${f.startTime}`), end: parseLocal(`${f.endDate}T${f.endTime}`) };
  } catch {
    return null;
  }
}

export function EventEditor({ target, calendars, defaultCalendarId, onCreate, onUpdate, onDelete, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => initialState(target, defaultCalendarId));
  const [initial] = useState(form);
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const range = toRange(form);
  const error = !range ? 'Enter a valid date and time.' : range.end <= range.start ? 'The event must end after it starts.' : null;
  const isEdit = target.kind === 'edit';
  const occ = isEdit ? target.occ : null;
  const calendar = calendars.find((c) => c.id === form.calendarId);

  const rule: WeeklyRecurrence | undefined = useMemo(() => {
    if (!form.repeat || !range) return undefined;
    return normalizeRecurrence({ freq: 'weekly', interval: form.interval, byWeekday: form.weekdays, ...(form.until ? { until: form.until } : {}) }, range.start);
  }, [form.repeat, form.interval, form.weekdays, form.until, range?.start.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Moves the whole event (keeps duration) — the touch/keyboard alternative to dragging. */
  const shift = (days: number, minutes: number) => {
    if (!range) return;
    const dayShift = (d: Date) => addMinutes(addDays(d, days), minutes);
    const start = dayShift(range.start);
    const end = dayShift(range.end);
    setForm((f) => {
      const next = { ...f, startDate: toDateKey(start), endDate: toDateKey(f.allDay ? addDays(end, -1) : end) };
      if (!f.allDay) {
        next.startTime = timeOf(start);
        next.endTime = timeOf(end);
      }
      // Keep a single-weekday repeat in sync with the new day.
      if (f.repeat && f.weekdays.length === 1 && days) next.weekdays = [start.getDay()];
      return next;
    });
  };

  /** Changes the duration by moving the end. */
  const stretch = (delta: number) => {
    if (!range) return;
    if (form.allDay) {
      const end = addDays(range.end, delta);
      if (differenceInCalendarDays(end, range.start) < 1) return;
      set('endDate', toDateKey(addDays(end, -1)));
      return;
    }
    const end = addMinutes(range.end, delta);
    if (differenceInMinutes(end, range.start) < 15) return;
    setForm((f) => ({ ...f, endDate: toDateKey(end), endTime: timeOf(end) }));
  };

  const setStartDate = (value: string) => {
    if (!value || !range) return set('startDate', value);
    // Keep the duration when the start date moves.
    const delta = differenceInCalendarDays(parseLocal(value), range.start);
    setForm((f) => ({ ...f, startDate: value, endDate: toDateKey(addDays(parseLocal(f.endDate), delta)) }));
  };

  const setStartTime = (value: string) => {
    if (!value || !range || form.allDay) return set('startTime', value);
    const duration = differenceInMinutes(range.end, range.start);
    const start = parseLocal(`${form.startDate}T${value}`);
    const end = addMinutes(start, duration);
    setForm((f) => ({ ...f, startTime: value, endDate: toDateKey(end), endTime: timeOf(end) }));
  };

  const recurrenceChanged =
    form.repeat !== initial.repeat ||
    (form.repeat &&
      (form.interval !== initial.interval || form.until !== initial.until || [...form.weekdays].sort().join() !== [...initial.weekdays].sort().join()));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (error || !range) return;
    const title = form.title.trim();
    if (target.kind === 'create') {
      onCreate({
        id: newId(),
        title: title || '(No title)',
        start: toLocalISO(range.start),
        end: toLocalISO(range.end),
        allDay: form.allDay,
        calendarId: form.calendarId,
        ...(form.location.trim() ? { location: form.location.trim() } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        ...(rule ? { recurrence: rule } : {}),
      });
      return;
    }
    const o = target.occ;
    const patch: EventPatch = {};
    if ((title || '(No title)') !== o.title) patch.title = title || '(No title)';
    if (form.allDay !== o.allDay) patch.allDay = form.allDay;
    if (form.calendarId !== o.calendarId) patch.calendarId = form.calendarId;
    if (form.location.trim() !== (o.location ?? '')) patch.location = form.location.trim();
    if (form.notes.trim() !== (o.notes ?? '')) patch.notes = form.notes.trim();
    if (range.start.getTime() !== o.start.getTime() || range.end.getTime() !== o.end.getTime()) {
      patch.start = range.start;
      patch.end = range.end;
    }
    if (recurrenceChanged) patch.recurrence = rule ?? null;
    if (!Object.keys(patch).length) return onClose();
    onUpdate(o, patch);
  };

  return (
    <Dialog
      title={isEdit ? 'Edit event' : 'New event'}
      onClose={onClose}
      className="editor"
      initialFocus="#ev-title"
      footer={
        <>
          {isEdit && (
            <button type="button" className="btn btn-danger-ghost" onClick={() => onDelete(occ!)}>
              <Trash size={16} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="event-form" className="btn btn-primary">
            Save
          </button>
        </>
      }
    >
      <form id="event-form" className="editor-form" onSubmit={submit} noValidate style={{ '--c': calendar?.color } as React.CSSProperties}>
        {occ?.recurring && (
          <div className="series-note" role="note">
            <Repeat size={15} />
            <div>
              <strong>Part of a weekly series</strong>
              <span>
                {target.kind === 'edit' && target.event.recurrence ? describeRecurrence(target.event.recurrence) : ''}
                {occ.isException ? ' · this occurrence has its own changes' : ''}. You'll choose whether changes apply to this occurrence only or the entire series.
              </span>
            </div>
          </div>
        )}

        <input
          id="ev-title"
          className="editor-title"
          placeholder="Add title"
          aria-label="Title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          autoComplete="off"
        />

        <fieldset className="field-group">
          <legend className="sr-only">Date and time</legend>
          <div className="field-icon" aria-hidden="true">
            <Clock size={16} />
          </div>
          <div className="field-stack">
            <label className="switch">
              <input type="checkbox" checked={form.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              All-day
            </label>
            <div className="dt-row">
              <label className="dt-label" htmlFor="ev-start-date">Starts</label>
              <input id="ev-start-date" type="date" value={form.startDate} onChange={(e) => setStartDate(e.target.value)} required />
              {!form.allDay && <input aria-label="Start time" type="time" step={900} value={form.startTime} onChange={(e) => setStartTime(e.target.value)} required />}
            </div>
            <div className="dt-row">
              <label className="dt-label" htmlFor="ev-end-date">Ends</label>
              <input id="ev-end-date" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} required aria-invalid={submitted && !!error} />
              {!form.allDay && <input aria-label="End time" type="time" step={900} value={form.endTime} onChange={(e) => set('endTime', e.target.value)} required aria-invalid={submitted && !!error} />}
            </div>
            {range && !error && !form.allDay && toDateKey(range.start) !== toDateKey(range.end) && (
              <p className="hint">Ends the next day{differenceInCalendarDays(range.end, range.start) > 1 ? 's' : ''} · {formatShortDate(range.end)}</p>
            )}
            {error && (submitted || (range && range.end <= range.start)) && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <div className="quick-adjust" role="group" aria-label="Quick adjust">
              <div className="qa-group" role="group" aria-label="Move event">
                <span className="quick-label" aria-hidden="true">Move</span>
                <button type="button" className="chip-btn" onClick={() => shift(-1, 0)} aria-label="Move one day earlier">−1d</button>
                {!form.allDay && <button type="button" className="chip-btn" onClick={() => shift(0, -15)} aria-label="Move 15 minutes earlier">−15m</button>}
                {!form.allDay && <button type="button" className="chip-btn" onClick={() => shift(0, 15)} aria-label="Move 15 minutes later">+15m</button>}
                <button type="button" className="chip-btn" onClick={() => shift(1, 0)} aria-label="Move one day later">+1d</button>
              </div>
              <div className="qa-group" role="group" aria-label="Change duration">
                <span className="quick-label" aria-hidden="true">Length</span>
                <button type="button" className="chip-btn" onClick={() => stretch(form.allDay ? -1 : -15)} aria-label={form.allDay ? 'Shorten by one day' : 'Shorten by 15 minutes'}>−</button>
                <button type="button" className="chip-btn" onClick={() => stretch(form.allDay ? 1 : 15)} aria-label={form.allDay ? 'Lengthen by one day' : 'Lengthen by 15 minutes'}>+</button>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset className="field-group">
          <legend className="sr-only">Repeat</legend>
          <div className="field-icon" aria-hidden="true">
            <Repeat size={16} />
          </div>
          <div className="field-stack">
            <label className="switch">
              <input type="checkbox" checked={form.repeat} onChange={(e) => set('repeat', e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              Repeat weekly
            </label>
            {form.repeat && (
              <>
                <div className="weekday-picker" role="group" aria-label="Repeat on">
                  {WEEKDAYS.map((d) => {
                    const on = form.weekdays.includes(d);
                    const locked = range?.start.getDay() === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`weekday${on || locked ? ' is-on' : ''}`}
                        aria-pressed={on || locked}
                        aria-label={WEEKDAY_LABELS[d]}
                        title={locked ? 'The event’s own day is always included' : undefined}
                        onClick={() => !locked && set('weekdays', on ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d])}
                      >
                        {WEEKDAY_LABELS[d][0]}
                      </button>
                    );
                  })}
                </div>
                <div className="repeat-row">
                  <label>
                    Every
                    <select value={form.interval} onChange={(e) => set('interval', Number(e.target.value))}>
                      {[1, 2, 3, 4].map((i) => (
                        <option key={i} value={i}>
                          {i === 1 ? 'week' : `${i} weeks`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Until
                    <input type="date" value={form.until} min={form.startDate} onChange={(e) => set('until', e.target.value)} aria-label="Repeat until (optional)" />
                  </label>
                  {form.until && (
                    <button type="button" className="link-btn" onClick={() => set('until', '')}>
                      No end
                    </button>
                  )}
                </div>
                {rule && <p className="hint">{describeRecurrence(rule)}</p>}
              </>
            )}
          </div>
        </fieldset>

        <div className="field-group">
          <div className="field-icon" aria-hidden="true">
            <span className="cal-dot" style={{ background: calendar?.color }} />
          </div>
          <label className="field-stack">
            <span className="sr-only">Calendar</span>
            <select value={form.calendarId} onChange={(e) => set('calendarId', e.target.value)} aria-label="Calendar">
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-group">
          <div className="field-icon" aria-hidden="true">
            <Pin size={16} />
          </div>
          <input className="field-stack" placeholder="Add location" aria-label="Location" value={form.location} onChange={(e) => set('location', e.target.value)} />
        </div>

        <div className="field-group">
          <div className="field-icon" aria-hidden="true">
            <Notes size={16} />
          </div>
          <textarea className="field-stack" placeholder="Add notes" aria-label="Notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </form>
    </Dialog>
  );
}
