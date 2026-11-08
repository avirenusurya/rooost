import { useEffect, useRef, useState } from 'react';
import {
  defaultAnimateLayoutChanges,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useOpenContextMenu } from '../board/contextMenu';
import type { Card, Column as ColumnData } from '../board/types';
import { PlusIcon } from './Icons';
import { Menu } from './Menu';
import { SortableCard } from './TaskCard';

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

type ColumnProps = {
  column: ColumnData;
  cards: Card[];
  isDone: boolean;
  filtering: boolean;
  composing: boolean;
  isNew: boolean;
  onCompose: (columnId: string | null) => void;
  onAddCard: (columnId: string, title: string) => void;
  onOpenCard: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  canSort: boolean;
  onSort: (id: string) => void;
  onClearDone: () => void;
};

function EmptyColumn({ text }: { text: string }) {
  return (
    <div className="column-empty">
      <svg width="72" height="56" viewBox="0 0 72 56" aria-hidden="true">
        <rect x="10" y="14" width="34" height="30" rx="8" transform="rotate(-9 27 29)" className="stack-a" />
        <rect x="28" y="12" width="34" height="30" rx="8" transform="rotate(8 45 27)" className="stack-b" />
      </svg>
      <p>{text}</p>
    </div>
  );
}

function Composer({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const submit = () => {
    const title = value.trim();
    if (title) onSubmit(title);
    setValue('');
    return Boolean(title);
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
        field.current?.focus();
      }}
    >
      <textarea
        ref={field}
        rows={2}
        value={value}
        placeholder="What needs doing?"
        aria-label="New card title"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') onClose();
        }}
        onBlur={(event) => {
          if (event.relatedTarget?.closest('.composer')) return;
          submit();
          onClose();
        }}
      />
      <div className="composer-row">
        <button type="submit" className="btn btn--dark btn--small">
          Add card
        </button>
        <button type="button" className="btn btn--plain btn--small" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function Column({
  column,
  cards,
  isDone,
  filtering,
  composing,
  isNew,
  onCompose,
  onAddCard,
  onOpenCard,
  onRename,
  onDelete,
  canSort,
  onSort,
  onClearDone,
}: ColumnProps) {
  const [editing, setEditing] = useState(isNew);
  const openContextMenu = useOpenContextMenu();
  const titleField = useRef<HTMLInputElement>(null);

  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' },
    disabled: { draggable: editing },
    animateLayoutChanges,
  });

  useEffect(() => {
    if (editing) {
      titleField.current?.focus();
      titleField.current?.select();
    }
  }, [editing]);

  const commitTitle = () => {
    const title = titleField.current?.value.trim();
    if (title) onRename(column.id, title);
    setEditing(false);
  };

  const emptyText = filtering
    ? 'No matching cards'
    : isDone
      ? 'Finished work lands here'
      : 'Drag a card here or add one';

  return (
    <section
      ref={setNodeRef}
      className={[
        'column',
        isDone ? 'column--done' : '',
        isDragging ? 'is-column-placeholder' : '',
      ].join(' ')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={column.title}
      onContextMenu={(event) =>
        openContextMenu(event, { kind: 'column', id: column.id, onRename: () => setEditing(true) })
      }
    >
      <header className="column-head">
        {editing ? (
          <input
            ref={titleField}
            className="column-title-input"
            defaultValue={column.title}
            aria-label="Column name"
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitTitle();
              if (event.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <h2
            ref={setActivatorNodeRef}
            className="column-title"
            onDoubleClick={() => setEditing(true)}
            {...attributes}
            {...listeners}
            aria-label={`${column.title}, move column`}
          >
            <span className="column-name">{column.title}</span>
            <span className="column-count">{cards.length}</span>
          </h2>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={`Add a card to ${column.title}`}
          onClick={() => onCompose(column.id)}
        >
          <PlusIcon />
        </button>
        <Menu
          label={`${column.title} options`}
          items={[
            { label: 'Rename', onSelect: () => setEditing(true) },
            ...(canSort ? [{ label: 'Sort by due date', onSelect: () => onSort(column.id) }] : []),
            ...(isDone && column.cardIds.length > 0
              ? [{ label: 'Clear done cards', danger: true, onSelect: onClearDone }]
              : []),
            { label: 'Delete column', danger: true, onSelect: () => onDelete(column.id) },
          ]}
        />
      </header>

      <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        <div className="column-list">
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} isDone={isDone} onOpen={onOpenCard} />
          ))}
          {cards.length === 0 && !composing && <EmptyColumn text={emptyText} />}
        </div>
      </SortableContext>

      <footer className="column-foot">
        {composing ? (
          <Composer
            onSubmit={(title) => onAddCard(column.id, title)}
            onClose={() => onCompose(null)}
          />
        ) : (
          <button type="button" className="add-card" onClick={() => onCompose(column.id)}>
            <PlusIcon size={14} />
            Add card
          </button>
        )}
      </footer>
    </section>
  );
}
