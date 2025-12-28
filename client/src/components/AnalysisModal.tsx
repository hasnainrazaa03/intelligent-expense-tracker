import React from 'react';
import { marked } from 'marked';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: string;
  isLoading: boolean;
  error: string | null;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ isOpen, onClose, analysis, isLoading, error }) => {
  if (!isOpen) return null;

  const parsedAnalysis = analysis ? marked.parse(analysis) : '';

  return (
    <div 
      className="fixed inset-0 bg-ink/90 backdrop-blur-sm z-[100] flex justify-center items-center p-4" 
      onClick={onClose}
    >
      <div 
        className="bg-bone border-4 md:border-8 border-ink shadow-neo-gold w-full max-w-2xl mx-auto transform transition-all duration-200 overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-ink p-4 md:p-6 border-b-4 md:border-b-8 border-ink flex justify-between items-center">
            <h2 className="font-loud text-lg md:text-2xl text-bone tracking-tighter truncate pr-4">AI_FINANCIAL_AUDIT_REPORT</h2>
            <button onClick={onClose} className="text-bone hover:text-usc-gold font-mono text-xl flex-shrink-0"> [X] </button>
        </div>
        
        <div className="p-4 md:p-8 h-[70vh] md:h-[60vh] overflow-y-auto bg-white custom-scrollbar">
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-10 h-10 md:w-12 md:h-12 border-4 border-ink border-t-usc-gold animate-spin" />
                <p className="font-loud text-xs md:text-sm text-ink animate-pulse tracking-widest text-center">INGESTING_DATA_STREAM...</p>
              </div>
            )}
            
            {error && (
              <div className="bg-usc-cardinal text-bone p-4 md:p-6 border-4 border-ink shadow-neo flex flex-col items-center text-center">
                <p className="font-loud text-base md:text-lg mb-2">CRITICAL_SYSTEM_ERROR</p>
                <p className="font-mono text-[10px] md:text-xs opacity-80 uppercase italic leading-tight">{error}</p>
              </div>
            )}

            {!isLoading && !error && analysis && (
              <div 
                className="prose prose-sm md:prose-base prose-ink max-w-none font-medium leading-relaxed"
                dangerouslySetInnerHTML={{ __html: parsedAnalysis }}
              />
            )}
        </div>
        
        <div className="p-4 md:p-6 border-t-4 md:border-t-8 border-ink bg-bone flex justify-center md:justify-end">
          <button 
            onClick={onClose} 
            className="w-full md:w-auto px-6 md:px-10 py-3 bg-usc-gold text-ink font-loud text-base md:text-lg border-4 border-ink shadow-neo active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            TERMINATE_SESSION
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisModal;