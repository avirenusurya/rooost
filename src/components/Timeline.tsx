import { useLayoutEffect, useMemo, useRef } from 'react';
import { dateFromKey, formatDue, formatDuration, isOverdue, toDateKey } from '../board/dates';
import { isCardDone, type Board, type Card, type Session } from '../board/types';

const DAY_MS = 86400000;
const PAST_DAYS = 7;
const MIN_AHEAD = 28;
const MAX_AHEAD = 120;

const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const weekdayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

type Bar = { card: Card; start: number; end: number; seconds: number; late: boolean; clipped: boolean };
type Lane = { board: Board; rows: Bar[][] };

function dayIndex(date: Date, origin: Date) {
  return Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - origin.getTime()) / DAY_MS);
}

type TimelineProps = {
  boards: Board[];
  sessions: Session[];
  onOpenCard: (id: string) => void;
};

/**
 * One lane per board. A card runs from the first time you tracked it
 * (or today, if you haven't started) to its due date.
 */
export function Timeline({ boards, sessions, onOpenCard }: TimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const todayKey = toDateKey(new Date());

  const { days, months, lanes, todayIndex } = useMemo(() => {
    const today = dateFromKey(todayKey);
    const origin = new Date(today.getFullYear(), today.getMonth(), today.getDate() - PAST_DAYS);

    const firstTracked = new Map<string, number>();
    const trackedSeconds = new Map<string, number>();
    for (const session of sessions) {
      firstTracked.set(session.cardId, Math.min(firstTracked.get(session.cardId) ?? Infinity, session.startedAt));
      trackedSeconds.set(session.cardId, (trackedSeconds.get(session.cardId) ?? 0) + session.seconds);
    }

    const todayAt = PAST_DAYS;
    let lastDay = todayAt + MIN_AHEAD;
    const built: Lane[] = [];

    for (const board of boards) {
      const bars: Bar[] = [];
      for (const card of Object.values(board.cards)) {
        if (!card.due || isCardDone(board, card.id)) continue;
        const end = dayIndex(dateFromKey(card.due), origin);
        const tracked = firstTracked.get(card.id);
        const start = Math.min(end, tracked !== undefined ? dayIndex(new Date(tracked), origin) : todayAt);
        if (end < 0) continue;
        bars.push({
          card,
          start: Math.max(0, start),
          end: Math.min(end, todayAt + MAX_AHEAD),
          seconds: trackedSeconds.get(card.id) ?? 0,
          late: isOverdue(card.due),
          clipped: start < 0,
        });
        lastDay = Math.max(lastDay, Math.min(end, todayAt + MAX_AHEAD) + 2);
      }
      if (bars.length === 0) continue;

      // Pack bars into as few rows as possible without overlapping.
      bars.sort((a, b) => a.start - b.start || a.end - b.end);
      const rows: Bar[][] = [];
      for (const bar of bars) {
        const row = rows.find((r) => r[r.length - 1].end < bar.start);
        if (row) row.push(bar);
        else rows.push([bar]);
      }
      built.push({ board, rows });
    }

    const dayList: { date: Date; weekend: boolean }[] = [];
    const monthList: { label: string; start: number; span: number }[] = [];
    for (let i = 0; i <= lastDay; i += 1) {
      const date = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + i);
      dayList.push({ date, weekend: date.getDay() === 0 || date.getDay() === 6 });
      const current = monthList[monthList.length - 1];
      if (!current || date.getDate() === 1) monthList.push({ label: monthLabel.format(date), start: i, span: 1 });
      else current.span += 1;
    }

    return { days: dayList, months: monthList, lanes: built, todayIndex: todayAt };
  }, [boards, sessions, todayKey]);

  // Open with a couple of past days visible, so today sits near the left edge.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const cell = node.querySelector<HTMLElement>('.tl-day');
    if (cell) node.scrollLeft = cell.offsetWidth * (todayIndex - 2);
  }, [todayIndex, lanes.length > 0]);

  if (lanes.length === 0) {
    return <p className="panel-empty">Nothing scheduled. Give a card a due date and it shows up here.</p>;
  }

  const columns = `repeat(${days.length}, var(--tl-day))`;

  return (
    <div className="tl" ref={scroller}>
      <div className="tl-head">
        <div className="tl-corner" />
        <div className="tl-track" style={{ gridTemplateColumns: columns }}>
          {months.map((month) => (
            <div
              key={month.start}
              className="tl-month"
              style={{ gridRow: 1, gridColumn: `${month.start + 1} / span ${month.span}` }}
            >
              <span>{month.label}</span>
            </div>
          ))}
          {days.map(({ date, weekend }, i) => (
            <div
              key={i}
              className={['tl-day', weekend ? 'is-weekend' : '', i === todayIndex ? 'is-today' : ''].join(' ')}
              style={{ gridRow: 2, gridColumn: i + 1 }}
            >
              <small>{weekdayLabel.format(date)}</small>
              {date.getDate()}
            </div>
          ))}
        </div>
      </div>

      {lanes.map(({ board, rows }) => {
        const allRows = `1 / span ${rows.length}`;
        return (
          <div key={board.id} className="tl-lane" data-accent={board.color}>
            <div className="tl-lane-name">
              <i />
              <span>{board.title}</span>
            </div>
            <div
              className="tl-track"
              style={{ gridTemplateColumns: columns, gridTemplateRows: `repeat(${rows.length}, var(--tl-row))` }}
            >
              {days.map(({ weekend }, i) => (
                <div
                  key={i}
                  className={weekend ? 'tl-cell is-weekend' : 'tl-cell'}
                  style={{ gridRow: allRows, gridColumn: i + 1 }}
                />
              ))}
              <div className="tl-now" aria-hidden="true" style={{ gridRow: allRows, gridColumn: todayIndex + 1 }} />
              {rows.flatMap((row, r) =>
                row.map((bar) => {
                  const label = `${bar.card.title}, due ${formatDue(bar.card.due!)}${
                    bar.seconds > 0 ? `, ${formatDuration(bar.seconds)} tracked` : ''
                  }`;
                  const roomy = bar.end - Math.max(bar.start, todayIndex - 2) >= 8;
                  return (
                    <button
                      key={bar.card.id}
                      type="button"
                      className={['tl-bar', bar.late ? 'is-late' : '', bar.clipped ? 'is-clipped' : ''].join(' ')}
                      style={{ gridRow: r + 1, gridColumn: `${bar.start + 1} / ${bar.end + 2}` }}
                      title={label}
                      aria-label={label}
                      onClick={() => onOpenCard(bar.card.id)}
                    >
                      <span className="tl-bar-title">{bar.card.title}</span>
                      {bar.seconds > 0 && roomy && <span className="tl-bar-meta">{formatDuration(bar.seconds)}</span>}
                    </button>
                  );
                }),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
