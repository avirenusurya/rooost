import { dateKeyFromToday } from './dates';
import { LABEL_COLORS, MAX_TAG_NAME } from './labels';
import {
  BOARD_COLORS,
  uid,
  type Board,
  type BoardColor,
  type Card,
  type ChecklistItem,
  type Column,
  type Label,
  type LabelColor,
  type Session,
  type Workspace,
} from './types';

const APP = 'rooost';
const FORMAT_VERSION = 3;
const MAX_IMPORTED_LABELS = 50;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const MAX_SESSION_MS = 31 * 86400000;

const DAMAGED = 'This file looks damaged, so nothing was imported';
const NOT_OURS = 'That is not a rooost export file';

export type ImportResult =
  | { ok: true; boards: Board[]; sessions: Session[]; labels: Label[] }
  | { ok: false; error: string };

export function downloadBackup(workspace: Workspace) {
  const payload = {
    app: APP,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    labels: workspace.labels,
    boards: workspace.boards,
    sessions: workspace.sessions,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${APP}-backup-${dateKeyFromToday(0)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8.64e15;
}

function isDateKey(value: string) {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= 31 && !Number.isNaN(new Date(year, month - 1, day).getTime())
  );
}

function readLabel(value: unknown): Label | null {
  const label = asRecord(value);
  if (
    !label ||
    !isId(label.id) ||
    typeof label.name !== 'string' ||
    label.name.trim() === '' ||
    label.name.length > MAX_TAG_NAME ||
    !LABEL_COLORS.includes(label.color as LabelColor)
  ) {
    return null;
  }
  return { id: label.id, name: label.name, color: label.color as LabelColor };
}

function readChecklistItem(value: unknown): ChecklistItem | null {
  const item = asRecord(value);
  if (!item || !isId(item.id) || typeof item.text !== 'string' || typeof item.done !== 'boolean') {
    return null;
  }
  return { id: item.id, text: item.text, done: item.done };
}

function readCard(value: unknown): Card | null {
  const card = asRecord(value);
  if (
    !card ||
    !isId(card.id) ||
    typeof card.title !== 'string' ||
    card.title.trim() === '' ||
    typeof card.description !== 'string' ||
    !Array.isArray(card.labelIds) ||
    !card.labelIds.every(isId) ||
    !(card.due === null || (typeof card.due === 'string' && isDateKey(card.due))) ||
    !(card.pinned === undefined || typeof card.pinned === 'boolean') ||
    !Array.isArray(card.checklist)
  ) {
    return null;
  }

  const checklist = card.checklist.map(readChecklistItem);
  if (checklist.includes(null)) return null;
  const items = checklist as ChecklistItem[];
  if (new Set(items.map((item) => item.id)).size !== items.length) return null;

  return {
    id: card.id,
    title: card.title,
    description: card.description,
    labelIds: card.labelIds as string[],
    due: card.due,
    checklist: items,
    pinned: card.pinned === true,
  };
}

function readColumn(value: unknown): Column | null {
  const column = asRecord(value);
  if (
    !column ||
    !isId(column.id) ||
    typeof column.title !== 'string' ||
    column.title.trim() === '' ||
    !Array.isArray(column.cardIds) ||
    !column.cardIds.every(isId)
  ) {
    return null;
  }
  return { id: column.id, title: column.title, cardIds: column.cardIds as string[] };
}

export function readBoard(value: unknown): Board | null {
  const board = asRecord(value);
  const rawCards = board && asRecord(board.cards);
  if (
    !board ||
    !rawCards ||
    !isId(board.id) ||
    typeof board.title !== 'string' ||
    board.title.trim() === '' ||
    !Array.isArray(board.columns) ||
    !(board.color === undefined || BOARD_COLORS.includes(board.color as BoardColor))
  ) {
    return null;
  }

  const entries: [string, Card][] = [];
  for (const [key, rawCard] of Object.entries(rawCards)) {
    const card = readCard(rawCard);
    if (!card || card.id !== key) return null;
    entries.push([key, card]);
  }
  const cards = Object.fromEntries(entries);

  const columns: Column[] = [];
  const columnIds = new Set<string>();
  const placedCards = new Set<string>();
  for (const rawColumn of board.columns) {
    const column = readColumn(rawColumn);
    if (!column || columnIds.has(column.id) || Object.hasOwn(cards, column.id)) return null;
    columnIds.add(column.id);
    for (const id of column.cardIds) {
      if (!Object.hasOwn(cards, id) || placedCards.has(id)) return null;
      placedCards.add(id);
    }
    columns.push(column);
  }
  if (placedCards.size !== entries.length) return null;

  return {
    id: board.id,
    title: board.title,
    color: (board.color as BoardColor | undefined) ?? 'green',
    columns,
    cards,
  };
}

function readSession(value: unknown): Session | null {
  const session = asRecord(value);
  if (
    !session ||
    !isId(session.id) ||
    !isId(session.boardId) ||
    !isId(session.cardId) ||
    typeof session.boardTitle !== 'string' ||
    typeof session.cardTitle !== 'string' ||
    !isTime(session.startedAt) ||
    !isTime(session.endedAt) ||
    typeof session.seconds !== 'number' ||
    !Number.isInteger(session.seconds) ||
    session.seconds < 0 ||
    session.endedAt < session.startedAt ||
    session.endedAt - session.startedAt > MAX_SESSION_MS ||
    !(session.labelIds === undefined || (Array.isArray(session.labelIds) && session.labelIds.every(isId)))
  ) {
    return null;
  }
  return {
    id: session.id,
    boardId: session.boardId,
    cardId: session.cardId,
    boardTitle: session.boardTitle,
    cardTitle: session.cardTitle,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    seconds: session.seconds,
    labelIds: (session.labelIds as string[] | undefined) ?? [],
  };
}

export async function readBackupFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: 'This file is too large to import' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: NOT_OURS };
  }

  const envelope = asRecord(parsed);
  if (!envelope || envelope.app !== APP || typeof envelope.version !== 'number' || envelope.version < 1) {
    return { ok: false, error: NOT_OURS };
  }
  if (envelope.version > FORMAT_VERSION) {
    return { ok: false, error: 'This file came from a newer version of rooost' };
  }

  if (envelope.version === 1) {
    const board = readBoard(envelope.board);
    return board ? { ok: true, boards: [board], sessions: [], labels: [] } : { ok: false, error: DAMAGED };
  }

  if (!Array.isArray(envelope.boards) || envelope.boards.length === 0 || !Array.isArray(envelope.sessions)) {
    return { ok: false, error: DAMAGED };
  }

  const rawLabels = envelope.version >= 3 ? envelope.labels : [];
  if (!Array.isArray(rawLabels) || rawLabels.length > MAX_IMPORTED_LABELS) {
    return { ok: false, error: DAMAGED };
  }

  const boards = envelope.boards.map(readBoard);
  const sessions = envelope.sessions.map(readSession);
  const labels = rawLabels.map(readLabel);
  if (boards.includes(null) || sessions.includes(null) || labels.includes(null)) {
    return { ok: false, error: DAMAGED };
  }
  const validBoards = boards as Board[];
  const validSessions = sessions as Session[];
  const validLabels = labels as Label[];
  if (
    new Set(validBoards.map((board) => board.id)).size !== validBoards.length ||
    new Set(validSessions.map((session) => session.id)).size !== validSessions.length ||
    new Set(validLabels.map((label) => label.id)).size !== validLabels.length
  ) {
    return { ok: false, error: DAMAGED };
  }

  return { ok: true, boards: validBoards, sessions: validSessions, labels: validLabels };
}

