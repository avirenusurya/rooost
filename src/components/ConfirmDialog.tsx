import { useLayoutEffect, useRef, type ReactNode } from 'react';

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Defaults to cancelling. Pass a no-op when a real choice is required. */
  onEscape?: () => void;
};

export function ConfirmDialog({
  title,
  children,
  cancelLabel,
  confirmLabel,
  onConfirm,
  onCancel,
  onEscape,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const node = dialog.current;
    if (node && !node.open) {
      node.showModal();
      cancel.current?.focus();
    }
    return () => node?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby="confirm-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          (onEscape ?? onCancel)();
        }
      }}
      onClose={() => {
        if (!dialog.current?.open) (onEscape ?? onCancel)();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <div className="confirm-body">{children}</div>
      <div className="confirm-actions">
        <button ref={cancel} type="button" className="btn btn--soft" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn btn--dark" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
