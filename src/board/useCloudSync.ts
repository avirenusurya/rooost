import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteCloudAccount,
  fetchCloud,
  insertCloud,
  supabase,
  updateCloud,
  type CloudUser,
} from './cloud';
import { normalizeWorkspace } from './repository';
import { mergeImport } from './transfer';
import { createWorkspace, type Workspace } from './types';

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'error';

export type SyncChoice = {
  kind: 'first-link' | 'conflict';
  remote: Workspace;
  version: number;
};

const META_KEY = 'rooost.sync.v1';
const BACKUP_KEY = 'rooost.workspace.before-sync';
const PUSH_DELAY_MS = 1200;
const BUSY_RETRY_MS = 400;

type SyncMeta = { userId: string; version: number; dirty: boolean };

function readMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as SyncMeta) : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta | null) {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    // Without storage, this visit still syncs from memory.
  }
}

function backUp(workspace: Workspace) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(workspace));
  } catch {
    // Best effort only.
  }
}

function isPristine(workspace: Workspace) {
  return (
    workspace.boards.length === 1 &&
    Object.keys(workspace.boards[0].cards).length === 0 &&
    workspace.sessions.length === 0
  );
}

function sameContent(a: Workspace, b: Workspace) {
  const content = (workspace: Workspace) =>
    JSON.stringify({ boards: workspace.boards, sessions: workspace.sessions, labels: workspace.labels });
  return content(a) === content(b);
}

/** Which board is open belongs to this device, not the account. */
function keepOpenBoard(remote: Workspace, local: Workspace | null): Workspace {
  if (!local || !remote.boards.some((board) => board.id === local.activeBoardId)) return remote;
  return { ...remote, activeBoardId: local.activeBoardId };
}

type CloudSyncOptions = {
  workspace: Workspace | null;
  applyRemote: (workspace: Workspace) => void;
  paused: boolean;
  enabled: boolean;
};

