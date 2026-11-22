import { forwardRef, useEffect, useId, useState } from 'react';
import { formatShortDate, formatTime } from '../lib/dates';
import type { CalendarCategory, Occurrence } from '../lib/types';
import { Close, Repeat, Search } from './icons';

interface Props {
  query: string;
  results: Occurrence[];
  calendars: Map<string, CalendarCategory>;
  onQuery: (q: string) => void;
  onPick: (occ: Occurrence) => void;
  onDismiss?: () => void;
  autoFocus?: boolean;
}

/** Search field implemented as an ARIA combobox with a results listbox. */
export const SearchBox = forwardRef<HTMLInputElement, Props>(function SearchBox({ query, results, calendars, onQuery, onPick, onDismiss, autoFocus }, ref) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const showList = open && query.trim().length > 0;

  useEffect(() => setActive(0), [query]);

  const pick = (occ: Occurrence | undefined) => {
    if (!occ) return;
    setOpen(false);
    onPick(occ);
  };

  return (
    <div className="search" role="search">
      <Search size={16} className="search-icon" />
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-label="Search events"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        placeholder="Search events"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (showList) setOpen(false);
            else if (query) onQuery('');
            else {
              (e.target as HTMLInputElement).blur();
              onDismiss?.();
            }
          }
        }}
      />
      {query && (
        <button
          type="button"
          className="icon-btn sm search-clear"
          aria-label="Clear search"
          onClick={() => {
            onQuery('');
            onDismiss?.();
          }}
        >
          <Close size={14} />
        </button>
      )}
      {showList && (
        <ul className="search-results" role="listbox" id={listId} aria-label="Search results">
          {results.length === 0 && (
            <li className="search-empty" role="presentation">
              No events match “{query}”
            </li>
          )}
          {results.map((occ, i) => {
            const cal = calendars.get(occ.calendarId);
            return (
              <li
                key={occ.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search-result${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(occ)}
              >
                <span className="cal-dot" style={{ background: cal?.color }} aria-hidden="true" />
                <span className="sr-main">
                  <span className="sr-title">
                    {occ.title}
                    {occ.recurring && <Repeat size={12} aria-label="Repeats weekly" />}
                  </span>
                  <span className="sr-meta">
                    {formatShortDate(occ.start)} · {occ.allDay ? 'All day' : formatTime(occ.start)}
                    {occ.location ? ` · ${occ.location}` : ''}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
