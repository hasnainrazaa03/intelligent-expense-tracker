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
      className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[110] flex justify-center items-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-bone border-4 border-ink shadow-neo-cardinal w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 md:p-6 border-b-4 border-ink bg-usc-cardinal text-bone flex items-center">
          <ExclamationTriangleIcon className="h-6 w-6 md:h-8 md:w-8 mr-3 flex-shrink-0" />
          <h3 className="font-loud text-lg md:text-2xl uppercase leading-none">{title}</h3>
        </div>
        <div className="p-6 md:p-8 font-bold text-ink uppercase text-xs md:text-sm leading-tight">{children}</div>
        <div className="flex p-3 md:p-4 border-t-4 border-ink gap-3 md:gap-4 bg-bone">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 font-loud text-xs md:text-base border-4 border-ink bg-white text-ink shadow-neo active:translate-x-1 transition-all disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 font-loud text-xs md:text-base border-4 border-ink bg-usc-cardinal text-bone shadow-neo active:translate-x-1 transition-all disabled:opacity-50"
          >
            {loading ? 'PROCESSING...' : 'CONFIRM'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
