import { useLayoutEffect, useRef, useState } from 'react';
import { formatClock, formatDuration } from '../board/dates';
import { dotColor, useLabels } from '../board/labels';
import { useNow, useTimerApi } from '../board/timerContext';
import { isCardDone, uid, type Board, type Card, type ChecklistItem } from '../board/types';
import { DatePicker } from './DatePicker';
import { CloseIcon, PinIcon, PlayIcon, StopIcon, TrashIcon } from './Icons';
import { PillSelect } from './PillSelect';

type CardSheetProps = {
  card: Card;
  board: Board;
  boards: Board[];
  onMoveToBoard: (boardId: string) => void;
  onDuplicate: () => void;
  onChange: (patch: Partial<Omit<Card, 'id'>>) => void;
  onMove: (columnId: string) => void;
  onTogglePin: () => void;
  onEditTags: () => void;
  onDelete: () => void;
  onClose: () => void;
};

function LiveClock({ startedAt }: { startedAt: number }) {
  const now = useNow(1000);
  return <span className="sheet-clock">{formatClock((now - startedAt) / 1000)}</span>;
}

export function CardSheet({
  card,
  board,
  boards,
  onMoveToBoard,
  onDuplicate,
  onChange,
  onMove,
  onTogglePin,
  onEditTags,
  onDelete,
  onClose,
}: CardSheetProps) {
  const labels = useLabels();
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(card.title);
  const [newItem, setNewItem] = useState('');
  const { tracked, runningCardId, startedAt, start, stop, discard } = useTimerApi();

  useLayoutEffect(() => {
    const node = dialog.current;
    if (node && !node.open) {
      node.showModal();
      node.focus();
    }
    return () => node?.close();
  }, []);

  const column = board.columns.find((item) => item.cardIds.includes(card.id));
  const doneCount = card.checklist.filter((item) => item.done).length;
  const running = runningCardId === card.id;
  const seconds = tracked.get(card.id) ?? 0;
  const done = isCardDone(board, card.id);
  const boardChoices = boards.filter((item) => item.id === board.id || item.columns.length > 0);

  const setChecklist = (checklist: ChecklistItem[]) => onChange({ checklist });
  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setChecklist([...card.checklist, { id: uid(), text, done: false }]);
    setNewItem('');
  };

  const toggleIn = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <dialog
      ref={dialog}
      className="sheet"
      tabIndex={-1}
      aria-label={`Edit ${card.title}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-top">
          <div className="sheet-places">
            {boardChoices.length > 1 && (
              <PillSelect
                label="Board"
                value={board.id}
                options={boardChoices.map((item) => ({ value: item.id, label: item.title }))}
                onChange={onMoveToBoard}
              />
            )}
            <PillSelect
              label="Column"
              value={column?.id ?? ''}
              options={board.columns.map((item) => ({ value: item.id, label: item.title }))}
              onChange={onMove}
            />
          </div>
          <button type="button" className="icon-btn icon-btn--soft" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <textarea
          className="sheet-title"
          aria-label="Title"
          rows={2}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (event.target.value.trim()) onChange({ title: event.target.value.trim() });
          }}
          onBlur={() => setTitle(card.title)}
        />

        {(!done || running || seconds > 0) && (
          <div className="sheet-timer">
            {running && startedAt !== null ? (
              <>
                <button type="button" className="btn btn--dark sheet-timer-btn" onClick={stop}>
                  <StopIcon size={12} />
                  Stop
                </button>
                <LiveClock startedAt={startedAt} />
                <button
                  type="button"
                  className="btn btn--plain btn--small"
                  onClick={() => {
                    discard();
                    onClose();
                  }}
                >
                  Discard
                </button>
              </>
            ) : (
              !done && (
                <button
                  type="button"
                  className="btn btn--dark sheet-timer-btn"
                  onClick={() => start(card.id)}
                >
                  <PlayIcon size={12} />
                  Start timer
                </button>
              )
            )}
            {seconds > 0 && <span className="sheet-tracked">{formatDuration(seconds)} tracked</span>}
          </div>
        )}

        <div className="field">
          <span className="field-label">
            Tags
            <button type="button" className="field-action" onClick={onEditTags}>
              Edit tags
            </button>
          </span>
          <div className="field-row">
            {labels.map((label) => (
              <button
                key={label.id}
                type="button"
                className={card.labelIds.includes(label.id) ? 'chip chip--well is-on' : 'chip chip--well'}
                aria-pressed={card.labelIds.includes(label.id)}
                onClick={() => onChange({ labelIds: toggleIn(card.labelIds, label.id) })}
              >
                <i style={{ background: dotColor(label.color) }} />
                {label.name}
              </button>
            ))}
            {labels.length === 0 && <span className="field-empty">No tags yet</span>}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="card-due">
            Deadline
          </label>
          <div className="field-row">
            <DatePicker id="card-due" value={card.due} onChange={(due) => onChange({ due })} />
            {card.due && (
              <>
                <button
                  type="button"
                  className={card.pinned ? 'chip chip--well is-on' : 'chip chip--well'}
                  aria-pressed={card.pinned}
                  onClick={onTogglePin}
                >
                  <PinIcon size={14} />
                  {card.pinned ? 'Pinned' : 'Pin countdown'}
                </button>
                <button
                  type="button"
                  className="btn btn--plain btn--small"
                  onClick={() => onChange({ due: null, pinned: false })}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="card-notes">
            Notes
          </label>
          <textarea
            id="card-notes"
            className="notes"
            rows={4}
            placeholder="Add context, links or a definition of done"
            value={card.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </div>

        <div className="field">
          <span className="field-label">
            Checklist
            {card.checklist.length > 0 && (
              <span className="field-count">
                {doneCount} of {card.checklist.length}
              </span>
            )}
          </span>
          {card.checklist.length > 0 && (
            <div className="progress" aria-hidden="true">
              <i style={{ width: `${(doneCount / card.checklist.length) * 100}%` }} />
            </div>
          )}
          <ul className="checklist">
            {card.checklist.map((item) => (
              <li key={item.id}>
                <input
                  type="checkbox"
                  aria-label={`Mark ${item.text} as done`}
                  checked={item.done}
                  onChange={() =>
                    setChecklist(
                      card.checklist.map((entry) =>
                        entry.id === item.id ? { ...entry, done: !entry.done } : entry,
                      ),
                    )
                  }
                />
                <span className={item.done ? 'is-struck' : undefined}>{item.text}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${item.text}`}
                  onClick={() => setChecklist(card.checklist.filter((entry) => entry.id !== item.id))}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
          <input
            className="check-add"
            placeholder="Add an item and press Enter"
            aria-label="New checklist item"
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addItem();
              }
            }}
          />
        </div>

        <div className="sheet-foot">
          <button type="button" className="delete-card" onClick={onDelete}>
            <TrashIcon size={14} />
            Delete card
          </button>
          <button type="button" className="btn btn--plain btn--small" onClick={onDuplicate}>
            Duplicate
          </button>
        </div>
      </div>
    </dialog>
  );
}
