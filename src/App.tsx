import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { ContextMenuContext, type MenuTarget } from './board/contextMenu';
import { formatClock } from './board/dates';
import { dotColor, LabelsContext } from './board/labels';
import type { BoardAction } from './board/reducer';
import { localRepository } from './board/repository';
import { createSampleWorkspace } from './board/sample';
import { secondsByCard } from './board/stats';
import { TimerContext, useNow, type TimerApi } from './board/timerContext';
import { downloadBackup, mergeImport, readBackupFile } from './board/transfer';
import {
  BOARD_COLORS,
  canSortByDue,
  copyOfCard,
  createBoard,
  doneColumnOf,
  findCard,
  isCardDone,
  uid,
  type Board,
  type Card,
  type Timer,
} from './board/types';
import { useCloudSync } from './board/useCloudSync';
import { useWorkspace } from './board/useWorkspace';
import { AccountButton } from './components/AccountButton';
import { BoardsPage } from './components/BoardsPage';
import { CardSheet } from './components/CardSheet';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu, type ContextItem } from './components/ContextMenu';
import { CloseIcon, MoonIcon, PlusIcon, SearchIcon, StopIcon, SunIcon } from './components/Icons';
import { SignInDialog } from './components/SignInDialog';
import { StaleTimerDialog } from './components/StaleTimerDialog';
import { TagManager } from './components/TagManager';
import { Tour, type TourView } from './components/Tour';
import { YouPage } from './components/YouPage';
import { useTheme } from './theme';

const ONBOARDED_KEY = 'rooost.onboarded';
const STALE_AFTER_MS = 3 * 3600 * 1000;

function hasOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return true;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Without storage the tour simply shows again next visit.
  }
}

/** `?sample` opens a filled-in copy of the app that is never saved. */
function isSampleLink() {
  return new URLSearchParams(window.location.search).has('sample');
}

function SampleNotice() {
  return (
    <span className="sample-notice">
      Sample, nothing is saved
      <a href={window.location.pathname}>Exit</a>
    </span>
  );
}

function toggled(set: Set<string>, value: string) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function useIsPhone() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia('(max-width: 720px)');
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => window.matchMedia('(max-width: 720px)').matches,
  );
}

function Wordmark({ running }: { running: boolean }) {
  return (
    <span className={running ? 'wordmark is-running' : 'wordmark'} aria-label="rooost">
      ro<span className="wordmark-o">o</span>ost
    </span>
  );
}

function ViewSlider({ view, onChange }: { view: TourView; onChange: (view: TourView) => void }) {
  return (
    <div className="view-slider" data-view={view} role="group" aria-label="Switch view">
      <span className="view-thumb" aria-hidden="true" />
      <button type="button" aria-pressed={view === 'boards'} onClick={() => onChange('boards')}>
        Boards
      </button>
      <button type="button" aria-pressed={view === 'you'} onClick={() => onChange('you')}>
        You
      </button>
    </div>
  );
}

function TimerPill({
  timer,
  onOpen,
  onStop,
  onDiscard,
}: {
  timer: Timer;
  onOpen: () => void;
  onStop: () => void;
  onDiscard: () => void;
}) {
  const now = useNow(1000);
  return (
    <div className="timer-pill">
      <button type="button" className="timer-pill-main" onClick={onOpen}>
        <i aria-hidden="true" />
        <span className="timer-pill-title">{timer.cardTitle}</span>
        <span className="timer-pill-clock">{formatClock((now - timer.startedAt) / 1000)}</span>
      </button>
      <button
        type="button"
        className="timer-pill-stop timer-pill-discard"
        aria-label="Discard timer"
        title="Discard timer"
        onClick={onDiscard}
      >
        <CloseIcon size={12} />
      </button>
      <button type="button" className="timer-pill-stop" aria-label="Stop timer" onClick={onStop}>
        <StopIcon size={12} />
      </button>
    </div>
  );
}

