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
      className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300" 
      onClick={onClose}
    >
      <div 
        className="bg-base-100 dark:bg-dark-200 rounded-2xl shadow-xl w-full max-w-2xl m-4 transform transition-all duration-300" 
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-base-200 dark:border-dark-300">
            <h2 className="text-2xl font-bold text-base-content dark:text-base-100">AI Spending Analysis</h2>
        </div>
        
        <div className="p-6 h-[50vh] overflow-y-auto">
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-full">
                <svg className="animate-spin h-10 w-10 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="mt-4 text-base-content-secondary dark:text-base-300">Generating insights...</p>
              </div>
            )}
            
            {error && (
               <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-red-500 font-semibold">An Error Occurred</p>
                <p className="text-base-content-secondary dark:text-base-300 mt-2">{error}</p>
              </div>
            )}

            {!isLoading && !error && analysis && (
              <div 
                className="prose prose-sm sm:prose-base dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: parsedAnalysis }}
              />
            )}
        </div>
        
        <div className="flex justify-end p-4 bg-base-200/50 dark:bg-dark-300/50 rounded-b-2xl">
          <button 
            onClick={onClose} 
            className="px-5 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisModal;