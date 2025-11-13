import React, { useState, useCallback } from 'react';
// import { getFinancialAnalysis } from '../services/geminiService'; // <-- We no longer use this
import { getAiAnalysis } from '../services/api'; // <-- Use our new API function
import { Expense, Income } from '../types';
import { SparklesIcon, DocumentMagnifyingGlassIcon } from './Icons';
import AnalysisModal from './AnalysisModal';

interface AiAnalystProps {
  expenses: Expense[]; // We still accept these...
  incomes: Income[];   // ...but we don't use them. The server fetches them.
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
      // --- THIS IS THE ONLY CHANGE ---
      // We no longer pass expenses/incomes. The server already knows who we are.
      const result = await getAiAnalysis();
      setAnalysis(result.analysis);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, []); // <-- We can also remove expenses and incomes from the dependency array

  return (
    <>
      <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
        <div className="flex items-center mb-4">
          <SparklesIcon className="h-6 w-6 text-brand-primary" />
          <h2 className="text-2xl font-bold ml-2 text-base-content dark:text-base-100">AI Financial Analyst</h2>
        </div>
        <p className="text-base-content-secondary dark:text-base-300 mb-4">
          Get personalized insights on your cash flow, spending, and savings from Gemini.
        </p>
        
        <button
          onClick={handleAnalyze}
          disabled={isLoading && isModalOpen}
          className="w-full flex items-center justify-center px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-secondary transition-all duration-300 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading && isModalOpen ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Analyzing...
            </>
          ) : (
            <>
              <DocumentMagnifyingGlassIcon className="h-5 w-5 mr-2" />
              Analyze My Finances
            </>
          )}
        </button>
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