export default function App() {
  const {
    workspace,
    dispatch,
    dispatchWithUndo,
    toast,
    undo,
    dismissToast,
    notify,
    pauseSaving,
    savingPaused,
    previewing,
    replaceWorkspace,
    beginPreview,
    endPreview,
    realWorkspace,
  } = useWorkspace(localRepository);
  const [cloudEnabled] = useState(() => !isSampleLink());
  const cloud = useCloudSync({
    workspace,
    applyRemote: replaceWorkspace,
    paused: savingPaused || previewing,
    enabled: cloudEnabled,
  });
  const [signingIn, setSigningIn] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isPhone = useIsPhone();

  const [view, setView] = useState<TourView>('boards');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [labels, setLabels] = useState<Set<string>>(new Set());
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [composingIn, setComposingIn] = useState<string | null>(null);
  const [newColumnId, setNewColumnId] = useState<string | null>(null);
  const [focusTitleFor, setFocusTitleFor] = useState<string | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);
  const [touring, setTouring] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showingSample, setShowingSample] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const tourChecked = useRef(false);

  const hasTimer = Boolean(workspace?.timer);
  const now = useNow(hasTimer ? 15000 : 60000);

  const board =
    workspace?.boards.find((item) => item.id === workspace.activeBoardId) ?? workspace?.boards[0];
  const firstColumnId = board?.columns[0]?.id ?? null;

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const clearTitleFocus = useCallback(() => setFocusTitleFor(null), []);

  // On touch screens a long press means drag, and text fields keep the browser's own menu.
  const openContextMenu = useCallback((event: ReactMouseEvent, target: MenuTarget) => {
    if (isTyping(event.target) || window.matchMedia('(pointer: coarse)').matches) return;
    event.preventDefault();
    event.stopPropagation();
    let { clientX: x, clientY: y } = event;
    if (!x && !y) {
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      x = box.left + 24;
      y = box.top + 24;
    }
    setContextMenu({ x, y, target });
  }, []);

  const clearFilters = useCallback(() => {
    setQuery('');
    setLabels(new Set());
    setSearchOpen(false);
  }, []);

  // Focus inside the tap itself, or phones won't bring up the keyboard.
  const openSearch = useCallback(() => {
    flushSync(() => setSearchOpen(true));
    search.current?.focus();
  }, []);

  const closeSearch = useCallback(() => {
    setQuery('');
    setSearchOpen(false);
  }, []);

  const startTour = useCallback(() => {
    beginPreview(createSampleWorkspace());
    clearFilters();
    setComposingIn(null);
    setOpenCardId(null);
    setView('boards');
    setTouring(true);
  }, [beginPreview, clearFilters]);

  const finishTour = useCallback(() => {
    endPreview();
    markOnboarded();
    setTouring(false);
    setView('boards');
    document.querySelectorAll('.board').forEach((element) => element.scrollTo({ left: 0 }));
  }, [endPreview]);

  useEffect(() => {
    if (!workspace || tourChecked.current) return;
    tourChecked.current = true;
    if (isSampleLink()) {
      beginPreview(createSampleWorkspace());
      setShowingSample(true);
    } else if (!hasOnboarded()) {
      startTour();
    }
  }, [workspace, startTour, beginPreview]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('dialog[open]') || view !== 'boards') return;
      if (event.key === '/') {
        event.preventDefault();
        openSearch();
      }
      if (event.key === 'n' && firstColumnId) {
        event.preventDefault();
        setComposingIn(firstColumnId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [firstColumnId, openSearch, view]);

  const filtering = query.trim() !== '' || labels.size > 0;

  const isVisible = useCallback(
    (card: Card) => {
      const needle = query.trim().toLowerCase();
      if (
        needle &&
        !card.title.toLowerCase().includes(needle) &&
        !card.description.toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (labels.size > 0 && !card.labelIds.some((id) => labels.has(id))) return false;
      return true;
    },
    [query, labels],
  );

  const boardId = board?.id;
  const boardDispatch: Dispatch<BoardAction> = useCallback(
    (action) => {
      if (boardId) dispatch({ type: 'board', boardId, action });
    },
    [boardId, dispatch],
  );

  const sessions = workspace?.sessions;
  const timer = workspace?.timer ?? null;
  const tracked = useMemo(() => secondsByCard(sessions ?? []), [sessions]);

  const stopTimer = useCallback(() => {
    dispatch({ type: 'stopTimer', sessionId: uid(), at: Date.now() });
  }, [dispatch]);

  const discardTimer = useCallback(() => {
    dispatchWithUndo({ type: 'discardTimer' }, 'Timer discarded');
  }, [dispatchWithUndo]);

  const timerApi: TimerApi = useMemo(
    () => ({
      tracked,
      runningCardId: timer?.cardId ?? null,
      startedAt: timer?.startedAt ?? null,
      start: (cardId) => dispatch({ type: 'startTimer', cardId, sessionId: uid(), at: Date.now() }),
      stop: stopTimer,
      discard: discardTimer,
    }),
    [tracked, timer, dispatch, stopTimer, discardTimer],
  );

  if (!workspace || !board) {
    return (
      <div className="app" aria-busy="true">
        <main className="board board--loading">
          {[0, 1, 2].map((key) => (
            <div key={key} className="column column--skeleton" />
          ))}
        </main>
      </div>
    );
  }

  const openFound = openCardId ? findCard(workspace, openCardId) : null;

  const addCard = (columnId: string, title: string) => {
    boardDispatch({
      type: 'addCard',
      columnId,
      card: {
        id: uid(),
        title,
        description: '',
        labelIds: [],
        due: null,
        checklist: [],
        pinned: false,
      },
    });
  };

  const addColumn = () => {
    const id = uid();
    setNewColumnId(id);
    boardDispatch({ type: 'addColumn', id, title: 'New column' });
  };

  const deleteColumn = (id: string) => {
    const column = board.columns.find((item) => item.id === id);
    if (column) {
      dispatchWithUndo(
        { type: 'board', boardId: board.id, action: { type: 'deleteColumn', id } },
        `Deleted “${column.title}”`,
      );
    }
  };

  const sortColumn = (id: string) => {
    const column = board.columns.find((item) => item.id === id);
    if (column) {
      dispatchWithUndo(
        { type: 'board', boardId: board.id, action: { type: 'sortColumnByDue', id } },
        `Sorted “${column.title}” by due date`,
      );
    }
  };

  const clearDone = () => {
    const count = doneColumnOf(board)?.cardIds.length ?? 0;
    if (count === 0) return;
    dispatchWithUndo(
      { type: 'board', boardId: board.id, action: { type: 'clearDone' } },
      `Cleared ${count} ${count === 1 ? 'card' : 'cards'}. Hours kept`,
    );
  };

  const moveCardToBoard = (cardId: string, toBoardId: string) => {
    const target = workspace.boards.find((item) => item.id === toBoardId);
    if (!target) return;
    setOpenCardId(null);
    dispatchWithUndo({ type: 'moveCardToBoard', cardId, toBoardId }, `Moved to “${target.title}”`);
  };

  const duplicateCard = (cardId: string) => {
    const found = findCard(workspace, cardId);
    if (!found) return;
    setOpenCardId(null);
    dispatchWithUndo(
      {
        type: 'board',
        boardId: found.board.id,
        action: { type: 'duplicateCard', sourceId: cardId, card: copyOfCard(found.card) },
      },
      'Card duplicated',
    );
  };

  const switchBoard = (id: string) => {
    clearFilters();
    setComposingIn(null);
    dispatch({ type: 'switchBoard', id });
  };

  const newBoard = () => {
    const created = createBoard('New board');
    clearFilters();
    setComposingIn(null);
    setFocusTitleFor(created.id);
    dispatch({ type: 'addBoard', board: created });
  };

  const confirmDeleteBoard = () => {
    if (!boardToDelete) return;
    dispatchWithUndo(
      { type: 'deleteBoard', id: boardToDelete.id, fallback: createBoard() },
      `Deleted “${boardToDelete.title}”`,
    );
    setBoardToDelete(null);
  };

  const togglePin = (cardId: string) => {
    const found = findCard(workspace, cardId);
    if (!found) return;
    dispatch({
      type: 'board',
      boardId: found.board.id,
      action: { type: 'updateCard', id: cardId, patch: { pinned: !found.card.pinned } },
    });
  };

  const tagUsage = new Map<string, number>();
  for (const item of workspace.boards) {
    for (const card of Object.values(item.cards)) {
      for (const id of card.labelIds) tagUsage.set(id, (tagUsage.get(id) ?? 0) + 1);
    }
  }

  const importFile = async (file: File) => {
    const result = await readBackupFile(file);
    if (!result.ok) {
      notify(result.error);
      return;
    }
    const merged = mergeImport(workspace, result.boards, result.sessions, result.labels);
    clearFilters();
    setComposingIn(null);
    setNewColumnId(null);
    const boardsText = `${merged.boardCount} ${merged.boardCount === 1 ? 'board' : 'boards'}`;
    dispatchWithUndo(
      { type: 'replaceAll', workspace: merged.workspace },
      `Added ${boardsText} and ${merged.sessionCount} tracked ${merged.sessionCount === 1 ? 'session' : 'sessions'}`,
    );
  };

  const cardMenu = (cardId: string): ContextItem[] | null => {
    const found = findCard(workspace, cardId);
    if (!found) return null;
    const { board: owner, card } = found;
    const done = isCardDone(owner, card.id);
    const running = timer?.cardId === card.id;
    const current = owner.columns.find((column) => column.cardIds.includes(card.id));
    const otherColumns = owner.columns.filter((column) => column !== current);
    const otherBoards = workspace.boards.filter((item) => item !== owner && item.columns.length > 0);

    return [
      { type: 'item', label: 'Open', onSelect: () => setOpenCardId(card.id) },
      ...(running
        ? ([
            { type: 'item', label: 'Stop timer', onSelect: stopTimer },
            { type: 'item', label: 'Discard timer', onSelect: discardTimer },
          ] as ContextItem[])
        : done
          ? []
          : ([
              { type: 'item', label: 'Start timer', onSelect: () => timerApi.start(card.id) },
            ] as ContextItem[])),
      ...(card.due && !done
        ? ([
            {
              type: 'item',
              label: card.pinned ? 'Unpin countdown' : 'Pin countdown',
              onSelect: () => togglePin(card.id),
            },
          ] as ContextItem[])
        : []),
      ...(otherColumns.length > 0
        ? ([
            {
              type: 'sub',
              label: 'Move to',
              items: otherColumns.map((column) => ({
                type: 'item' as const,
                label: column.title,
                onSelect: () =>
                  dispatch({
                    type: 'board',
                    boardId: owner.id,
                    action: {
                      type: 'moveCard',
                      cardId: card.id,
                      toColumnId: column.id,
                      index: column.cardIds.length,
                    },
                  }),
              })),
            },
          ] as ContextItem[])
        : []),
      ...(otherBoards.length > 0
        ? ([
            {
              type: 'sub',
              label: 'Move to board',
              items: otherBoards.map((item) => ({
                type: 'item' as const,
                label: item.title,
                onSelect: () => moveCardToBoard(card.id, item.id),
              })),
            },
          ] as ContextItem[])
        : []),
      {
        type: 'sub',
        label: 'Tags',
        items: [
          ...workspace.labels.map((label) => {
            const on = card.labelIds.includes(label.id);
            return {
              type: 'item' as const,
              label: label.name,
              dot: dotColor(label.color),
              checked: on,
              keepOpen: true,
              onSelect: () =>
                dispatch({
                  type: 'board',
                  boardId: owner.id,
                  action: {
                    type: 'updateCard',
                    id: card.id,
                    patch: {
                      labelIds: on
                        ? card.labelIds.filter((id) => id !== label.id)
                        : [...card.labelIds, label.id],
                    },
                  },
                }),
            };
          }),
          ...(workspace.labels.length > 0 ? ([{ type: 'divider' }] as ContextItem[]) : []),
          { type: 'item', label: 'Edit tags', onSelect: () => setEditingTags(true) },
        ],
      },
      { type: 'item', label: 'Duplicate', onSelect: () => duplicateCard(card.id) },
      { type: 'divider' },
      {
        type: 'item',
        label: 'Delete card',
        danger: true,
        onSelect: () =>
          dispatchWithUndo(
            { type: 'board', boardId: owner.id, action: { type: 'deleteCard', id: card.id } },
            'Card deleted',
          ),
      },
    ];
  };

  const columnMenu = (columnId: string, onRename: () => void): ContextItem[] => {
    const column = board.columns.find((item) => item.id === columnId);
    const canClear = column !== undefined && column === doneColumnOf(board) && column.cardIds.length > 0;
    return [
      { type: 'item', label: 'Add card', onSelect: () => setComposingIn(columnId) },
      { type: 'item', label: 'Rename', onSelect: onRename },
      ...(column && canSortByDue(board, column)
        ? ([{ type: 'item', label: 'Sort by due date', onSelect: () => sortColumn(columnId) }] as ContextItem[])
        : []),
      { type: 'divider' },
      ...(canClear
        ? ([{ type: 'item', label: 'Clear done cards', danger: true, onSelect: clearDone }] as ContextItem[])
        : []),
      { type: 'item', label: 'Delete column', danger: true, onSelect: () => deleteColumn(columnId) },
    ];
  };

  const boardMenu = (id: string): ContextItem[] | null => {
    const target = workspace.boards.find((item) => item.id === id);
    if (!target) return null;
    return [
      {
        type: 'item',
        label: 'Rename',
        onSelect: () => {
          if (target.id !== board.id) switchBoard(target.id);
          setFocusTitleFor(target.id);
        },
      },
      {
        type: 'custom',
        id: 'colour',
        node: (
          <div className="swatches swatches--ctx" role="group" aria-label="Board colour">
            {BOARD_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={target.color === color ? 'swatch is-on' : 'swatch'}
                data-accent={color}
                aria-label={`${color} board`}
                aria-pressed={target.color === color}
                onClick={() =>
                  dispatch({ type: 'board', boardId: target.id, action: { type: 'setColor', color } })
                }
              />
            ))}
          </div>
        ),
      },
      { type: 'divider' },
      { type: 'item', label: 'Delete board', danger: true, onSelect: () => setBoardToDelete(target) },
    ];
  };

  const contextItems = !contextMenu
    ? null
    : contextMenu.target.kind === 'card'
      ? cardMenu(contextMenu.target.id)
      : contextMenu.target.kind === 'column'
        ? columnMenu(contextMenu.target.id, contextMenu.target.onRename)
        : boardMenu(contextMenu.target.id);

  const isStale = Boolean(timer && !touring && now - timer.checkedAt >= STALE_AFTER_MS);

  const timerPill = timer && !touring && (
    <TimerPill
      timer={timer}
      onOpen={() => setOpenCardId(timer.cardId)}
      onStop={stopTimer}
      onDiscard={discardTimer}
    />
  );

  const boardsHidden = view !== 'boards';
  const returning = Boolean(
    realWorkspace.current &&
      (realWorkspace.current.boards.length > 1 ||
        realWorkspace.current.boards.some((item) => Object.keys(item.cards).length > 0)),
  );

  return (
    <TimerContext.Provider value={timerApi}>
      <LabelsContext.Provider value={workspace.labels}>
      <ContextMenuContext.Provider value={openContextMenu}>
      <div className={touring ? 'app is-touring' : 'app'}>
        <nav className="nav" aria-label="Main">
          <div className="nav-left">
            <Wordmark running={Boolean(timer) && !touring} />
            <ViewSlider view={view} onChange={setView} />
            {!isPhone && showingSample && <SampleNotice />}
          </div>
          <label className={['search', boardsHidden && 'is-hidden', searchOpen && 'is-open'].filter(Boolean).join(' ')}>
            <SearchIcon />
            <input
              ref={search}
              type="search"
              value={query}
              placeholder="Search cards"
              aria-label="Search cards"
              onChange={(event) => setQuery(event.target.value)}
              onBlur={(event) => {
                if (!event.currentTarget.value) setSearchOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  closeSearch();
                  event.currentTarget.blur();
                }
              }}
            />
            <kbd>/</kbd>
            {isPhone && (
              <button
                type="button"
                className="icon-btn search-close"
                aria-label="Close search"
                onMouseDown={(event) => event.preventDefault()}
                onClick={closeSearch}
              >
                <CloseIcon />
              </button>
            )}
          </label>
          <div className="nav-actions">
            {!isPhone && timerPill}
            {isPhone && !boardsHidden && (
              <button
                type="button"
                className="icon-btn icon-btn--soft search-toggle"
                aria-label="Search cards"
                onClick={openSearch}
              >
                <SearchIcon />
              </button>
            )}
            {cloudEnabled && (
              <AccountButton
                user={cloud.user}
                status={cloud.status}
                onSignIn={() => setSigningIn(true)}
                onSignOut={() => {
                  void cloud.signOut().then((done) => {
                    if (!done) notify('Couldn’t save your latest changes, so you’re still signed in');
                  });
                }}
                onDeleteAccount={() => setDeletingAccount(true)}
              />
            )}
            {!boardsHidden && (
              <button
                type="button"
                className="btn btn--dark nav-new"
                aria-label="New card"
                disabled={!firstColumnId}
                onClick={() => setComposingIn(firstColumnId)}
              >
                <PlusIcon />
                <span>New card</span>
              </button>
            )}
            {(!isPhone || boardsHidden) && (
              <button
                type="button"
                className="icon-btn icon-btn--soft theme-toggle"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={toggleTheme}
              >
                <span key={theme} className="theme-icon">
                  {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </span>
              </button>
            )}
          </div>
        </nav>

        <div className="views-window">
          <div className="views" data-view={view}>
            <div className="view" inert={view !== 'boards'}>
              <BoardsPage
                workspace={workspace}
                board={board}
                dispatch={boardDispatch}
                isVisible={isVisible}
                filtering={filtering}
                labels={labels}
                onToggleLabel={(id) => setLabels((current) => toggled(current, id))}
                onEditTags={() => setEditingTags(true)}
                onClearFilters={clearFilters}
                onSwitchBoard={switchBoard}
                onNewBoard={newBoard}
                onMoveBoard={(activeId, overId) => dispatch({ type: 'moveBoard', activeId, overId })}
                onSortColumn={sortColumn}
                onClearDone={clearDone}
                focusTitleFor={focusTitleFor}
                onTitleFocused={clearTitleFocus}
                composingIn={composingIn}
                newColumnId={newColumnId}
                onCompose={setComposingIn}
                onAddCard={addCard}
                onAddColumn={addColumn}
                onOpenCard={setOpenCardId}
                onDeleteColumn={deleteColumn}
                pauseSaving={pauseSaving}
                menuItems={[
                  { label: 'Edit tags', onSelect: () => setEditingTags(true) },
                  ...(showingSample
                    ? []
                    : [
                        {
                          label: 'Export backup',
                          onSelect: () => {
                            downloadBackup(workspace);
                            notify('Backup exported');
                          },
                        },
                        { label: 'Import backup', onSelect: () => importInput.current?.click() },
                        { label: 'Replay the tour', onSelect: startTour },
                      ]),
                  { label: 'Delete board', danger: true, onSelect: () => setBoardToDelete(board) },
                ]}
              />
            </div>
            <div className="view" inert={view !== 'you'}>
              <YouPage
                workspace={workspace}
                now={now}
                onOpenCard={setOpenCardId}
                onTogglePin={togglePin}
                onDeleteSession={(id) => dispatchWithUndo({ type: 'deleteSession', id }, 'Time log deleted')}
              />
            </div>
          </div>
        </div>

        {isPhone && (timerPill || showingSample) && (
          <div className="phone-dock">{timerPill || <SampleNotice />}</div>
        )}

        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />

        {openFound && (
          <CardSheet
            key={openFound.card.id}
            card={openFound.card}
            board={openFound.board}
            boards={workspace.boards}
            onMoveToBoard={(boardId) => moveCardToBoard(openFound.card.id, boardId)}
            onDuplicate={() => duplicateCard(openFound.card.id)}
            onChange={(patch) =>
              dispatch({
                type: 'board',
                boardId: openFound.board.id,
                action: { type: 'updateCard', id: openFound.card.id, patch },
              })
            }
            onMove={(columnId) => {
              const target = openFound.board.columns.find((column) => column.id === columnId);
              if (target) {
                dispatch({
                  type: 'board',
                  boardId: openFound.board.id,
                  action: {
                    type: 'moveCard',
                    cardId: openFound.card.id,
                    toColumnId: columnId,
                    index: target.cardIds.length,
                  },
                });
              }
            }}
            onTogglePin={() => togglePin(openFound.card.id)}
            onEditTags={() => setEditingTags(true)}
            onDelete={() => {
              setOpenCardId(null);
              dispatchWithUndo(
                {
                  type: 'board',
                  boardId: openFound.board.id,
                  action: { type: 'deleteCard', id: openFound.card.id },
                },
                'Card deleted',
              );
            }}
            onClose={() => setOpenCardId(null)}
          />
        )}

        {editingTags && (
          <TagManager
            labels={workspace.labels}
            usage={tagUsage}
            onAdd={(label) => dispatch({ type: 'addLabel', label })}
            onUpdate={(id, patch) => dispatch({ type: 'updateLabel', id, patch })}
            onDelete={(id) => {
              setLabels((current) => {
                const next = new Set(current);
                next.delete(id);
                return next;
              });
              dispatch({ type: 'deleteLabel', id });
            }}
            onMove={(activeId, overId) => dispatch({ type: 'moveLabel', activeId, overId })}
            onClose={() => setEditingTags(false)}
          />
        )}

        {boardToDelete && (
          <ConfirmDialog
            title={`Delete “${boardToDelete.title}”?`}
            cancelLabel="Keep board"
            confirmLabel="Delete board"
            onConfirm={confirmDeleteBoard}
            onCancel={() => setBoardToDelete(null)}
          >
            <p className="confirm-text">
              Its {Object.keys(boardToDelete.cards).length} cards will be deleted. The hours you tracked
              stay on your heatmap.
            </p>
          </ConfirmDialog>
        )}

        {deletingAccount && (
          <ConfirmDialog
            title="Delete your account?"
            cancelLabel="Keep my account"
            confirmLabel="Delete account"
            onConfirm={() => {
              setDeletingAccount(false);
              void cloud.deleteAccount().then((done) => {
                notify(done ? 'Your account was deleted' : 'Couldn’t delete your account. Please try again');
              });
            }}
            onCancel={() => setDeletingAccount(false)}
          >
            <p className="confirm-text">
              Your boards, cards and tracked hours will be permanently deleted from your account and
              this browser. This can’t be undone, so export a backup first if you want a copy.
            </p>
          </ConfirmDialog>
        )}

        {isStale && timer && (
          <StaleTimerDialog
            key={timer.checkedAt}
            timer={timer}
            onKeepGoing={() => dispatch({ type: 'keepTimer', at: Date.now() })}
            onSave={(seconds) =>
              dispatch({ type: 'stopTimer', sessionId: uid(), at: Date.now(), seconds })
            }
          />
        )}

        {touring && <Tour returning={returning} onView={setView} onFinish={finishTour} />}

        {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}

        {cloud.choice?.kind === 'first-link' && (
          <ConfirmDialog
            title="This browser has its own boards"
            cancelLabel="Use my account only"
            confirmLabel="Add them to my account"
            onConfirm={() => cloud.resolveChoice('merge')}
            onCancel={() => cloud.resolveChoice('use-remote')}
            onEscape={() => undefined}
          >
            <p className="confirm-text">
              Your account already has boards. You can add this browser’s boards to them, or switch to
              your account and leave these behind.
            </p>
          </ConfirmDialog>
        )}

        {cloud.choice?.kind === 'conflict' && (
          <ConfirmDialog
            title="Changed on another device"
            cancelLabel="Load the latest"
            confirmLabel="Keep this device’s version"
            onConfirm={() => cloud.resolveChoice('keep-mine')}
            onCancel={() => cloud.resolveChoice('use-remote')}
            onEscape={() => undefined}
          >
            <p className="confirm-text">
              Your account was updated elsewhere while this device had unsaved changes. Only one version
              can be kept.
            </p>
          </ConfirmDialog>
        )}

        {contextMenu && contextItems && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextItems}
            onClose={closeContextMenu}
          />
        )}

        {toast && (
          <div className="toast" role="status">
            <span>{toast.message}</span>
            {toast.undo ? (
              <button type="button" className="toast-action" onClick={undo}>
                Undo
              </button>
            ) : (
              <button type="button" className="toast-action" onClick={dismissToast}>
                OK
              </button>
            )}
          </div>
        )}
      </div>
      </ContextMenuContext.Provider>
      </LabelsContext.Provider>
    </TimerContext.Provider>
  );
}
