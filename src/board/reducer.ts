import {
  doneColumnOf,
  findCard,
  isCardDone,
  type Board,
  type BoardColor,
  type Card,
  type Label,
  type Session,
  type Workspace,
} from './types';

export const MIN_SESSION_SECONDS = 10;

const NO_DUE_DATE = '9999-12-31';

export type BoardAction =
  | { type: 'replace'; board: Board }
  | { type: 'renameBoard'; title: string }
  | { type: 'setColor'; color: BoardColor }
  | { type: 'addColumn'; id: string; title: string }
  | { type: 'renameColumn'; id: string; title: string }
  | { type: 'deleteColumn'; id: string }
  | { type: 'moveColumn'; activeId: string; overId: string }
  | { type: 'addCard'; columnId: string; card: Card }
  | { type: 'updateCard'; id: string; patch: Partial<Omit<Card, 'id'>> }
  | { type: 'deleteCard'; id: string }
  | { type: 'moveCard'; cardId: string; toColumnId: string; index: number }
  | { type: 'duplicateCard'; sourceId: string; card: Card }
  | { type: 'sortColumnByDue'; id: string }
  | { type: 'clearDone' };

export type WorkspaceAction =
  | { type: 'replaceAll'; workspace: Workspace }
  | { type: 'board'; boardId: string; action: BoardAction }
  | { type: 'switchBoard'; id: string }
  | { type: 'addBoard'; board: Board }
  | { type: 'deleteBoard'; id: string; fallback: Board }
  | { type: 'moveBoard'; activeId: string; overId: string }
  | { type: 'moveCardToBoard'; cardId: string; toBoardId: string }
  | { type: 'moveLabel'; activeId: string; overId: string }
  | { type: 'addLabel'; label: Label }
  | { type: 'updateLabel'; id: string; patch: Partial<Omit<Label, 'id'>> }
  | { type: 'deleteLabel'; id: string }
  | { type: 'startTimer'; cardId: string; sessionId: string; at: number }
  | { type: 'stopTimer'; sessionId: string; at: number; seconds?: number }
  | { type: 'discardTimer' }
  | { type: 'deleteSession'; id: string }
  | { type: 'keepTimer'; at: number };

