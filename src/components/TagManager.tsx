import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dotColor, LABEL_COLORS, MAX_TAG_NAME, MAX_TAGS } from '../board/labels';
import { uid, type Label, type LabelColor } from '../board/types';
import { CloseIcon, GripIcon, PlusIcon } from './Icons';

type TagManagerProps = {
  labels: Label[];
  usage: Map<string, number>;
  onAdd: (label: Label) => void;
  onUpdate: (id: string, patch: Partial<Omit<Label, 'id'>>) => void;
  onDelete: (id: string) => void;
  onMove: (activeId: string, overId: string) => void;
  onClose: () => void;
};

const DUPLICATE = 'You already have a tag with that name';

function nextColor(labels: Label[]): LabelColor {
  return LABEL_COLORS.find((color) => !labels.some((label) => label.color === color)) ?? 'blue';
}

function TagRow({
  label,
  count,
  isDuplicate,
  canMove,
  onUpdate,
  onDelete,
  onError,
}: {
  label: Label;
  count: number;
  canMove: boolean;
  isDuplicate: (name: string, ownId: string) => boolean;
  onUpdate: TagManagerProps['onUpdate'];
  onDelete: TagManagerProps['onDelete'];
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(label.name);
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: label.id, disabled: confirming });

  useEffect(() => {
    setName(label.name);
  }, [label.name]);

  const commit = () => {
    const next = name.trim();
    if (!next || next === label.name) {
      setName(label.name);
      return;
    }
    if (isDuplicate(next, label.id)) {
      setName(label.name);
      onError(DUPLICATE);
      return;
    }
    onError('');
    onUpdate(label.id, { name: next });
  };

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'tag-item is-dragging' : 'tag-item'}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
    >
      {confirming ? (
        <div className="tag-row tag-row--confirm">
          <span className="tag-confirm-text">
            Remove “{label.name}” from {count} {count === 1 ? 'card' : 'cards'}?
          </span>
          <button type="button" className="btn btn--plain btn--small" onClick={() => setConfirming(false)}>
            Keep
          </button>
          <button type="button" className="btn btn--dark btn--small" onClick={() => onDelete(label.id)}>
            Remove
          </button>
        </div>
      ) : (
        <div className="tag-row">
          {canMove && (
            <button
              ref={setActivatorNodeRef}
              type="button"
              className="tag-grip"
              {...attributes}
              {...listeners}
              aria-label={`Move ${label.name}`}
            >
              <GripIcon size={14} />
            </button>
          )}
          <button
            type="button"
            className="tag-dot"
            style={{ background: dotColor(label.color) }}
            aria-label={`Change colour of ${label.name}`}
            aria-expanded={picking}
            onClick={() => setPicking((value) => !value)}
          />
          <input
            className="tag-name"
            value={name}
            maxLength={MAX_TAG_NAME}
            aria-label={`Name of tag ${label.name}`}
            onChange={(event) => setName(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <span className="tag-count">{count}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Delete tag ${label.name}`}
            onClick={() => (count > 0 ? setConfirming(true) : onDelete(label.id))}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
      {picking && !confirming && (
        <div className="tag-colors" role="group" aria-label={`Colour for ${label.name}`}>
          {LABEL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={color === label.color ? 'tag-color is-on' : 'tag-color'}
              style={{ background: dotColor(color) }}
              aria-label={color}
              aria-pressed={color === label.color}
              onClick={() => {
                onUpdate(label.id, { color });
                setPicking(false);
              }}
            />
          ))}
        </div>
      )}
    </li>
  );
}

export function TagManager({ labels, usage, onAdd, onUpdate, onDelete, onMove, onClose }: TagManagerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const addField = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    const node = dialog.current;
    if (node && !node.open) {
      node.showModal();
      node.focus();
    }
    return () => node?.close();
  }, []);

  const isDuplicate = (name: string, ownId: string) =>
    labels.some((label) => label.id !== ownId && label.name.toLowerCase() === name.toLowerCase());

  const full = labels.length >= MAX_TAGS;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: UniqueIdentifier) => labels.find((label) => label.id === id)?.name ?? '';

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : undefined),
    onDragEnd: ({ active }) => `Dropped ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelled. ${nameOf(active.id)} went back.`,
  };

  const finishDrag = ({ active, over }: DragEndEvent) => {
    dragging.current = false;
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
  };

  const add = () => {
    const name = draft.trim();
    if (!name || full) return;
    if (isDuplicate(name, '')) {
      setError(DUPLICATE);
      return;
    }
    setError('');
    onAdd({ id: uid(), name, color: nextColor(labels) });
    setDraft('');
    addField.current?.focus();
  };

  return (
    <dialog
      ref={dialog}
      className="confirm tags"
      tabIndex={-1}
      aria-labelledby="tags-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          // During a keyboard drag, Escape only cancels the drag.
          if (dragging.current) return;
          event.stopPropagation();
          onClose();
        }
      }}
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
    >
      <h2 id="tags-title">Tags</h2>
      <p className="confirm-text tags-hint">Shared across all your boards.</p>

      {labels.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements }}
          onDragStart={() => {
            dragging.current = true;
          }}
          onDragEnd={finishDrag}
          onDragCancel={() => {
            dragging.current = false;
          }}
        >
          <SortableContext items={labels.map((label) => label.id)} strategy={verticalListSortingStrategy}>
            <ul className="tag-list">
              {labels.map((label) => (
                <TagRow
                  key={label.id}
                  label={label}
                  count={usage.get(label.id) ?? 0}
                  isDuplicate={isDuplicate}
                  canMove={labels.length > 1}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onError={setError}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {error && (
        <p className="tags-error" role="alert">
          {error}
        </p>
      )}

      {full ? (
        <p className="tags-full">That’s the limit of {MAX_TAGS} tags.</p>
      ) : (
        <form
          className="tag-add"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <input
            ref={addField}
            value={draft}
            maxLength={MAX_TAG_NAME}
            placeholder="Add a tag"
            aria-label="New tag name"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="icon-btn icon-btn--soft" aria-label="Add tag" disabled={!draft.trim()}>
            <PlusIcon size={14} />
          </button>
        </form>
      )}

      <div className="confirm-actions">
        <button type="button" className="btn btn--dark" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
