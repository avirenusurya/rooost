import { DEFAULT_LABELS } from './labels';
import { readBoard } from './transfer';
import { createWorkspace, type Workspace } from './types';

/**
 * Everything the app knows about persistence. To move to Supabase, write a
 * second implementation of this interface and pass it to useWorkspace in App.tsx.
 */
export interface WorkspaceRepository {
  load(): Promise<Workspace>;
  save(workspace: Workspace): Promise<void>;
}

const STORAGE_KEY = 'rooost.workspace.v1';
const UNREADABLE_KEY = 'rooost.workspace.unreadable';
const SINGLE_BOARD_KEYS = ['rooost.board.v1', 'roost.board.v1'];

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== 'object' || value === null) return false;
  const workspace = value as Workspace;
  return (
    Array.isArray(workspace.boards) &&
    workspace.boards.length > 0 &&
    Array.isArray(workspace.sessions) &&
    workspace.boards.every(
      (board) =>
        typeof board.title === 'string' &&
        Array.isArray(board.columns) &&
        typeof board.cards === 'object' &&
        board.cards !== null &&
        board.columns.every(
          (column) =>
            Array.isArray(column.cardIds) &&
            column.cardIds.every((id) => board.cards[id] !== undefined),
        ),
    )
  );
}

function fromSingleBoard(): Workspace | null {
  for (const key of SINGLE_BOARD_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const board = readBoard(JSON.parse(raw));
    if (board) {
      return { labels: DEFAULT_LABELS, boards: [board], activeBoardId: board.id, sessions: [], timer: null };
    }
  }
  return null;
}

/** Fills in fields added since this browser last saved. */
function withCurrentFields(workspace: Workspace): Workspace {
  const known = workspace.boards.some((board) => board.id === workspace.activeBoardId);
  return {
    ...workspace,
    labels: Array.isArray(workspace.labels) ? workspace.labels : DEFAULT_LABELS,
    activeBoardId: known ? workspace.activeBoardId : workspace.boards[0].id,
    boards: workspace.boards.map((board) => ({ ...board, color: board.color ?? 'green' })),
  };
}

export function normalizeWorkspace(value: unknown): Workspace | null {
  return isWorkspace(value) ? withCurrentFields(value) : null;
}

export const localRepository: WorkspaceRepository = {
  async load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isWorkspace(parsed)) return withCurrentFields(parsed);
        // Keep the raw text, since the next save would otherwise overwrite it.
        localStorage.setItem(UNREADABLE_KEY, raw);
      }
      const migrated = fromSingleBoard();
      if (migrated) return migrated;
    } catch {
      // Unreadable or blocked storage falls through to a fresh start.
    }
    return createWorkspace();
  },

  async save(workspace) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  },
};
