import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CalendarDialog } from './components/CalendarDialog';
import { EventEditor, type EditorTarget } from './components/EventEditor';
import { describeChange, EVENT_KEY_HINT } from './components/eventUtils';
import { isEditableTarget, modKey, useMediaQuery, useNow } from './components/hooks';
import { CalendarIcon, ChevronLeft, ChevronRight, Close, Menu, Plus, Redo, Search, Undo } from './components/icons';
import { MonthView } from './components/MonthView';
import { ScopeDialog } from './components/ScopeDialog';
import { SearchBox } from './components/SearchBox';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { Sidebar } from './components/Sidebar';
import { TimeGridView } from './components/TimeGridView';
import { Toast, type ToastData } from './components/Toast';
import {
  addDays,
  addMinutes,
  addMonths,
  atMinutes,
  daysOf,
  differenceInCalendarDays,
  formatFullDate,
  formatMonthYear,
  formatRangeTitle,
  monthGridDays,
  parseLocal,
  startOfDay,
  startOfWeek,
  toDateKey,
} from './lib/dates';
import { createDemoData } from './lib/demo';
import { expandEvents, occurrenceKey, seriesStartOn } from './lib/recurrence';
import { searchEvents } from './lib/search';
import { DEFAULT_SETTINGS, loadState, saveState, type Settings } from './lib/storage';
import { calendarReducer, initState, newId } from './lib/store';
import type { CalendarCategory, EditScope, EventPatch, Occurrence, ViewMode } from './lib/types';

interface ScopeRequest {
  action: 'edit' | 'move' | 'delete';
  occ: Occurrence;
  patch?: EventPatch;
  label?: string;
  allowSingle: boolean;
}

const VIEWS: { id: ViewMode; label: string; key: string }[] = [
  { id: 'day', label: 'Day', key: 'D' },
  { id: 'week', label: 'Week', key: 'W' },
  { id: 'month', label: 'Month', key: 'M' },
];

