import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useOpenContextMenu } from '../board/contextMenu';
import { dateKeyFromToday } from '../board/dates';
import { dotColor, useLabels } from '../board/labels';
import type { BoardAction } from '../board/reducer';
import { BOARD_COLORS, doneColumnOf, type Board, type Card, type Workspace } from '../board/types';
import { BoardView } from './BoardView';
import { CheckDot, CloseIcon, PencilIcon, PlusIcon } from './Icons';
import { Menu, type MenuItem } from './Menu';

type BoardsPageProps = {
  workspace: Workspace;
  board: Board;
  dispatch: Dispatch<BoardAction>;
  isVisible: (card: Card) => boolean;
  filtering: boolean;
  labels: Set<string>;
  onToggleLabel: (id: string) => void;
  onEditTags: () => void;
  onClearFilters: () => void;
  onSwitchBoard: (id: string) => void;
  onNewBoard: () => void;
  onMoveBoard: (activeId: string, overId: string) => void;
  onSortColumn: (id: string) => void;
  onClearDone: () => void;
  focusTitleFor: string | null;
  onTitleFocused: () => void;
  composingIn: string | null;
  newColumnId: string | null;
  onCompose: (columnId: string | null) => void;
  onAddCard: (columnId: string, title: string) => void;
  onAddColumn: () => void;
  onOpenCard: (id: string) => void;
  onDeleteColumn: (id: string) => void;
  menuItems: MenuItem[];
  pauseSaving: (paused: boolean) => void;
};

function BoardTitle({
  board,
  autoFocus,
  onFocused,
  dispatch,
}: {
  board: Board;
  autoFocus: boolean;
  onFocused: () => void;
  dispatch: Dispatch<BoardAction>;
}) {
  const [title, setTitle] = useState(board.title);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(board.title);
  }, [board.title]);

  useEffect(() => {
    if (autoFocus) {
      field.current?.focus();
      field.current?.select();
      onFocused();
    }
  }, [autoFocus, onFocused]);

  const commit = () => {
    const next = title.trim();
    if (next) dispatch({ type: 'renameBoard', title: next });
    else setTitle(board.title);
  };

  return (
    <span className="title-edit">
      <input
        ref={field}
        className="board-title"
        aria-label="Board name"
        value={title}
        size={Math.max(title.length, 6)}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className="title-pencil"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => field.current?.focus()}
      >
        <PencilIcon size={15} />
      </button>
    </span>
  );
}

function BoardTab({
  item,
  isOn,
  neighbours,
  onSwitch,
  onMove,
}: {
  item: Board;
  isOn: boolean;
  neighbours: { left?: Board; right?: Board };
  onSwitch: (id: string) => void;
  onMove: (activeId: string, overId: string) => void;
}) {
  const openContextMenu = useOpenContextMenu();
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={['board-tab', isOn && 'is-on', isDragging && 'is-dragging'].filter(Boolean).join(' ')}
      style={{ transform: CSS.Translate.toString(transform && { ...transform, y: 0 }), transition }}
      {...attributes}
      {...listeners}
      aria-current={isOn ? 'true' : undefined}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      data-accent={item.color}
      onContextMenu={(event) => openContextMenu(event, { kind: 'board', id: item.id })}
      onClick={() => onSwitch(item.id)}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        const other = event.key === 'ArrowLeft' ? neighbours.left : neighbours.right;
        if (other) onMove(item.id, other.id);
      }}
    >
      <i aria-hidden="true" />
      {item.title}
    </button>
  );
}

