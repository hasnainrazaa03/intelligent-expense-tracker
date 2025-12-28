import React, { useState, useCallback } from 'react';
import { getAiAnalysis } from '../services/api'; 
import { Expense, Income } from '../types';
import { SparklesIcon, DocumentMagnifyingGlassIcon, ExclamationTriangleIcon } from './Icons';
import AnalysisModal from './AnalysisModal';

interface AiAnalystProps {
  expenses: Expense[];
  incomes: Income[];
}

const AiAnalyst: React.FC<AiAnalystProps> = ({ expenses, incomes }) => {
  const [analysis, setAnalysis] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleAnalyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAnalysis('');
    setIsModalOpen(true);
    try {
      const result = await getAiAnalysis();
      setAnalysis(result.analysis);
    } catch (e: any) {
      setError(e.message || "SYSTEM_ERROR: ANALYSIS_FAILED");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <>
      <div className="bg-bone border-4 border-ink p-5 md:p-8 shadow-neo-gold relative overflow-hidden group">
        {/* Decorative Technical Stamp */}
        <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity hidden sm:block">
          <SparklesIcon className="h-48 w-48 text-ink" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-ink text-usc-gold p-2 border-2 border-ink shadow-[3px_3px_0px_0px_#FFCC00] flex-shrink-0">
              <DocumentMagnifyingGlassIcon className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <h3 className="font-loud text-xl md:text-2xl text-ink leading-none break-words">
              AI_FINANCIAL_AUDIT
            </h3>
          </div>
          
          <div className="space-y-4 mb-8">
            <p className="font-bold text-xs md:text-sm text-ink/70 leading-tight border-l-4 border-usc-gold pl-4 max-w-full">
              GENERATE A REAL-TIME ARCHITECTURAL BREAKDOWN OF YOUR SPENDING HABITS USING NEURAL ANALYTICS.
            </p>
            <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-tighter opacity-50">System: Ready_to_Process</span>
            </div>
          </div>
          
          <button
            onClick={handleAnalyze}
            disabled={isLoading && isModalOpen}
            className="w-full font-loud text-base md:text-lg flex items-center justify-center px-4 md:px-6 py-3 md:py-4 bg-usc-gold text-ink border-4 border-ink shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading && isModalOpen ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-ink" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                PROCESSING_DATA...
              </div>
            ) : (
              <span className="group-hover:scale-105 transition-transform">INITIALIZE_AUDIT</span>
            )}
          </button>
        </div>

        {/* Error Notification Sticker */}
        {error && (
            <div className="mt-4 p-3 bg-usc-cardinal text-bone border-2 border-ink shadow-neo flex items-center font-bold text-xs uppercase italic">
                <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                {error}
            </div>
        )}
      </div>

      <AnalysisModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        analysis={analysis}
        isLoading={isLoading}
        error={error}
      />
    </>
  );
};

export default AiAnalyst;