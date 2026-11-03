import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, X } from 'lucide-react';
import './ConfirmDialog.css';

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  busy,
  error,
  onConfirm,
  onCancel,
  returnFocusRef,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      (returnFocusRef?.current || previous)?.focus();
    };
  }, [returnFocusRef]);
  return createPortal(
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-description"
      translate="no"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <button className="confirm-close" aria-label={closeLabel} disabled={busy} onClick={onCancel}>
        <X size={19} />
      </button>
      <div className="confirm-symbol">
        <LogOut size={23} />
      </div>
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-description">{description}</p>
      {error && (
        <p className="confirm-error" role="alert">
          {error}
        </p>
      )}
      <div className="confirm-actions">
        <button ref={cancel} autoFocus disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className="confirm-primary" disabled={busy} onClick={onConfirm}>
          <LogOut size={18} aria-hidden="true" />
          {confirmLabel}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
