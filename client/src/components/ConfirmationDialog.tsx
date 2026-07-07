import React from 'react';
import { ExclamationTriangleIcon } from './Icons';
import { Button } from './ui';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  loading,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex justify-center items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="glass glass-blur rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 md:p-6 flex items-center gap-3">
          <div className="grid place-items-center w-10 h-10 rounded-xl bg-danger/15 text-danger flex-shrink-0">
            <ExclamationTriangleIcon className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg md:text-xl font-bold text-app-text leading-tight">{title}</h3>
        </div>
        <div className="px-5 md:px-6 pb-2 text-sm text-app-muted leading-relaxed">{children}</div>
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
