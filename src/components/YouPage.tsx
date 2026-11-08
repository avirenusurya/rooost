import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  dateFromKey,
  daysUntil,
  formatCountdown,
  formatDue,
  formatDuration,
  isOverdue,
  toDateKey,
} from '../board/dates';
import {
  currentStreak,
  mondayOf,
  secondsByDay,
  secondsByLabel,
  sessionsOnDay,
  sumBetween,
  RUNNING_SESSION_ID,
  withRunningTimer,
} from '../board/stats';
import { dotColor } from '../board/labels';
import { useTimerApi } from '../board/timerContext';
import { activePins, findCard, isCardDone, type Card, type Workspace } from '../board/types';
import { ChevronRightIcon, CloseIcon, PinIcon, PlayIcon, StopIcon } from './Icons';
import { Heatmap } from './Heatmap';

const fullDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

type YouPageProps = {
  workspace: Workspace;
  now: number;
  onOpenCard: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

/** Past three the pills get smaller, and any that don't fit slide along one row. */
function PinRow({ cards, onOpenCard }: { cards: Card[]; onOpenCard: (id: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const node = row.current;
    if (!node) return;
    const left = node.scrollLeft > 1;
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
    setMore((current) => (current.left === left && current.right === right ? current : { left, right }));
  }, []);

  useLayoutEffect(() => {
    measure();
    const node = row.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure, cards.length]);

  const slide = (direction: number) =>
    row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className={cards.length > 3 ? 'pins-wrap pins-wrap--many' : 'pins-wrap'}>
      {more.left && (
        <button
          type="button"
          className="icon-btn icon-btn--soft pins-arrow pins-arrow--back"
          aria-label="Earlier pinned deadlines"
          onClick={() => slide(-1)}
        >
          <ChevronRightIcon size={14} />
        </button>
      )}
      <div className="pins" ref={row} onScroll={measure}>
        {cards.map((card) => (
          <button key={card.id} type="button" className="pin-pill" onClick={() => onOpenCard(card.id)}>
            <span className="pin-pill-title">{card.title}</span>
            <span className="pin-pill-count">{formatCountdown(card.due!)}</span>
          </button>
        ))}
      </div>
      {more.right && (
        <button
          type="button"
          className="icon-btn icon-btn--soft pins-arrow"
          aria-label="Later pinned deadlines"
          onClick={() => slide(1)}
        >
          <ChevronRightIcon size={14} />
        </button>
      )}
    </div>
  );
}

