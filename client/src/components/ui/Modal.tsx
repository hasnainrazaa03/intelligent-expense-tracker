import React from 'react';
import { XMarkIcon, ChevronLeftIcon } from '../Icons';
import useModalFocusTrap from '../../hooks/useModalFocusTrap';
import { IconButton } from './Button';
import { cn } from './cn';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-5xl',
  full: 'max-w-[96vw]',
} as const;

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  size?: keyof typeof SIZES;
  /** Sticky footer (e.g. Cancel / Save actions). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes on the body scroll area. */
  bodyClassName?: string;
  labelledById?: string;
  /** Render in the page instead of over it (U2b): a section with its own
   *  address, no overlay or focus trap, and Back instead of the close button. */
  asPage?: boolean;
}

/** Standard Orbit modal shell: dimmed blurred overlay + glass panel + header
 *  (title/subtitle + close) + scrollable body + optional sticky footer. Folds in
 *  the focus trap so every modal traps Tab and closes on Escape / backdrop click. */
export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, subtitle, size = 'lg', footer, children, bodyClassName, labelledById, asPage = false,
}) => {
  const ref = useModalFocusTrap<HTMLDivElement>(isOpen && !asPage, onClose);
  // Every modal is labelled by its own title for screen readers — callers can
  // override with `labelledById`, otherwise a stable generated id is used so no
  // dialog is left unlabeled.
  const autoId = React.useId();
  const titleId = labelledById ?? autoId;
  if (!isOpen) return null;
  if (asPage) {
    return (
      <section aria-labelledby={titleId} className="glass rounded-2xl flex flex-col">
        <div className="p-5 sm:p-6 border-b border-app-border flex items-start gap-3">
          <IconButton onClick={onClose} aria-label="Back" className="flex-shrink-0">
            <ChevronLeftIcon className="h-5 w-5" />
          </IconButton>
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl sm:text-2xl font-bold text-app-text leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-app-muted mt-1">{subtitle}</p>}
          </div>
        </div>
        <div className={cn('p-5 sm:p-6', bodyClassName)}>{children}</div>
        {/* Save stays in reach on a long page; on phones it sits above the bottom bar. */}
        {footer && <div className="sticky bottom-20 md:bottom-0 z-10 modal-surface rounded-b-2xl p-4 sm:p-5 border-t border-app-border flex gap-3">{footer}</div>}
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[100] flex justify-center items-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('modal-surface rounded-2xl w-full flex flex-col max-h-[90vh]', SIZES[size])}
      >
        <div className="p-5 sm:p-6 border-b border-app-border flex justify-between items-start gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-xl sm:text-2xl font-bold text-app-text leading-tight truncate">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-app-muted mt-1">{subtitle}</p>}
          </div>
          <IconButton onClick={onClose} aria-label="Close" className="flex-shrink-0">
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </div>

        <div className={cn('flex-grow overflow-y-auto p-5 sm:p-6', bodyClassName)}>
          {children}
        </div>

        {footer && (
          <div className="p-4 sm:p-5 border-t border-app-border flex gap-3 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