export function useCloudSync({ workspace, applyRemote, paused, enabled }: CloudSyncOptions) {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [status, setStatus] = useState<SyncStatus>('off');
  const [choice, setChoice] = useState<SyncChoice | null>(null);
  const [ready, setReady] = useState(false);

  const latest = useRef<Workspace | null>(null);
  const lastKnown = useRef<Workspace | null>(null);
  const userRef = useRef<CloudUser | null>(null);
  const version = useRef<number | null>(null);
  const dirty = useRef(false);
  const busy = useRef(false);
  const pausedRef = useRef(paused);
  const choiceRef = useRef<SyncChoice | null>(null);

  latest.current = workspace;
  pausedRef.current = paused;
  choiceRef.current = choice;

  useEffect(() => {
    if (!enabled) return;
    const adopt = (session: { user: { id: string; email?: string } } | null) => {
      const next = session ? { id: session.user.id, email: session.user.email ?? '' } : null;
      setUser((current) => (current?.id === next?.id ? current : next));
    };
    void supabase.auth.getSession().then(({ data }) => adopt(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => adopt(session));
    return () => data.subscription.unsubscribe();
  }, [enabled]);

  const remember = useCallback((userId: string, nextVersion: number, known: Workspace) => {
    version.current = nextVersion;
    lastKnown.current = known;
    dirty.current = false;
    writeMeta({ userId, version: nextVersion, dirty: false });
  }, []);

  const adoptRemote = useCallback(
    (userId: string, remote: Workspace, nextVersion: number) => {
      const adjusted = keepOpenBoard(remote, latest.current);
      remember(userId, nextVersion, adjusted);
      applyRemote(adjusted);
    },
    [applyRemote, remember],
  );

  const showConflict = useCallback(async (userId: string) => {
    const row = await fetchCloud(userId);
    const remote = row && normalizeWorkspace(row.data);
    if (!row || !remote) throw new Error('Unreadable workspace');
    setChoice({ kind: 'conflict', remote, version: row.version });
    setStatus('synced');
  }, []);

  /** Sends this device's workspace. The caller must hold the busy flag. */
  const sendNow = useCallback(
    async (userId: string) => {
      const snapshot = latest.current;
      if (!snapshot || version.current === null) return;
      const next = await updateCloud(userId, snapshot, version.current);
      if (next === null) {
        await showConflict(userId);
        return;
      }
      version.current = next;
      lastKnown.current = snapshot;
      dirty.current = latest.current !== snapshot;
      writeMeta({ userId, version: next, dirty: dirty.current });
      setStatus(dirty.current ? 'syncing' : 'synced');
    },
    [showConflict],
  );

  const push = useCallback(async () => {
    const me = userRef.current;
    if (!me || pausedRef.current || choiceRef.current) return;
    if (busy.current) {
      setTimeout(() => void push(), BUSY_RETRY_MS);
      return;
    }
    busy.current = true;
    try {
      await sendNow(me.id);
    } catch {
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [sendNow]);

  const reconcile = useCallback(async () => {
    const me = userRef.current;
    if (!me || busy.current || pausedRef.current || choiceRef.current || !latest.current) return;
    busy.current = true;
    setStatus('syncing');
    try {
      const row = await fetchCloud(me.id);
      if (userRef.current?.id !== me.id) return;
      const local = latest.current;

      if (version.current === null) {
        const meta = readMeta();
        if (meta?.userId === me.id) {
          version.current = meta.version;
          dirty.current = meta.dirty;
        }
      }

      if (!row) {
        remember(me.id, await insertCloud(me.id, local), local);
        setStatus('synced');
        setReady(true);
        return;
      }

      const remote = normalizeWorkspace(row.data);
      if (!remote) throw new Error('Unreadable workspace');

      if (version.current === null) {
        // This browser hasn't been linked to this account before.
        if (isPristine(local)) {
          adoptRemote(me.id, remote, row.version);
        } else if (sameContent(local, remote)) {
          remember(me.id, row.version, local);
        } else {
          setChoice({ kind: 'first-link', remote, version: row.version });
          setStatus('synced');
          return;
        }
      } else if (row.version === version.current) {
        if (dirty.current) {
          await sendNow(me.id);
          setReady(true);
          return;
        }
        if (!lastKnown.current) lastKnown.current = local;
      } else if (dirty.current) {
        setChoice({ kind: 'conflict', remote, version: row.version });
        setStatus('synced');
        setReady(true);
        return;
      } else {
        adoptRemote(me.id, remote, row.version);
      }

      setStatus('synced');
      setReady(true);
    } catch {
      setStatus('error');
    } finally {
      busy.current = false;
    }
  }, [adoptRemote, remember, sendNow]);

  const hasWorkspace = workspace !== null;
  useEffect(() => {
    userRef.current = user;
    if (!user) {
      version.current = null;
      dirty.current = false;
      lastKnown.current = null;
      setReady(false);
      setChoice(null);
      setStatus('off');
      return;
    }
    if (hasWorkspace && !paused && !ready) void reconcile();
  }, [user, hasWorkspace, paused, ready, reconcile]);

  // Coming back to this tab or back online picks up work from other devices.
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user, reconcile]);

  useEffect(() => {
    if (!workspace || !user || !ready || paused || choice) return;
    if (workspace === lastKnown.current) return;
    dirty.current = true;
    if (version.current !== null) {
      writeMeta({ userId: user.id, version: version.current, dirty: true });
    }
    setStatus('syncing');
    const timer = setTimeout(() => void push(), PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [workspace, user, ready, paused, choice, push]);

  const resolveChoice = useCallback(
    (action: 'merge' | 'use-remote' | 'keep-mine') => {
      const me = userRef.current;
      const current = choiceRef.current;
      const local = latest.current;
      if (!me || !current || !local) return;
      setChoice(null);
      choiceRef.current = null;

      if (action === 'use-remote') {
        backUp(local);
        adoptRemote(me.id, current.remote, current.version);
        setStatus('synced');
      } else if (action === 'merge') {
        const merged = mergeImport(current.remote, local.boards, local.sessions, local.labels).workspace;
        version.current = current.version;
        dirty.current = true;
        applyRemote({ ...merged, timer: local.timer ?? merged.timer });
      } else {
        version.current = current.version;
        dirty.current = true;
        void push();
      }
      setReady(true);
    },
    [adoptRemote, applyRemote, push],
  );

  const leaveAccount = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    writeMeta(null);
    userRef.current = null;
    setUser(null);
    applyRemote(createWorkspace());
  }, [applyRemote]);

  /** Resolves false if the latest changes couldn't be saved, keeping you signed in. */
  const signOut = useCallback(async () => {
    const me = userRef.current;
    if (!me) return true;
    if (dirty.current) {
      try {
        await sendNow(me.id);
      } catch {
        return false;
      }
      if (dirty.current || choiceRef.current) return false;
    }
    await leaveAccount();
    return true;
  }, [leaveAccount, sendNow]);

  /** Resolves false if the account couldn't be deleted, leaving everything as it was. */
  const deleteAccount = useCallback(async () => {
    if (!userRef.current) return false;
    try {
      await deleteCloudAccount();
    } catch {
      return false;
    }
    try {
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      // Nothing to remove without storage.
    }
    await leaveAccount();
    return true;
  }, [leaveAccount]);

  return { user, status, choice, resolveChoice, signOut, deleteAccount };
}