export function YouPage({ workspace, now, onOpenCard, onTogglePin, onDeleteSession }: YouPageProps) {
  const { tracked, runningCardId, start, stop, discard } = useTimerApi();
  const [boardFilter, setBoardFilter] = useState('all');
  const [selectedDay, setSelectedDay] = useState(() => toDateKey(new Date()));

  const sessions = useMemo(
    () => withRunningTimer(workspace.sessions, workspace.timer, now),
    [workspace.sessions, workspace.timer, now],
  );

  const overall = useMemo(() => secondsByDay(sessions), [sessions]);

  // A board that was deleted or filtered away shouldn't leave a stale filter behind.
  const filter = workspace.boards.some((board) => board.id === boardFilter) ? boardFilter : 'all';
  const filtered = useMemo(
    () => (filter === 'all' ? sessions : sessions.filter((session) => session.boardId === filter)),
    [sessions, filter],
  );
  const heat = useMemo(() => (filter === 'all' ? overall : secondsByDay(filtered)), [filter, overall, filtered]);

  const allTimeSeconds = filtered.reduce((sum, session) => sum + session.seconds, 0);
  const tagTotals = useMemo(() => {
    const totals = secondsByLabel(
      filtered,
      (session) => findCard(workspace, session.cardId)?.card.labelIds ?? session.labelIds ?? [],
    );
    return workspace.labels
      .map((label) => ({ label, seconds: totals.get(label.id) ?? 0 }))
      .filter((item) => item.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  }, [filtered, workspace]);

  const today = new Date(now);
  const todaySeconds = overall.get(toDateKey(today)) ?? 0;
  const streak = currentStreak(overall, today);
  const weekSeconds = sumBetween(overall, mondayOf(today), today);
  const yearStart = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1);
  const yearSeconds = sumBetween(overall, yearStart, today);

  const pins = activePins(workspace).sort((a, b) => a.card.due!.localeCompare(b.card.due!));

  const deadlines = workspace.boards
    .flatMap((board) =>
      Object.values(board.cards)
        .filter((card) => card.due !== null && !isCardDone(board, card.id))
        .map((card) => ({ board, card })),
    )
    .sort((a, b) => a.card.due!.localeCompare(b.card.due!));

  const dayEntries = sessionsOnDay(filtered, selectedDay);
  const dayTotal = dayEntries.reduce((sum, entry) => sum + entry.seconds, 0);

  const boardNameOf = (boardId: string, fallback: string) =>
    workspace.boards.find((board) => board.id === boardId)?.title ?? fallback;

  return (
    <div className="you">
      <header className="head">
        <div className="head-title">
          <h1 className="you-title">{formatDuration(todaySeconds)} today</h1>
          <p className="head-sub">
            {streak}-day streak. {formatDuration(weekSeconds)} this week. {formatDuration(yearSeconds)} this
            year.
          </p>
        </div>
        {pins.length > 0 && <PinRow cards={pins.map(({ card }) => card)} onOpenCard={onOpenCard} />}
      </header>

      <div className="you-body">
        <section
          className="panel panel--heat"
          aria-label="Activity"
          data-accent={workspace.boards.find((board) => board.id === filter)?.color}
        >
          <div className="panel-head">
            <h2>Last 12 months</h2>
            {workspace.boards.length > 1 && (
              <div className="panel-filters" role="group" aria-label="Filter by board">
                {[{ id: 'all', title: 'All boards' }, ...workspace.boards].map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    className={filter === board.id ? 'chip chip--well is-on' : 'chip chip--well'}
                    aria-pressed={filter === board.id}
                    onClick={() => setBoardFilter(board.id)}
                  >
                    {board.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Heatmap totals={heat} selected={selectedDay} onSelect={setSelectedDay} />
          <div className="heat-foot">
            {allTimeSeconds > 0 && (
              <div className="heat-totals">
                <span>
                  <b>{formatDuration(allTimeSeconds)}</b> all time
                </span>
                {tagTotals.map(({ label, seconds }) => (
                  <span key={label.id} className="heat-tag">
                    <i style={{ background: dotColor(label.color) }} />
                    {label.name} <b>{formatDuration(seconds)}</b>
                  </span>
                ))}
              </div>
            )}
            <div className="heat-legend" aria-hidden="true">
              <span>Under 1h</span>
              <i className="hm hm--1" />
              <i className="hm hm--2" />
              <i className="hm hm--3" />
              <i className="hm hm--4" />
              <span>4h or more</span>
            </div>
          </div>
        </section>

        <div className="you-lower">
          <section className="panel panel--coming" aria-label="Coming up">
            <div className="panel-head">
              <h2>Coming up</h2>
              {deadlines.length > 0 && <span className="panel-count">{deadlines.length}</span>}
            </div>
            {deadlines.length === 0 ? (
              <p className="panel-empty">No deadlines yet. Give a card a date and it shows up here.</p>
            ) : (
              <ul className="rows">
                {deadlines.map(({ board, card }) => {
                  const late = isOverdue(card.due!);
                  const soon = !late && daysUntil(card.due!) <= 1;
                  const running = runningCardId === card.id;
                  const seconds = tracked.get(card.id) ?? 0;
                  return (
                    <li key={card.id} className="row">
                      <button
                        type="button"
                        className={card.pinned ? 'row-pin is-on' : 'row-pin'}
                        aria-pressed={card.pinned}
                        aria-label={card.pinned ? `Unpin ${card.title}` : `Pin ${card.title}`}
                        title={card.pinned ? 'Unpin countdown' : 'Pin countdown'}
                        onClick={() => onTogglePin(card.id)}
                      >
                        <PinIcon size={15} />
                      </button>
                      <button type="button" className="row-main" onClick={() => onOpenCard(card.id)}>
                        <span className="row-title">{card.title}</span>
                        <span className="row-sub">
                          {board.title}
                          {seconds > 0 && ` · ${formatDuration(seconds)}`}
                        </span>
                      </button>
                      <span
                        className={['row-due', late ? 'is-late' : '', soon ? 'is-soon' : ''].join(' ')}
                      >
                        {formatDue(card.due!)}
                      </span>
                      <button
                        type="button"
                        className={running ? 'row-play is-running' : 'row-play'}
                        aria-label={running ? `Stop timer on ${card.title}` : `Start timer on ${card.title}`}
                        onClick={() => (running ? stop() : start(card.id))}
                      >
                        {running ? <StopIcon size={12} /> : <PlayIcon size={12} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel panel--day" aria-label="Selected day">
            <div className="panel-head">
              <h2>{fullDay.format(dateFromKey(selectedDay))}</h2>
              {dayTotal > 0 && <span className="panel-count">{formatDuration(dayTotal)}</span>}
            </div>
            {dayEntries.length === 0 ? (
              <p className="panel-empty">Nothing tracked on this day.</p>
            ) : (
              <ul className="rows">
                {dayEntries.map(({ session, seconds }) => (
                  <li key={session.id} className="row row--static">
                    <div className="row-main">
                      <span className="row-title">{session.cardTitle}</span>
                      <span className="row-sub">{boardNameOf(session.boardId, session.boardTitle)}</span>
                    </div>
                    <span className="row-due">{formatDuration(seconds)}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={
                        session.id === RUNNING_SESSION_ID
                          ? `Discard running timer for ${session.cardTitle}`
                          : `Delete time log for ${session.cardTitle}`
                      }
                      onClick={() =>
                        session.id === RUNNING_SESSION_ID ? discard() : onDeleteSession(session.id)
                      }
                    >
                      <CloseIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
