import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { dateFromKey, dateKeyFromToday, toDateKey } from '../board/dates';
import { CalendarIcon, ChevronRightIcon } from './Icons';
import { useClickAway } from './useClickAway';

type DatePickerProps = {
  id?: string;
  value: string | null;
  onChange: (key: string) => void;
};

const DAYS_SHOWN = 42;
const dateText = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const monthText = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekdayText = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const weekdayName = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

/** 0 is Sunday. Follows the person's region where the browser can tell us. */
function firstWeekday() {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    return ((locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 7) % 7;
  } catch {
    return 0;
  }
}

const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function stepKey(key: string, days: number) {
  const date = dateFromKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** A browser's own calendar can't be styled, so this one is drawn by the app. */
export function DatePicker({ id, value, onChange }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [focusKey, setFocusKey] = useState(value ?? dateKeyFromToday(0));
  const [movingFocus, setMovingFocus] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  useClickAway(open, root, close);

  useEffect(() => {
    if (open && movingFocus) {
      grid.current?.querySelector<HTMLElement>(`[data-date="${focusKey}"]`)?.focus({ preventScroll: true });
      setMovingFocus(false);
    }
  }, [open, movingFocus, focusKey]);

  const today = dateKeyFromToday(0);
  const weekStart = firstWeekday();
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const cells = Array.from(
    { length: DAYS_SHOWN },
    (_, index) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + index),
  );
  const weekdays = cells.slice(0, 7);

  const showOpen = () => {
    const key = value ?? today;
    setMonth(dateFromKey(key));
    setFocusKey(key);
    setMovingFocus(true);
    setOpen(true);
  };

  const pick = (key: string) => {
    close();
    trigger.current?.focus();
    onChange(key);
  };

  const shiftMonth = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  const onGridKeyDown = (event: KeyboardEvent) => {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next = stepKey(focusKey, step);
    setFocusKey(next);
    setMonth(dateFromKey(next));
    setMovingFocus(true);
  };

  const onBlur = (event: FocusEvent) => {
    if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) close();
  };

  return (
    <div className="date-wrap" ref={root} onBlur={onBlur}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="date-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : showOpen())}
      >
        <CalendarIcon size={14} />
        {value ? dateText.format(dateFromKey(value)) : 'Set a date'}
      </button>
      {open && (
        <div
          className="date-pop"
          role="dialog"
          aria-label="Choose a date"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              // Only the calendar closes, not the card behind it.
              event.preventDefault();
              event.stopPropagation();
              close();
              trigger.current?.focus();
            }
          }}
        >
          <div className="date-head">
            <strong aria-live="polite">{monthText.format(first)}</strong>
            <button
              type="button"
              className="icon-btn date-prev"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronRightIcon size={14} />
            </button>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <ChevronRightIcon size={14} />
            </button>
          </div>
          <div className="date-grid" aria-hidden="true">
            {weekdays.map((day) => (
              <span key={day.getDay()} className="date-weekday">
                {weekdayText.format(day)}
              </span>
            ))}
          </div>
          <div className="date-grid" ref={grid} onKeyDown={onGridKeyDown}>
            {cells.map((day) => {
              const key = toDateKey(day);
              return (
                <button
                  key={key}
                  type="button"
                  data-date={key}
                  tabIndex={key === focusKey ? 0 : -1}
                  aria-label={`${weekdayName.format(day)}, ${dateText.format(day)}`}
                  aria-pressed={key === value}
                  className={[
                    'date-day',
                    day.getMonth() !== first.getMonth() && 'is-outside',
                    key === today && 'is-today',
                    key === value && 'is-on',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pick(key)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-foot">
            <button type="button" className="btn btn--plain btn--small" onClick={() => pick(today)}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
