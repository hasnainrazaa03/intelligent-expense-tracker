import React from 'react';
import { ExclamationTriangleIcon } from './Icons';

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
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-danger text-white hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {loading ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
