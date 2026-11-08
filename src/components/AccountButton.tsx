import type { CloudUser } from '../board/cloud';
import type { SyncStatus } from '../board/useCloudSync';
import { UserIcon } from './Icons';
import { Menu } from './Menu';

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: 'Not syncing',
  syncing: 'Saving',
  synced: 'All changes saved',
  error: 'Offline. Your changes are safe here and will sync later.',
};

type AccountButtonProps = {
  user: CloudUser | null;
  status: SyncStatus;
  onSignIn: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
};

export function AccountButton({ user, status, onSignIn, onSignOut, onDeleteAccount }: AccountButtonProps) {
  if (!user) {
    return (
      <button type="button" className="btn btn--soft account-signin" aria-label="Sign in" onClick={onSignIn}>
        <UserIcon />
        <span>Sign in</span>
      </button>
    );
  }

  return (
    <Menu
      label="Account"
      triggerClass="account-avatar"
      triggerContent={
        <>
          {(user.email[0] ?? '?').toUpperCase()}
          <i className={`sync-dot sync-dot--${status}`} aria-hidden="true" />
        </>
      }
      header={
        <div className="account-head">
          <strong>{user.email}</strong>
          <span role="status">{STATUS_TEXT[status]}</span>
        </div>
      }
      items={[
        { label: 'Sign out', onSelect: onSignOut },
        { label: 'Delete account', danger: true, onSelect: onDeleteAccount },
      ]}
    />
  );
}