function moved<T extends { id: string }>(list: T[], activeId: string, overId: string): T[] {
  const from = list.findIndex((item) => item.id === activeId);
  const to = list.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function moveCard(board: Board, cardId: string, toColumnId: string, index: number): Board {
  const from = board.columns.find((column) => column.cardIds.includes(cardId));
  const to = board.columns.find((column) => column.id === toColumnId);
  if (!from || !to) return board;

  const remaining = from.cardIds.filter((id) => id !== cardId);
  const target = from.id === to.id ? remaining : to.cardIds;
  const clamped = Math.max(0, Math.min(index, target.length));

  if (from.id === to.id && from.cardIds.indexOf(cardId) === clamped) return board;

  const inserted = [...target.slice(0, clamped), cardId, ...target.slice(clamped)];
  return {
    ...board,
    columns: board.columns.map((column) => {
      if (column.id === to.id) return { ...column, cardIds: inserted };
      if (column.id === from.id) return { ...column, cardIds: remaining };
      return column;
    }),
  };
}

export function boardReducer(board: Board, action: BoardAction): Board {
  switch (action.type) {
    case 'replace':
      return action.board;

    case 'renameBoard':
      return { ...board, title: action.title };

    case 'setColor':
      return { ...board, color: action.color };

    case 'addColumn': {
      // The last column is the finish line, so new columns go in front of it.
      const added = { id: action.id, title: action.title, cardIds: [] };
      const at = board.columns.length >= 2 ? board.columns.length - 1 : board.columns.length;
      return { ...board, columns: [...board.columns.slice(0, at), added, ...board.columns.slice(at)] };
    }

    case 'renameColumn':
      return {
        ...board,
        columns: board.columns.map((column) =>
          column.id === action.id ? { ...column, title: action.title } : column,
        ),
      };

    case 'deleteColumn': {
      const column = board.columns.find((item) => item.id === action.id);
      if (!column) return board;
      const cards = { ...board.cards };
      column.cardIds.forEach((id) => delete cards[id]);
      return { ...board, cards, columns: board.columns.filter((item) => item.id !== action.id) };
    }

    case 'moveColumn': {
      const columns = moved(board.columns, action.activeId, action.overId);
      return columns === board.columns ? board : { ...board, columns };
    }

    case 'addCard':
      return {
        ...board,
        cards: { ...board.cards, [action.card.id]: action.card },
        columns: board.columns.map((column) =>
          column.id === action.columnId
            ? { ...column, cardIds: [...column.cardIds, action.card.id] }
            : column,
        ),
      };

    case 'updateCard': {
      const card = board.cards[action.id];
      if (!card) return board;
      return { ...board, cards: { ...board.cards, [action.id]: { ...card, ...action.patch } } };
    }

    case 'deleteCard': {
      const cards = { ...board.cards };
      delete cards[action.id];
      return {
        ...board,
        cards,
        columns: board.columns.map((column) => ({
          ...column,
          cardIds: column.cardIds.filter((id) => id !== action.id),
        })),
      };
    }

    case 'moveCard':
      return moveCard(board, action.cardId, action.toColumnId, action.index);

    case 'duplicateCard': {
      const from = board.columns.find((column) => column.cardIds.includes(action.sourceId));
      if (!from) return board;
      // A finished card is copied to be done again, so the copy goes back to the start.
      const finished = from === doneColumnOf(board);
      const to = finished ? board.columns[0] : from;
      const at = finished ? to.cardIds.length : from.cardIds.indexOf(action.sourceId) + 1;
      return {
        ...board,
        cards: { ...board.cards, [action.card.id]: action.card },
        columns: board.columns.map((column) =>
          column === to
            ? { ...column, cardIds: [...column.cardIds.slice(0, at), action.card.id, ...column.cardIds.slice(at)] }
            : column,
        ),
      };
    }

    case 'sortColumnByDue': {
      const dueOf = (id: string) => board.cards[id]?.due ?? NO_DUE_DATE;
      return {
        ...board,
        columns: board.columns.map((column) =>
          column.id === action.id
            ? { ...column, cardIds: [...column.cardIds].sort((a, b) => dueOf(a).localeCompare(dueOf(b))) }
            : column,
        ),
      };
    }

    case 'clearDone': {
      const done = doneColumnOf(board);
      if (!done) return board;
      const cards = { ...board.cards };
      done.cardIds.forEach((id) => delete cards[id]);
      return {
        ...board,
        cards,
        columns: board.columns.map((column) => (column === done ? { ...column, cardIds: [] } : column)),
      };
    }
  }
}

/** Keeps the card's id, so its hours and any running timer come along with it. */
function moveCardToBoard(workspace: Workspace, cardId: string, toBoardId: string): Workspace {
  const found = findCard(workspace, cardId);
  const target = workspace.boards.find((board) => board.id === toBoardId);
  if (!found || !target || target.id === found.board.id || target.columns.length === 0) return workspace;

  const source = found.board;
  const from = source.columns.find((column) => column.cardIds.includes(cardId));
  if (!from) return workspace;
  const destination =
    (isCardDone(source, cardId) ? doneColumnOf(target) : null) ??
    target.columns.find((column) => column.title === from.title) ??
    target.columns[0];

  const sourceCards = { ...source.cards };
  delete sourceCards[cardId];
  const nowHere = { boardId: target.id, boardTitle: target.title };

  return {
    ...workspace,
    boards: workspace.boards.map((board) => {
      if (board.id === source.id) {
        return {
          ...board,
          cards: sourceCards,
          columns: board.columns.map((column) =>
            column === from
              ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
              : column,
          ),
        };
      }
      if (board.id === target.id) {
        return {
          ...board,
          cards: { ...board.cards, [cardId]: found.card },
          columns: board.columns.map((column) =>
            column === destination ? { ...column, cardIds: [...column.cardIds, cardId] } : column,
          ),
        };
      }
      return board;
    }),
    sessions: workspace.sessions.map((session) =>
      session.cardId === cardId ? { ...session, ...nowHere } : session,
    ),
    timer: workspace.timer?.cardId === cardId ? { ...workspace.timer, ...nowHere } : workspace.timer,
  };
}

function finishTimer(
  workspace: Workspace,
  sessionId: string,
  at: number,
  seconds?: number,
): Workspace {
  const timer = workspace.timer;
  if (!timer) return workspace;

  const elapsed = Math.max(0, Math.round((at - timer.startedAt) / 1000));
  const kept = Math.min(seconds ?? elapsed, elapsed);
  if (kept < MIN_SESSION_SECONDS) return { ...workspace, timer: null };

  const found = findCard(workspace, timer.cardId);
  const session: Session = {
    id: sessionId,
    boardId: timer.boardId,
    cardId: timer.cardId,
    boardTitle: found?.board.title ?? timer.boardTitle,
    cardTitle: found?.card.title ?? timer.cardTitle,
    startedAt: timer.startedAt,
    endedAt: timer.startedAt + kept * 1000,
    seconds: kept,
    labelIds: found?.card.labelIds ?? [],
  };
  return { ...workspace, timer: null, sessions: [...workspace.sessions, session] };
}

export function workspaceReducer(
  workspace: Workspace | null,
  action: WorkspaceAction,
): Workspace | null {
  if (action.type === 'replaceAll') return action.workspace;
  if (!workspace) return workspace;

  switch (action.type) {
    case 'board':
      return {
        ...workspace,
        boards: workspace.boards.map((board) =>
          board.id === action.boardId ? boardReducer(board, action.action) : board,
        ),
      };

    case 'switchBoard':
      return { ...workspace, activeBoardId: action.id };

    case 'addBoard':
      return { ...workspace, boards: [...workspace.boards, action.board], activeBoardId: action.board.id };

    case 'deleteBoard': {
      const index = workspace.boards.findIndex((board) => board.id === action.id);
      if (index < 0) return workspace;
      const remaining = workspace.boards.filter((board) => board.id !== action.id);
      const boards = remaining.length > 0 ? remaining : [action.fallback];
      const activeBoardId =
        workspace.activeBoardId === action.id
          ? boards[Math.min(index, boards.length - 1)].id
          : workspace.activeBoardId;
      return { ...workspace, boards, activeBoardId };
    }

    case 'moveBoard': {
      const boards = moved(workspace.boards, action.activeId, action.overId);
      return boards === workspace.boards ? workspace : { ...workspace, boards };
    }

    case 'moveCardToBoard':
      return moveCardToBoard(workspace, action.cardId, action.toBoardId);

    case 'moveLabel': {
      const labels = moved(workspace.labels, action.activeId, action.overId);
      return labels === workspace.labels ? workspace : { ...workspace, labels };
    }

    case 'addLabel':
      return { ...workspace, labels: [...workspace.labels, action.label] };

    case 'updateLabel':
      return {
        ...workspace,
        labels: workspace.labels.map((label) =>
          label.id === action.id ? { ...label, ...action.patch } : label,
        ),
      };

    case 'deleteLabel':
      return {
        ...workspace,
        labels: workspace.labels.filter((label) => label.id !== action.id),
        boards: workspace.boards.map((board) => ({
          ...board,
          cards: Object.fromEntries(
            Object.entries(board.cards).map(([id, card]) => [
              id,
              card.labelIds.includes(action.id)
                ? { ...card, labelIds: card.labelIds.filter((labelId) => labelId !== action.id) }
                : card,
            ]),
          ),
        })),
      };

    case 'startTimer': {
      const found = findCard(workspace, action.cardId);
      if (!found || workspace.timer?.cardId === action.cardId) return workspace;
      return {
        ...finishTimer(workspace, action.sessionId, action.at),
        timer: {
          boardId: found.board.id,
          cardId: found.card.id,
          boardTitle: found.board.title,
          cardTitle: found.card.title,
          startedAt: action.at,
          checkedAt: action.at,
        },
      };
    }

    case 'stopTimer':
      return finishTimer(workspace, action.sessionId, action.at, action.seconds);

    case 'discardTimer':
      return { ...workspace, timer: null };

    case 'deleteSession':
      return {
        ...workspace,
        sessions: workspace.sessions.filter((session) => session.id !== action.id),
      };

    case 'keepTimer':
      return workspace.timer
        ? { ...workspace, timer: { ...workspace.timer, checkedAt: action.at } }
        : workspace;
  }
}
