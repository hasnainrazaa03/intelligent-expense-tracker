import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import useModalFocusTrap from '../hooks/useModalFocusTrap';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: string;
  isLoading: boolean;
  error: string | null;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ isOpen, onClose, analysis, isLoading, error }) => {
  const modalRef = useModalFocusTrap<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;

  const parsedAnalysis = analysis ? DOMPurify.sanitize(marked.parse(analysis) as string) : '';

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[100] flex justify-center items-center p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI financial audit report"
        className="modal-surface rounded-2xl w-full max-w-2xl mx-auto transform transition-all duration-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 md:p-6 border-b border-app-border flex justify-between items-center">
            <h2 className="font-display font-bold text-lg md:text-2xl text-app-text tracking-tight truncate pr-4">AI financial audit report</h2>
            <button onClick={onClose} className="text-app-muted hover:text-app-text text-xl flex-shrink-0"> [X] </button>
        </div>

        <div className="p-4 md:p-8 h-[70vh] md:h-[60vh] overflow-y-auto custom-scrollbar">
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-10 h-10 md:w-12 md:h-12 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-xs md:text-sm text-app-muted animate-pulse tracking-widest text-center">Analyzing…</p>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-danger/40 bg-surface-2 text-danger p-4 md:p-6 flex flex-col items-center text-center">
                <p className="font-display font-semibold text-base md:text-lg mb-2">Something went wrong</p>
                <p className="text-[10px] md:text-xs opacity-80 italic leading-tight">{error}</p>
              </div>
            )}

            {!isLoading && !error && analysis && (
              <div
                className="ai-markdown prose prose-sm md:prose-base max-w-none leading-relaxed text-app-text"
                dangerouslySetInnerHTML={{ __html: parsedAnalysis }}
              />
            )}
        </div>

        <div className="p-4 md:p-6 border-t border-app-border flex justify-center md:justify-end">
          <button
            onClick={onClose}
            className="w-full md:w-auto px-6 md:px-10 py-3 bg-primary text-on-primary rounded-xl font-semibold text-base md:text-lg shadow-glow hover:brightness-110 active:scale-[0.99] transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisModal;