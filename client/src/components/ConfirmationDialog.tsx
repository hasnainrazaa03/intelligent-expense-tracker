import React from 'react';
import { ExclamationTriangleIcon } from './Icons';
import { Button } from './ui';
import useModalFocusTrap from '../hooks/useModalFocusTrap';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}

/**
 * "Are you sure?" prompt. An alertdialog with the shared modal focus trap
 * (F20): focus starts on Cancel (the safe choice), Tab stays inside, Escape
 * cancels, and focus returns to whatever opened it. It used to have none of
 * these, so keyboard users could tab out behind it.
 */
const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  loading,
}) => {
  const ref = useModalFocusTrap<HTMLDivElement>(isOpen, loading ? undefined : onClose);
  const titleId = React.useId();
  const bodyId = React.useId();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[110] flex justify-center items-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="modal-surface rounded-2xl w-full max-w-sm overflow-hidden"
      >
        <div className="p-5 md:p-6 flex items-center gap-3">
          <div className="grid place-items-center w-10 h-10 rounded-xl bg-danger/15 text-danger flex-shrink-0" aria-hidden="true">
            <ExclamationTriangleIcon className="h-5 w-5" />
          </div>
          <h3 id={titleId} className="font-display text-lg md:text-xl font-bold text-app-text leading-tight">{title}</h3>
        </div>
        <div id={bodyId} className="px-5 md:px-6 pb-2 text-sm text-app-muted leading-relaxed">{children}</div>
        <div className="flex p-4 gap-3">
          <Button variant="secondary" fullWidth className="flex-1" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" fullWidth className="flex-1" onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
