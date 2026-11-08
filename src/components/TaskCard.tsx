import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useOpenContextMenu } from '../board/contextMenu';
import { formatClock, formatDue, formatDuration, isOverdue } from '../board/dates';
import { dotColor, useLabels } from '../board/labels';
import { useNow, useTimerApi } from '../board/timerContext';
import type { Card } from '../board/types';
import {
  CalendarIcon,
  CheckDot,
  ChecklistIcon,
  ClockIcon,
  NotesIcon,
  PinIcon,
  PlayIcon,
  StopIcon,
} from './Icons';

function RunningClock({ startedAt }: { startedAt: number }) {
  const now = useNow(1000);
  return (
    <span className="meta meta--running">
      <i />
      {formatClock((now - startedAt) / 1000)}
    </span>
  );
}

export const CardFace = memo(function CardFace({ card, isDone }: { card: Card; isDone: boolean }) {
  const { tracked, runningCardId, startedAt, start, stop } = useTimerApi();
  const labels = useLabels().filter((label) => card.labelIds.includes(label.id));
  const doneItems = card.checklist.filter((item) => item.done).length;
  const late = card.due !== null && !isDone && isOverdue(card.due);
  const running = runningCardId === card.id;
  const seconds = tracked.get(card.id) ?? 0;
  const hasMeta =
    card.due !== null ||
    card.checklist.length > 0 ||
    card.description !== '' ||
    seconds > 0 ||
    running ||
    card.pinned;

  const control = (!isDone || running) && (
    <button
      type="button"
      tabIndex={-1}
      className={running ? 'card-play is-running' : 'card-play'}
      aria-label={running ? 'Stop timer' : 'Start timer'}
      title={running ? 'Stop timer' : 'Start timer'}
      onClick={(event) => {
        event.stopPropagation();
        if (running) stop();
        else start(card.id);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {running ? <StopIcon size={12} /> : <PlayIcon size={12} />}
    </button>
  );

  return (
    <>
      {labels.length > 0 && (
        <div className="card-labels">
          {labels.map((label) => (
            <span key={label.id} className="card-label">
              <i style={{ background: dotColor(label.color) }} />
              {label.name}
            </span>
          ))}
        </div>
      )}
      <h3 className="card-title">
        {isDone && <CheckDot />}
        <span>{card.title}</span>
        {!hasMeta && control}
      </h3>
      {hasMeta && (
        <div className="card-meta">
          {running && startedAt !== null && <RunningClock startedAt={startedAt} />}
          {card.due && (
            <span className={late ? 'meta meta--late' : 'meta'}>
              <CalendarIcon size={14} />
              {formatDue(card.due)}
            </span>
          )}
          {!running && seconds > 0 && (
            <span className="meta" title="Time tracked">
              <ClockIcon size={14} />
              {formatDuration(seconds)}
            </span>
          )}
          {card.checklist.length > 0 && (
            <span className="meta">
              <ChecklistIcon size={14} />
              {doneItems}/{card.checklist.length}
            </span>
          )}
          {card.description && (
            <span className="meta" title="Has notes">
              <NotesIcon size={14} />
            </span>
          )}
          {card.pinned && (
            <span className="meta" title="Pinned countdown">
              <PinIcon size={14} />
            </span>
          )}
          {control}
        </div>
      )}
    </>
  );
});

type SortableCardProps = {
  card: Card;
  isDone: boolean;
  onOpen: (id: string) => void;
};

export function SortableCard({ card, isDone, onOpen }: SortableCardProps) {
  const openContextMenu = useOpenContextMenu();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card' },
  });

  return (
    <article
      ref={setNodeRef}
      className={isDragging ? 'card is-placeholder' : 'card'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-label={card.title}
      onContextMenu={(event) => openContextMenu(event, { kind: 'card', id: card.id })}
      onClick={() => onOpen(card.id)}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        if (event.key === 'Enter' && !isDragging) onOpen(card.id);
      }}
    >
      <CardFace card={card} isDone={isDone} />
    </article>
  );
}
