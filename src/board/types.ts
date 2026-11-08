import { DEFAULT_LABELS } from './labels';

export type LabelColor = 'yellow' | 'orange' | 'red' | 'pink' | 'purple' | 'blue' | 'teal' | 'green';

export type BoardColor = 'green' | 'purple' | 'blue' | 'orange' | 'pink' | 'teal';

export const BOARD_COLORS: BoardColor[] = ['green', 'purple', 'blue', 'orange', 'pink', 'teal'];

export type Label = { id: string; name: string; color: LabelColor };

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Card = {
  id: string;
  title: string;
  description: string;
  labelIds: string[];
  /** Local calendar date, YYYY-MM-DD. */
  due: string | null;
  checklist: ChecklistItem[];
  pinned: boolean;
};

export type Column = { id: string; title: string; cardIds: string[] };

export type Board = {
  id: string;
  title: string;
  color: BoardColor;
  columns: Column[];
  cards: Record<string, Card>;
};

/** Titles are copied in so history survives the card or board being deleted. */
export type Session = {
  id: string;
  boardId: string;
  cardId: string;
  boardTitle: string;
  cardTitle: string;
  startedAt: number;
  endedAt: number;
  seconds: number;
  /** Used for tag totals once the card itself has been deleted. */
  labelIds?: string[];
};

export type Timer = {
  boardId: string;
  cardId: string;
  boardTitle: string;
  cardTitle: string;
  startedAt: number;
  /** Last time the "still working?" check was answered. */
  checkedAt: number;
};

export type Workspace = {
  labels: Label[];
  boards: Board[];
  activeBoardId: string;
  sessions: Session[];
  timer: Timer | null;
};

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createBoard(title = 'My board'): Board {
  return {
    id: uid(),
    title,
    color: 'green',
    cards: {},
    columns: ['To do', 'In progress', 'Done'].map((name) => ({
      id: uid(),
      title: name,
      cardIds: [],
    })),
  };
}

export function createWorkspace(): Workspace {
  const board = createBoard();
  return { labels: DEFAULT_LABELS, boards: [board], activeBoardId: board.id, sessions: [], timer: null };
}

/** The last column is the finish line, once a board has more than one. */
export function doneColumnOf(board: Board): Column | null {
  return board.columns.length > 1 ? board.columns[board.columns.length - 1] : null;
}

export function isCardDone(board: Board, cardId: string): boolean {
  return doneColumnOf(board)?.cardIds.includes(cardId) ?? false;
}

export function findCard(workspace: Workspace, cardId: string) {
  for (const board of workspace.boards) {
    const card = board.cards[cardId];
    if (card && Object.hasOwn(board.cards, cardId)) return { board, card };
  }
  return null;
}

export function canSortByDue(board: Board, column: Column): boolean {
  return column.cardIds.length > 1 && column.cardIds.some((id) => board.cards[id]?.due);
}

/** A card to do again: same details, nothing ticked off and no tracked time. */
export function copyOfCard(card: Card): Card {
  return {
    ...card,
    id: uid(),
    title: `${card.title} (copy)`,
    pinned: false,
    checklist: card.checklist.map((item) => ({ ...item, id: uid(), done: false })),
  };
}

export function activePins(workspace: Workspace) {
  return workspace.boards.flatMap((board) =>
    Object.values(board.cards)
      .filter((card) => card.pinned && card.due !== null && !isCardDone(board, card.id))
      .map((card) => ({ board, card })),
  );
}