function idsIn(board: Board): string[] {
  return [board.id, ...board.columns.map((column) => column.id), ...Object.keys(board.cards)];
}

/** Gives a board new ids, returning the old-to-new mapping for its sessions. */
function withFreshIds(board: Board) {
  const cardIds = new Map(Object.keys(board.cards).map((id) => [id, uid()]));
  const remapped: Board = {
    id: uid(),
    title: board.title,
    color: board.color,
    columns: board.columns.map((column) => ({
      id: uid(),
      title: column.title,
      cardIds: column.cardIds.map((id) => cardIds.get(id)!),
    })),
    cards: Object.fromEntries(
      Object.values(board.cards).map((card) => {
        const id = cardIds.get(card.id)!;
        return [id, { ...card, id, checklist: card.checklist.map((item) => ({ ...item, id: uid() })) }];
      }),
    ),
  };
  return { board: remapped, cardIds };
}

/**
 * Importing only ever adds. Boards that clash become copies, and sessions already
 * present are skipped, so restoring the same backup twice can't inflate your hours.
 */
export function mergeImport(
  workspace: Workspace,
  boards: Board[],
  sessions: Session[],
  labels: Label[],
) {
  // A tag with the same name as one you already have folds into yours.
  const labelIds = new Set(workspace.labels.map((label) => label.id));
  const labelNames = new Map(workspace.labels.map((label) => [label.name.toLowerCase(), label.id]));
  const relabelled = new Map<string, string>();
  const newLabels: Label[] = [];
  for (const label of labels) {
    if (labelIds.has(label.id)) continue;
    const sameName = labelNames.get(label.name.toLowerCase());
    if (sameName) {
      relabelled.set(label.id, sameName);
      continue;
    }
    newLabels.push(label);
    labelIds.add(label.id);
    labelNames.set(label.name.toLowerCase(), label.id);
  }
  const relabel = (ids: string[]) => [...new Set(ids.map((id) => relabelled.get(id) ?? id))];

  const onlyBoard = workspace.boards.length === 1 ? workspace.boards[0] : null;
  const replacesEmptyStart =
    onlyBoard !== null && Object.keys(onlyBoard.cards).length === 0 && workspace.timer === null;
  const existing = replacesEmptyStart ? [] : workspace.boards;

  const usedIds = new Set(existing.flatMap(idsIn));
  const usedTitles = new Set(existing.map((board) => board.title));
  const sessionIds = new Set(workspace.sessions.map((session) => session.id));
  const remaps = new Map<string, { boardId: string; cardIds: Map<string, string> }>();

  const added = boards.map((incoming) => {
    let board = incoming;
    if (idsIn(incoming).some((id) => usedIds.has(id))) {
      const fresh = withFreshIds(incoming);
      board = fresh.board;
      remaps.set(incoming.id, { boardId: board.id, cardIds: fresh.cardIds });
    }
    let title = board.title;
    while (usedTitles.has(title)) title = `${title} (copy)`;
    board = {
      ...board,
      title,
      cards: Object.fromEntries(
        Object.entries(board.cards).map(([id, card]) => [id, { ...card, labelIds: relabel(card.labelIds) }]),
      ),
    };
    usedTitles.add(title);
    idsIn(board).forEach((id) => usedIds.add(id));
    return board;
  });

  const newSessions = sessions
    .filter((session) => !sessionIds.has(session.id))
    .map((session) => {
      const tagged = { ...session, labelIds: relabel(session.labelIds ?? []) };
      const remap = remaps.get(session.boardId);
      if (!remap) return tagged;
      return {
        ...tagged,
        boardId: remap.boardId,
        cardId: remap.cardIds.get(session.cardId) ?? session.cardId,
      };
    });

  const merged: Workspace = {
    ...workspace,
    labels: [...workspace.labels, ...newLabels],
    boards: [...existing, ...added],
    activeBoardId: added[0].id,
    sessions: [...workspace.sessions, ...newSessions],
  };
  return { workspace: merged, boardCount: added.length, sessionCount: newSessions.length };
}