export function App() {
  const [stored] = useState(loadState);
  const [state, dispatch] = useReducer(calendarReducer, undefined, () => initState(stored?.data ?? createDemoData()));
  const [settings, setSettings] = useState<Settings>(stored?.settings ?? DEFAULT_SETTINGS);
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [scopeRequest, setScopeRequest] = useState<ScopeRequest | null>(null);
  const [calendarDialog, setCalendarDialog] = useState<{ calendar?: CalendarCategory } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const pendingFocus = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();
  const compact = useMediaQuery('(max-width: 720px)');
  const wide = useMediaQuery('(min-width: 1024px)');

  const { events, calendars } = state.present;
  const view = settings.view;
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const hidden = settings.hiddenCalendars;

  // ---------- persistence ----------
  const saveWarned = useRef(false);
  useEffect(() => {
    const ok = saveState({ version: 1, data: state.present, settings });
    if (!ok && !saveWarned.current) {
      saveWarned.current = true;
      setToast({ id: Date.now(), message: 'Changes can’t be saved in this browser (storage unavailable).' });
    }
  }, [state.present, settings]);

  // ---------- visible range ----------
  const days = useMemo(() => {
    if (view === 'day') return [cursor];
    if (view === 'week') return daysOf(startOfWeek(cursor), 7);
    return monthGridDays(cursor);
  }, [view, cursor]);
  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  const occurrences = useMemo(
    () => expandEvents(events, rangeStart, rangeEnd).filter((o) => !hidden.includes(o.calendarId)),
    [events, rangeStart.getTime(), rangeEnd.getTime(), hidden], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const searchResults = useMemo(
    () => searchEvents(events, query, now).filter((o) => !hidden.includes(o.calendarId)),
    [events, query, hidden, now.getTime() >= 0 && Math.floor(now.getTime() / 3_600_000)], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const title =
    view === 'day' ? formatFullDate(cursor) : view === 'week' ? formatRangeTitle(days[0], days[6]) : formatMonthYear(cursor);

  const setView = useCallback((v: ViewMode) => setSettings((s) => ({ ...s, view: v })), []);

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setCursor((c) => (view === 'month' ? addMonths(c, dir) : addDays(c, view === 'week' ? 7 * dir : dir)));
    },
    [view],
  );

  const announce = (msg: string) => {
    // Clear first so repeating the same message is announced again.
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(msg), 30);
  };

  // Focus a specific event after the next render (keyboard edits, dialogs closing, search).
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const el = document.querySelector<HTMLElement>(`[data-occ-key="${CSS.escape(key)}"]`);
    if (el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: false });
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  });

  // Toast + screen-reader announcement for every change, with undo/redo.
  useEffect(() => {
    const c = state.lastChange;
    if (!c) return;
    const undo = { label: 'Undo', run: () => dispatch({ type: 'undo' }) };
    const redo = { label: 'Redo', run: () => dispatch({ type: 'redo' }) };
    const message = c.kind === 'do' ? c.label : `${c.kind === 'undo' ? 'Undone' : 'Redone'}: ${c.label.toLowerCase()}`;
    setToast({ id: c.seq, message, action: c.kind === 'undo' ? redo : undo });
    if (c.kind !== 'do') announce(message);
  }, [state.lastChange]);

  const ensureVisible = (date: Date) => {
    if (date < rangeStart || date >= rangeEnd) setCursor(startOfDay(date));
  };

  // ---------- event operations ----------
  const applyChange = (occ: Occurrence, patch: EventPatch, scope: EditScope, label: string) => {
    dispatch({ type: 'updateOccurrence', occ, patch, scope, label });
    let key = occ.key;
    const event = events.find((e) => e.id === occ.eventId);
    if (event?.recurrence && occ.occurrenceDate && scope === 'series') {
      if (patch.recurrence === null) key = occ.eventId;
      else if (patch.start) {
        const shift = differenceInCalendarDays(patch.start, seriesStartOn(event, occ.occurrenceDate));
        key = occurrenceKey(occ.eventId, shift ? toDateKey(addDays(seriesStartOn(event, occ.occurrenceDate), shift)) : occ.occurrenceDate);
      }
    } else if (!event?.recurrence && patch.recurrence) {
      key = occurrenceKey(occ.eventId, toDateKey(patch.start ?? occ.start));
    }
    pendingFocus.current = key;
    const start = patch.start ?? occ.start;
    const end = patch.end ?? addMinutes(start, (occ.end.getTime() - occ.start.getTime()) / 60_000);
    ensureVisible(start);
    announce(describeChange({ ...occ, title: patch.title ?? occ.title }, start, end));
  };

  const requestChange = useCallback(
    (occ: Occurrence, patch: EventPatch, label: string) => {
      if (occ.recurring) setScopeRequest({ action: 'move', occ, patch, label, allowSingle: true });
      else applyChange(occ, patch, 'single', label);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, rangeStart.getTime(), rangeEnd.getTime()],
  );

  const requestDelete = useCallback((occ: Occurrence) => {
    if (occ.recurring) setScopeRequest({ action: 'delete', occ, allowSingle: true });
    else {
      dispatch({ type: 'deleteOccurrence', occ, scope: 'series' });
      setEditor(null);
      announce(`${occ.title} deleted`);
    }
  }, []);

  const openEditor = useCallback(
    (occ: Occurrence) => {
      const event = events.find((e) => e.id === occ.eventId);
      if (event) setEditor({ kind: 'edit', occ, event });
    },
    [events],
  );

  const openCreate = useCallback((start: Date, end: Date, allDay: boolean) => setEditor({ kind: 'create', start, end, allDay }), []);

  const newEventNow = () => {
    // Next full hour today when today is on screen, otherwise 9:00 on the focused day.
    const todayVisible = rangeStart <= now && now < rangeEnd;
    const start = todayVisible ? atMinutes(now, (now.getHours() + 1) * 60) : atMinutes(cursor, 9 * 60);
    openCreate(start, addMinutes(start, 60), false);
  };

  const confirmScope = (scope: EditScope) => {
    const req = scopeRequest!;
    setScopeRequest(null);
    if (req.action === 'delete') {
      dispatch({ type: 'deleteOccurrence', occ: req.occ, scope });
      setEditor(null);
      announce(`${req.occ.title} deleted${scope === 'single' ? ' (this occurrence)' : ' (entire series)'}`);
      return;
    }
    setEditor(null);
    applyChange(req.occ, req.patch!, scope, req.label ?? 'Event updated');
  };

  const defaultCalendarId = calendars.find((c) => !hidden.includes(c.id))?.id ?? calendars[0].id;

  const toggleCalendar = (id: string) =>
    setSettings((s) => ({ ...s, hiddenCalendars: s.hiddenCalendars.includes(id) ? s.hiddenCalendars.filter((x) => x !== id) : [...s.hiddenCalendars, id] }));

  const pickDate = (d: Date) => {
    setCursor(startOfDay(d));
    if (!wide) setDrawerOpen(false);
  };

  const pickSearchResult = (occ: Occurrence) => {
    setCursor(startOfDay(occ.start));
    if (view === 'month' && compact) setView('week');
    pendingFocus.current = occ.key;
    setMobileSearch(false);
  };

  // ---------- keyboard shortcuts ----------
  const anyDialog = !!(editor || scopeRequest || calendarDialog || showShortcuts);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyDialog || e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const editable = isEditableTarget(e.target);
      if (mod && !e.altKey && e.key.toLowerCase() === 'z' && !editable) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !editable) {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (mod || e.altKey || editable) return;
      const onBody = e.target === document.body || (e.target as HTMLElement).classList?.contains('main');
      switch (e.key) {
        case 't':
        case 'T':
          setCursor(startOfDay(new Date()));
          break;
        case 'd':
          setView('day');
          break;
        case 'w':
          setView('week');
          break;
        case 'm':
          setView('month');
          break;
        case 'j':
          navigate(-1);
          break;
        case 'k':
          navigate(1);
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          if (!onBody) return;
          navigate(e.key === 'ArrowLeft' ? -1 : 1);
          break;
        case 'c':
          newEventNow();
          break;
        case '/':
          if (compact) setMobileSearch(true);
          else searchRef.current?.focus();
          break;
        case '?':
          setShowShortcuts(true);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Mobile drawer: move focus in, make the rest inert, and restore focus on close.
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);
  useEffect(() => {
    const modal = drawerOpen && !wide;
    const outside = [document.querySelector('.topbar'), document.querySelector('.main'), document.querySelector('.fab')];
    outside.forEach((el) => el && ((el as HTMLElement).inert = modal));
    if (modal) document.querySelector<HTMLElement>('.drawer-head .icon-btn')?.focus();
    else if (drawerWasOpen.current) menuButtonRef.current?.focus();
    drawerWasOpen.current = modal;
  }, [drawerOpen, wide]);

  // Horizontal swipe on touch devices moves between periods.
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - s.t < 600) navigate(dx < 0 ? 1 : -1);
  };

  const handlers = { onOpen: openEditor, onChange: requestChange, onDelete: requestDelete };
  const sidebarVisible = wide ? !sidebarCollapsed : drawerOpen;

  const viewSwitcher = (
    <div className="seg" role="group" aria-label="View">
      {VIEWS.map((v) => (
        <button key={v.id} type="button" className={`seg-btn${view === v.id ? ' is-active' : ''}`} aria-pressed={view === v.id} onClick={() => setView(v.id)} title={`${v.label} view (${v.key})`}>
          {v.label}
        </button>
      ))}
    </div>
  );

  const historyButtons = (
    <div className="history">
      <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'undo' })} disabled={!state.past.length} aria-label="Undo" title={`Undo (${modKey}+Z)`}>
        <Undo />
      </button>
      <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'redo' })} disabled={!state.future.length} aria-label="Redo" title={`Redo (${modKey}+Shift+Z)`}>
        <Redo />
      </button>
    </div>
  );

  const navButtons = (
    <div className="nav-arrows">
      <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label={`Previous ${view}`} title="Previous (J)">
        <ChevronLeft />
      </button>
      <button type="button" className="icon-btn" onClick={() => navigate(1)} aria-label={`Next ${view}`} title="Next (K)">
        <ChevronRight />
      </button>
    </div>
  );

  const todayButton = (
    <button type="button" className="btn btn-outline" onClick={() => setCursor(startOfDay(new Date()))} title="Today (T)">
      Today
    </button>
  );

  const searchBox = (
    <SearchBox
      ref={searchRef}
      query={query}
      results={searchResults}
      calendars={calendarMap}
      onQuery={setQuery}
      onPick={pickSearchResult}
      onDismiss={() => setMobileSearch(false)}
      autoFocus={compact && mobileSearch}
    />
  );

  return (
    <div className={`app${compact ? ' is-compact' : ''}${sidebarVisible ? ' has-sidebar' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to calendar
      </a>
      <header className="topbar">
        {compact ? (
          <>
            <div className="topbar-row">
              {mobileSearch ? (
                <>
                  {searchBox}
                  <button type="button" className="icon-btn" aria-label="Close search" onClick={() => setMobileSearch(false)}>
                    <Close />
                  </button>
                </>
              ) : (
                <>
                  <button ref={menuButtonRef} type="button" className="icon-btn" aria-label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
                    <Menu />
                  </button>
                  <h1 className="range-title">{view === 'day' ? days[0].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : formatMonthYearShort(view === 'month' ? cursor : days[3])}</h1>
                  <span className="spacer" />
                  <button type="button" className={`icon-btn${query ? ' has-dot' : ''}`} aria-label="Search events" onClick={() => setMobileSearch(true)}>
                    <Search />
                  </button>
                  {historyButtons}
                  {todayButton}
                </>
              )}
            </div>
            <div className="topbar-row topbar-sub">
              {navButtons}
              {viewSwitcher}
            </div>
          </>
        ) : (
          <div className="topbar-row">
            <button
              type="button"
              className="icon-btn"
              aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
              aria-expanded={sidebarVisible}
              onClick={() => (wide ? setSidebarCollapsed((c) => !c) : setDrawerOpen((o) => !o))}
            >
              <Menu />
            </button>
            <div className="brand" aria-hidden="true">
              <CalendarIcon size={22} />
              <span>Calendar</span>
            </div>
            {todayButton}
            {navButtons}
            <h1 className="range-title" aria-live="polite">
              {title}
            </h1>
            <span className="spacer" />
            {searchBox}
            {historyButtons}
            {viewSwitcher}
            <button type="button" className="btn btn-primary" onClick={newEventNow} title="Create event (C)">
              <Plus size={16} /> New event
            </button>
          </div>
        )}
      </header>

      <div className="layout">
        {!wide && drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
        <aside
          className={`sidebar${sidebarVisible ? ' is-open' : ''}${wide ? '' : ' is-drawer'}`}
          aria-label="Sidebar"
          hidden={!sidebarVisible}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !wide) {
              setDrawerOpen(false);
            }
          }}
        >
          {!wide && (
            <div className="drawer-head">
              <div className="brand">
                <CalendarIcon size={22} />
                <span>Calendar</span>
              </div>
              <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setDrawerOpen(false)} data-autofocus>
                <Close />
              </button>
            </div>
          )}
          <Sidebar
            cursor={cursor}
            view={view}
            now={now}
            calendars={calendars}
            hidden={hidden}
            onPickDate={pickDate}
            onToggleCalendar={toggleCalendar}
            onEditCalendar={(c) => setCalendarDialog({ calendar: c })}
            onAddCalendar={() => setCalendarDialog({})}
            onShowShortcuts={() => setShowShortcuts(true)}
            onResetDemo={() => {
              dispatch({ type: 'replaceAll', data: createDemoData(), label: 'Demo data restored' });
              setSettings((s) => ({ ...s, hiddenCalendars: [] }));
            }}
          />
        </aside>

        <main id="main" className="main" tabIndex={-1} aria-label={`${title}, ${view} view`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {view === 'month' ? (
            <MonthView
              days={days}
              month={cursor.getMonth()}
              occurrences={occurrences}
              calendars={calendarMap}
              now={now}
              query={query}
              compact={compact}
              onCreate={openCreate}
              onSelectDay={(d) => {
                setCursor(startOfDay(d));
                setView('day');
              }}
              {...handlers}
            />
          ) : (
            <TimeGridView
              key={view}
              days={days}
              occurrences={occurrences}
              calendars={calendarMap}
              now={now}
              query={query}
              compact={compact}
              onCreate={openCreate}
              onSelectDay={(d) => {
                setCursor(startOfDay(d));
                setView('day');
              }}
              {...handlers}
            />
          )}
        </main>
      </div>

      {compact && (
        <button type="button" className="fab" onClick={newEventNow} aria-label="New event">
          <Plus size={24} />
        </button>
      )}

      <p id="event-key-hint" className="sr-only">
        {EVENT_KEY_HINT}
      </p>
      <div className="sr-only" aria-live="polite" role="status">
        {announcement}
      </div>
      <Toast toast={toast} onDismiss={useCallback(() => setToast(null), [])} />

      {editor && (
        <EventEditor
          key={editor.kind === 'edit' ? editor.occ.key : 'new'}
          target={editor}
          calendars={calendars}
          defaultCalendarId={defaultCalendarId}
          onClose={() => setEditor(null)}
          onCreate={(event) => {
            dispatch({ type: 'createEvent', event });
            setEditor(null);
            const start = parseLocal(event.start);
            pendingFocus.current = event.recurrence ? occurrenceKey(event.id, event.start.slice(0, 10)) : event.id;
            ensureVisible(start);
            announce(`${event.title} created`);
          }}
          onUpdate={(occ, patch) => {
            if (occ.recurring) setScopeRequest({ action: 'edit', occ, patch, label: 'Event updated', allowSingle: patch.recurrence === undefined });
            else {
              setEditor(null);
              applyChange(occ, patch, 'single', 'Event updated');
            }
          }}
          onDelete={requestDelete}
        />
      )}
      {scopeRequest && (
        <ScopeDialog
          action={scopeRequest.action}
          occ={scopeRequest.occ}
          allowSingle={scopeRequest.allowSingle}
          onConfirm={confirmScope}
          onClose={() => {
            if (scopeRequest.action === 'move') pendingFocus.current = scopeRequest.occ.key;
            setScopeRequest(null);
          }}
        />
      )}
      {calendarDialog && (
        <CalendarDialog
          calendar={calendarDialog.calendar}
          canDelete={calendars.length > 1}
          onClose={() => setCalendarDialog(null)}
          onSave={({ name, color }) => {
            if (calendarDialog.calendar) dispatch({ type: 'updateCalendar', id: calendarDialog.calendar.id, changes: { name, color } });
            else dispatch({ type: 'addCalendar', calendar: { id: newId('cal'), name, color } });
            setCalendarDialog(null);
          }}
          onDelete={() => {
            dispatch({ type: 'deleteCalendar', id: calendarDialog.calendar!.id });
            setCalendarDialog(null);
          }}
        />
      )}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

const formatMonthYearShort = (d: Date) => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
