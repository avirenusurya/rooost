import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { formatDuration } from './dates';
import type { WorkspaceRepository } from './repository';
import { workspaceReducer, MIN_SESSION_SECONDS, type WorkspaceAction } from './reducer';
import { findCard, isCardDone, uid, type Workspace } from './types';

export type Toast = { message: string; undo?: Workspace };

const SAVE_DELAY_MS = 250;
const TOAST_MS = 6000;

export function useWorkspace(repository: WorkspaceRepository) {
  const [workspace, applyAction] = useReducer(workspaceReducer, null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [savingPaused, pauseSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const latest = useRef<Workspace | null>(null);
  const realWorkspace = useRef<Workspace | null>(null);
  useEffect(() => {
    latest.current = workspace;
  }, [workspace]);

  useEffect(() => {
    let live = true;
    repository.load().then((loaded) => {
      if (live) applyAction({ type: 'replaceAll', workspace: loaded });
    });
    return () => {
      live = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!workspace || savingPaused || previewing) return;
    const timer = setTimeout(() => {
      repository.save(workspace).catch(() => {
        setToast({ message: 'Changes are not being saved in this browser' });
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [workspace, savingPaused, previewing, repository]);

  useEffect(() => {
    const flush = () => {
      const current = realWorkspace.current ?? latest.current;
      if (current) repository.save(current).catch(() => undefined);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [repository]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // A timer can't outlive its card, or keep running once the card is finished.
  useEffect(() => {
    const timer = workspace?.timer;
    if (!workspace || !timer || savingPaused) return;
    const found = findCard(workspace, timer.cardId);
    if (found && !isCardDone(found.board, found.card.id)) return;

    const at = Date.now();
    applyAction({ type: 'stopTimer', sessionId: uid(), at });
    if (found) {
      const seconds = Math.round((at - timer.startedAt) / 1000);
      if (seconds >= MIN_SESSION_SECONDS) {
        setToast({ message: `Timer stopped, ${formatDuration(seconds)} saved` });
      }
    }
  }, [workspace, savingPaused]);

  // Undo restores a full snapshot, so any later change retires the offer.
  const dispatch = useCallback((action: WorkspaceAction) => {
    setToast((current) => (current?.undo ? null : current));
    applyAction(action);
  }, []);

  const dispatchWithUndo = useCallback((action: WorkspaceAction, message: string) => {
    if (!latest.current) return;
    setToast({ message, undo: latest.current });
    applyAction(action);
  }, []);

  const undo = useCallback(() => {
    if (toast?.undo) applyAction({ type: 'replaceAll', workspace: toast.undo });
    setToast(null);
  }, [toast]);

  const replaceWorkspace = useCallback((next: Workspace) => {
    setToast((current) => (current?.undo ? null : current));
    applyAction({ type: 'replaceAll', workspace: next });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  const notify = useCallback((message: string) => setToast({ message }), []);

  /** Shows throwaway data. Nothing is saved until endPreview brings yours back. */
  const beginPreview = useCallback(
    (sample: Workspace) => {
      if (!latest.current) return;
      realWorkspace.current = latest.current;
      repository.save(latest.current).catch(() => undefined);
      setPreviewing(true);
      setToast(null);
      applyAction({ type: 'replaceAll', workspace: sample });
    },
    [repository],
  );

  const endPreview = useCallback(() => {
    if (realWorkspace.current) {
      applyAction({ type: 'replaceAll', workspace: realWorkspace.current });
    }
    realWorkspace.current = null;
    setPreviewing(false);
  }, []);

  return {
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
  };
}
