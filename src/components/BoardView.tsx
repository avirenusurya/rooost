import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type { BoardAction } from '../board/reducer';
import { canSortByDue, type Board, type Card } from '../board/types';
import { Column } from './Column';
import { CardFace } from './TaskCard';

const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const dropAnimation: DropAnimation | null = prefersReducedMotion
  ? null
  : {
      duration: 200,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      sideEffects: (args) => {
        args.dragOverlay.node.querySelector('.lift > *')?.classList.add('is-dropping');
        return defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } })(args);
      },
    };

type BoardViewProps = {
  board: Board;
  dispatch: Dispatch<BoardAction>;
  isVisible: (card: Card) => boolean;
  filtering: boolean;
  composingIn: string | null;
  newColumnId: string | null;
  onCompose: (columnId: string | null) => void;
  onAddCard: (columnId: string, title: string) => void;
  onOpenCard: (id: string) => void;
  onDeleteColumn: (id: string) => void;
  onSortColumn: (id: string) => void;
  onClearDone: () => void;
  pauseSaving: (paused: boolean) => void;
};

export function BoardView({
  board,
  dispatch,
  isVisible,
  filtering,
  composingIn,
  newColumnId,
  onCompose,
  onAddCard,
  onOpenCard,
  onDeleteColumn,
  onSortColumn,
  onClearDone,
  pauseSaving,
}: BoardViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const snapshot = useRef<Board | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMoved = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ['Space'],
        cancel: ['Escape'],
        end: ['Space', 'Enter'],
      },
    }),
  );

  const columnIds = useMemo(() => board.columns.map((column) => column.id), [board.columns]);
  const doneColumnId = board.columns.length > 1 ? board.columns[board.columns.length - 1].id : null;

  const findColumn = useCallback(
    (id: UniqueIdentifier) =>
      board.columns.find((column) => column.id === id) ??
      board.columns.find((column) => column.cardIds.includes(String(id))),
    [board.columns],
  );

  const visibleCards = useCallback(
    (cardIds: string[]) => cardIds.map((id) => board.cards[id]).filter(isVisible),
    [board.cards, isVisible],
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMoved.current = false;
    });
  }, [board.columns]);

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (activeId && columnIds.includes(activeId)) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            columnIds.includes(String(container.id)),
          ),
        });
      }

      const pointerHits = pointerWithin(args);
      const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
      let overId = getFirstCollision(hits, 'id');

      if (overId !== null) {
        const column = board.columns.find((item) => item.id === overId);
        if (column) {
          const visibleIds = visibleCards(column.cardIds).map((card) => card.id);
          if (visibleIds.length > 0) {
            overId =
              closestCenter({
                ...args,
                droppableContainers: args.droppableContainers.filter((container) =>
                  visibleIds.includes(String(container.id)),
                ),
              })[0]?.id ?? overId;
          }
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }

      if (recentlyMoved.current) lastOverId.current = activeId;
      return lastOverId.current !== null ? [{ id: lastOverId.current }] : [];
    },
    [activeId, board.columns, columnIds, visibleCards],
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    snapshot.current = board;
    setActiveId(String(active.id));
    pauseSaving(true);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || columnIds.includes(String(active.id))) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from.id === to.id) return;

    const overIndex = to.cardIds.indexOf(String(over.id));
    const translated = active.rect.current.translated;
    const isBelow = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
    const index = overIndex >= 0 ? overIndex + (isBelow ? 1 : 0) : to.cardIds.length;

    recentlyMoved.current = true;
    dispatch({ type: 'moveCard', cardId: String(active.id), toColumnId: to.id, index });
  };

  const finishDrag = () => {
    setActiveId(null);
    pauseSaving(false);
    snapshot.current = null;
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) {
      if (columnIds.includes(String(active.id))) {
        dispatch({ type: 'moveColumn', activeId: String(active.id), overId: String(over.id) });
      } else {
        const column = findColumn(active.id);
        const overIndex = column?.cardIds.indexOf(String(over.id)) ?? -1;
        if (column && overIndex >= 0) {
          dispatch({
            type: 'moveCard',
            cardId: String(active.id),
            toColumnId: column.id,
            index: overIndex,
          });
        }
      }
    }
    finishDrag();
  };

  const handleDragCancel = () => {
    if (snapshot.current) dispatch({ type: 'replace', board: snapshot.current });
    finishDrag();
  };

  const nameOf = (id: UniqueIdentifier) =>
    board.cards[String(id)]?.title ?? board.columns.find((column) => column.id === id)?.title ?? '';

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const column = over ? findColumn(over.id) : undefined;
      return column ? `${nameOf(active.id)} is over ${column.title}.` : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const column = over ? findColumn(over.id) : undefined;
      return column ? `Dropped ${nameOf(active.id)} in ${column.title}.` : undefined;
    },
    onDragCancel: ({ active }) => `Cancelled. ${nameOf(active.id)} went back.`,
  };

  const activeCard = activeId ? board.cards[activeId] : undefined;
  const activeColumn = activeId ? board.columns.find((column) => column.id === activeId) : undefined;
  const activeCardColumn = activeCard ? findColumn(activeCard.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
        <main className="board">
          {board.columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={visibleCards(column.cardIds)}
              isDone={column.id === doneColumnId}
              filtering={filtering}
              composing={composingIn === column.id}
              isNew={newColumnId === column.id}
              onCompose={onCompose}
              onAddCard={onAddCard}
              onOpenCard={onOpenCard}
              onRename={(id, title) => dispatch({ type: 'renameColumn', id, title })}
              onDelete={onDeleteColumn}
              canSort={canSortByDue(board, column)}
              onSort={onSortColumn}
              onClearDone={onClearDone}
            />
          ))}
        </main>
      </SortableContext>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeCard && (
          <div className="lift">
            <div className="card card--lifted">
              <CardFace card={activeCard} isDone={activeCardColumn?.id === doneColumnId} />
            </div>
          </div>
        )}
        {activeColumn && (
          <div className="lift">
            <div className={`column column--lifted ${activeColumn.id === doneColumnId ? 'column--done' : ''}`}>
              <header className="column-head">
                <h2 className="column-title">
                  <span className="column-name">{activeColumn.title}</span>
                  <span className="column-count">{visibleCards(activeColumn.cardIds).length}</span>
                </h2>
              </header>
              <div className="column-list">
                {visibleCards(activeColumn.cardIds).map((card) => (
                  <div key={card.id} className="card">
                    <CardFace card={card} isDone={activeColumn.id === doneColumnId} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