export function BoardsPage({
  workspace,
  board,
  dispatch,
  isVisible,
  filtering,
  labels,
  onToggleLabel,
  onEditTags,
  onClearFilters,
  onSwitchBoard,
  onNewBoard,
  onMoveBoard,
  onSortColumn,
  onClearDone,
  focusTitleFor,
  onTitleFocused,
  composingIn,
  newColumnId,
  onCompose,
  onAddCard,
  onAddColumn,
  onOpenCard,
  onDeleteColumn,
  menuItems,
  pauseSaving,
}: BoardsPageProps) {
  const allLabels = useLabels();
  const tabSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const finishTabDrag = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onMoveBoard(String(active.id), String(over.id));
  };

  const stats = useMemo(() => {
    const doneColumn = doneColumnOf(board);
    const today = dateKeyFromToday(0);
    const week = dateKeyFromToday(7);
    const openCards = board.columns
      .filter((column) => column !== doneColumn)
      .flatMap((column) => column.cardIds.map((id) => board.cards[id]));
    return {
      total: Object.keys(board.cards).length,
      done: doneColumn?.cardIds.length ?? 0,
      open: openCards.length,
      overdue: openCards.filter((card) => card.due && card.due < today).length,
      soon: openCards.filter((card) => card.due && card.due >= today && card.due <= week).length,
    };
  }, [board]);

  return (
    <div className="boards" data-accent={board.color}>
      <div className="board-tabs" role="group" aria-label="Your boards">
        <DndContext sensors={tabSensors} collisionDetection={closestCenter} onDragEnd={finishTabDrag}>
          <SortableContext items={workspace.boards.map((item) => item.id)} strategy={horizontalListSortingStrategy}>
            {workspace.boards.map((item, index) => (
              <BoardTab
                key={item.id}
                item={item}
                isOn={item.id === board.id}
                neighbours={{ left: workspace.boards[index - 1], right: workspace.boards[index + 1] }}
                onSwitch={onSwitchBoard}
                onMove={onMoveBoard}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button type="button" className="board-tab board-tab--new" onClick={onNewBoard}>
          <PlusIcon size={14} />
          New board
        </button>
      </div>

      <header className="head head--board">
        <div className="head-title">
          <div className="head-line">
            <BoardTitle
              key={board.id}
              board={board}
              autoFocus={focusTitleFor === board.id}
              onFocused={onTitleFocused}
              dispatch={dispatch}
            />
            {stats.total > 0 && board.columns.length > 1 && (
              <span className="done-pill">
                <CheckDot key={stats.done} size={16} />
                {stats.done} of {stats.total} done
              </span>
            )}
          </div>
          <p className="head-sub">
            {stats.open} open. {stats.overdue} overdue. {stats.soon} due this week.
          </p>
        </div>

        <div className="head-tools">
          <div className="filters" role="group" aria-label="Filter cards">
            {allLabels.map((label) => (
              <button
                key={label.id}
                type="button"
                className={labels.has(label.id) ? 'chip is-on' : 'chip'}
                aria-pressed={labels.has(label.id)}
                onClick={() => onToggleLabel(label.id)}
              >
                <i style={{ background: dotColor(label.color) }} />
                {label.name}
              </button>
            ))}
            <button
              type="button"
              className="chip chip--edit"
              aria-label="Edit tags"
              title="Edit tags"
              onClick={onEditTags}
            >
              <PencilIcon size={13} />
            </button>
            {filtering && (
              <button type="button" className="chip chip--clear" onClick={onClearFilters}>
                <CloseIcon size={12} />
                Clear
              </button>
            )}
          </div>
          <button type="button" className="btn btn--white" onClick={onAddColumn}>
            <PlusIcon size={14} />
            <span className="add-column-text">Add column</span>
          </button>
          <Menu
            label="Board options"
            items={menuItems}
            header={
              <div className="swatches" role="group" aria-label="Board colour">
                {BOARD_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={board.color === color ? 'swatch is-on' : 'swatch'}
                    data-accent={color}
                    aria-label={`${color} board`}
                    aria-pressed={board.color === color}
                    onClick={() => dispatch({ type: 'setColor', color })}
                  />
                ))}
              </div>
            }
          />
        </div>
      </header>

      {board.columns.length === 0 ? (
        <main className="board-empty">
          <h2>This board has no columns</h2>
          <p>Add one to start tracking work.</p>
          <button type="button" className="btn btn--dark" onClick={onAddColumn}>
            <PlusIcon size={14} />
            Add column
          </button>
        </main>
      ) : (
        <BoardView
          key={board.id}
          board={board}
          dispatch={dispatch}
          isVisible={isVisible}
          filtering={filtering}
          composingIn={composingIn}
          newColumnId={newColumnId}
          onCompose={onCompose}
          onAddCard={onAddCard}
          onOpenCard={onOpenCard}
          onDeleteColumn={onDeleteColumn}
          onSortColumn={onSortColumn}
          onClearDone={onClearDone}
          pauseSaving={pauseSaving}
        />
      )}
    </div>
  );
}
