import { useMemo, useState } from 'react';
import { formatDuration, isOverdue, toDateKey } from '../board/dates';
import { isCardDone, type Board, type Card } from '../board/types';
import { ChevronRightIcon } from './Icons';

const MAX_CHIPS = 3;

const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
// 2024-01-01 was a Monday.
const weekdays = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)),
);

type Due = { board: Board; card: Card; done: boolean };

type CalendarProps = {
  boards: Board[];
  /** Seconds tracked per day, keyed YYYY-MM-DD. */
  totals: Map<string, number>;
  selected: string;
  onSelect: (key: string) => void;
  onOpenCard: (id: string) => void;
};

export function Calendar({ boards, totals, selected, onSelect, onOpenCard }: CalendarProps) {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const todayKey = toDateKey(new Date());

  const dueByDay = useMemo(() => {
    const map = new Map<string, Due[]>();
    for (const board of boards) {
      for (const card of Object.values(board.cards)) {
        if (!card.due) continue;
        const list = map.get(card.due) ?? [];
        list.push({ board, card, done: isCardDone(board, card.id) });
        map.set(card.due, list);
      }
    }
    for (const list of map.values()) list.sort((a, b) => Number(a.done) - Number(b.done));
    return map;
  }, [boards]);

  // Six rows of Monday-first weeks, so the grid never changes height between months.
  const cells = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(month.getFullYear(), month.getMonth(), 1 - offset + i);
      return { date, key: toDateKey(date), inMonth: date.getMonth() === month.getMonth() };
    });
  }, [month]);

  const shift = (by: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
  const onThisMonth =
    month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  return (
    <div className="cal">
      <div className="cal-nav">
        <h3>{monthLabel.format(month)}</h3>
        {!onThisMonth && (
          <button
            type="button"
            className="chip chip--well"
            onClick={() => {
              const today = new Date();
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              onSelect(todayKey);
            }}
          >
            Today
          </button>
        )}
        <button
          type="button"
          className="icon-btn icon-btn--soft cal-prev"
          aria-label="Previous month"
          onClick={() => shift(-1)}
        >
          <ChevronRightIcon size={14} />
        </button>
        <button type="button" className="icon-btn icon-btn--soft" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRightIcon size={14} />
        </button>
      </div>

      <div className="cal-grid" role="grid" aria-label={monthLabel.format(month)}>
        {weekdays.map((name) => (
          <div key={name} className="cal-weekday" role="columnheader">
            {name}
          </div>
        ))}
        {cells.map(({ date, key, inMonth }) => {
          const due = dueByDay.get(key) ?? [];
          const seconds = totals.get(key) ?? 0;
          const label = [
            dayLabel.format(date),
            seconds > 0 ? `${formatDuration(seconds)} tracked` : '',
            due.length > 0 ? `${due.length} due` : '',
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <div
              key={key}
              role="gridcell"
              className={[
                'cal-day',
                inMonth ? '' : 'is-outside',
                key === todayKey ? 'is-today' : '',
                key === selected ? 'is-selected' : '',
              ].join(' ')}
            >
              <button
                type="button"
                className="cal-day-hit"
                aria-label={label}
                aria-pressed={key === selected}
                onClick={() => onSelect(key)}
              />
              <div className="cal-day-top">
                <span className="cal-date">{date.getDate()}</span>
                {seconds > 0 && <span className="cal-time">{formatDuration(seconds)}</span>}
              </div>
              <div className="cal-chips">
                {due.slice(0, MAX_CHIPS).map(({ board, card, done }) => (
                  <button
                    key={card.id}
                    type="button"
                    data-accent={board.color}
                    className={[
                      'cal-chip',
                      done ? 'is-done' : '',
                      !done && isOverdue(card.due!) ? 'is-late' : '',
                    ].join(' ')}
                    title={`${card.title} · ${board.title}`}
                    onClick={() => onOpenCard(card.id)}
                  >
                    {card.title}
                  </button>
                ))}
                {due.length > MAX_CHIPS && <span className="cal-more">+{due.length - MAX_CHIPS} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
