import { useState } from 'react';
import { formatDuration } from '../board/dates';
import type { Timer } from '../board/types';
import { ConfirmDialog } from './ConfirmDialog';

type StaleTimerDialogProps = {
  timer: Timer;
  onKeepGoing: () => void;
  onSave: (seconds: number) => void;
};

export function StaleTimerDialog({ timer, onKeepGoing, onSave }: StaleTimerDialogProps) {
  const [elapsed] = useState(() => Math.round((Date.now() - timer.startedAt) / 1000));
  const [hours, setHours] = useState(() => String(Math.floor(elapsed / 3600)));
  const [minutes, setMinutes] = useState(() => String(Math.floor((elapsed % 3600) / 60)));

  const toNumber = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

  return (
    <ConfirmDialog
      title="Still working?"
      cancelLabel="Still working"
      confirmLabel="Stop and save"
      onCancel={onKeepGoing}
      onConfirm={() => onSave(toNumber(hours) * 3600 + toNumber(minutes) * 60)}
    >
      <p className="confirm-text">
        “{timer.cardTitle}” has been running for {formatDuration(elapsed)}. If you forgot it, set the
        time you actually worked.
      </p>
      <div className="confirm-time">
        <label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
          hours
        </label>
        <label>
          <input
            type="number"
            min={0}
            max={59}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
          minutes
        </label>
      </div>
    </ConfirmDialog>
  );
}
