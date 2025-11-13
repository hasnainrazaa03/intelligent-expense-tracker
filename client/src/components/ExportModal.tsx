import React, { useState, useMemo } from 'react';
import { Expense, Budget } from '../types';
import { DateRange } from './Dashboard';
import { exportData } from '../utils/exportUtils';

// Note: This component is now responsible for both Import and Export.
// It has been renamed from ExportModal to DataModal.

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  allExpenses: Expense[];
  budgets: Budget[];
  onImport: (expenses: Omit<Expense, 'id'>[]) => void;
}

const ranges: { id: DateRange; label: string }[] = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_90_days', label: 'Last 90 Days' },
  { id: 'all_time', label: 'All Time' },
];

const DataModal: React.FC<DataModalProps> = ({ isOpen, onClose, allExpenses, budgets, onImport }) => {
  // Export states
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [includeBudgets, setIncludeBudgets] = useState(true);
  const [format, setFormat] = useState<'csv' | 'pdf'>('pdf');

  // Import states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const filteredExpenses = useMemo(() => {
    if (dateRange === 'all_time') return allExpenses;
    
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const getUTCDate = (dateString: string) => new Date(dateString);
    let start, end;
    
    switch (dateRange) {
        case 'this_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
            end = today;
            break;
        case 'last_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            break;
        case 'last_90_days':
            start = new Date(today);
            start.setUTCDate(today.getUTCDate() - 90);
            end = today;
            break;
    }
    return allExpenses.filter(exp => { const d = getUTCDate(exp.date); return d >= start && d <= end; });
  }, [allExpenses, dateRange]);

  const handleDownload = () => {
    const dateRangeLabel = ranges.find(r => r.id === dateRange)?.label || 'All Time';
    exportData(format, includeExpenses, filteredExpenses, includeBudgets, budgets, dateRangeLabel);
    onClose();
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
        setImportFile(event.target.files[0]);
        setImportError(null);
    }
  };

  const handleImport = () => {
    if (!importFile) {
        setImportError("Please select a file to import.");
        return;
    }

    setIsImporting(true);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const csvText = event.target?.result as string;
            const lines = csvText.trim().split(/\r?\n/);
            if (lines.length < 2) throw new Error("CSV file is empty or has no data rows.");
            
            const header = lines[0].split(',').map(h => h.trim());
            const requiredHeaders = ['title', 'amount', 'category', 'date'];
            if (!requiredHeaders.every(h => header.includes(h))) {
                throw new Error(`CSV is missing required headers. Must include: ${requiredHeaders.join(', ')}`);
            }
            
            const importedExpenses: Omit<Expense, 'id'>[] = lines.slice(1).map((line, index) => {
                if (!line.trim()) return null; // Skip empty lines
                
                const values = line.split(',');
                const entry: any = header.reduce((obj, key, i) => {
                    obj[key] = values[i] ? values[i].replace(/"/g, '').trim() : undefined;
                    return obj;
                }, {} as any);

                if (!entry.title || isNaN(parseFloat(entry.amount)) || !entry.category || !entry.date) {
                    console.warn(`Skipping invalid row #${index + 2}:`, line);
                    return null;
                }

                // FIX: Explicitly type the object to match Omit<Expense, 'id'>.
                // This resolves the type predicate error by ensuring the object shape
                // from the map function is compatible with the filter's type guard.
                const newExpense: Omit<Expense, 'id'> = {
                    title: entry.title,
                    amount: parseFloat(entry.amount),
                    category: entry.category,
                    date: new Date(entry.date).toISOString().split('T')[0],
                    paymentMethod: entry.paymentMethod || undefined,
                    notes: entry.notes || undefined,
                    isRecurring: entry.isRecurring?.toLowerCase() === 'true',
                };
                return newExpense;
            }).filter((item): item is Omit<Expense, 'id'> => item !== null);

            onImport(importedExpenses);
            onClose();

        } catch (error: any) {
            setImportError(error.message || "An error occurred during parsing.");
        } finally {
            setIsImporting(false);
        }
    };

    reader.onerror = () => {
        setImportError("Failed to read the file.");
        setIsImporting(false);
    };

    reader.readAsText(importFile);
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-base-100 dark:bg-dark-200 rounded-2xl shadow-xl w-full max-w-lg m-4" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-base-200 dark:border-dark-300">
            <h2 className="text-2xl font-bold text-base-content dark:text-base-100">Export / Import Data</h2>
        </div>
        
        <div className="p-6 space-y-6">
            {/* --- EXPORT SECTION --- */}
            <div>
              <h3 className="text-lg font-semibold text-base-content dark:text-base-100 mb-3">Export Data</h3>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-base-content-secondary dark:text-base-300 mb-2">Date Range</label>
                      <div className="flex flex-wrap items-center gap-2 bg-base-200 dark:bg-dark-300 p-1 rounded-lg">
                          {ranges.map(range => (
                              <button key={range.id} onClick={() => setDateRange(range.id)}
                                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                                  dateRange === range.id ? 'bg-brand-primary text-white shadow' : 'text-base-content-secondary dark:text-base-300 hover:bg-base-300/50 dark:hover:bg-dark-100'}`}>
                                  {range.label}
                              </button>
                          ))}
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-base-content-secondary dark:text-base-300 mb-2">Data to Include</label>
                      <div className="space-y-2">
                          <div className="flex items-center"><input id="inc-exp" type="checkbox" checked={includeExpenses} onChange={e => setIncludeExpenses(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary" /><label htmlFor="inc-exp" className="ml-2 block text-sm text-base-content dark:text-base-200">Expenses</label></div>
                          <div className="flex items-center"><input id="inc-bud" type="checkbox" checked={includeBudgets} onChange={e => setIncludeBudgets(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary" /><label htmlFor="inc-bud" className="ml-2 block text-sm text-base-content dark:text-base-200">Budgets</label></div>
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-base-content-secondary dark:text-base-300 mb-2">Format</label>
                      <div className="mt-1 grid grid-cols-2 gap-2 rounded-md bg-base-200 dark:bg-dark-300 p-1">
                          <button type="button" onClick={() => setFormat('pdf')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${format === 'pdf' ? 'bg-brand-primary text-white shadow' : 'text-base-content-secondary dark:text-base-300'}`}>PDF</button>
                          <button type="button" onClick={() => setFormat('csv')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${format === 'csv' ? 'bg-brand-primary text-white shadow' : 'text-base-content-secondary dark:text-base-300'}`}>CSV</button>
                      </div>
                  </div>
              </div>
            </div>

            {/* --- DIVIDER --- */}
            <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-base-300 dark:border-dark-300" /></div>
                <div className="relative flex justify-center"><span className="px-2 bg-base-100 dark:bg-dark-200 text-sm text-base-content-secondary dark:text-base-300">OR</span></div>
            </div>

            {/* --- IMPORT SECTION --- */}
            <div>
              <h3 className="text-lg font-semibold text-base-content dark:text-base-100 mb-3">Import Expenses from CSV</h3>
              <p className="text-sm text-base-content-secondary dark:text-base-300 mb-3">
                The CSV file should match the export format. Required columns: <strong>title, amount, category, date</strong>. Optional: <strong>paymentMethod, notes, isRecurring</strong>.
              </p>
              <div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-base-content-secondary dark:text-base-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20"
                />
                 {importError && <p className="text-red-500 text-sm mt-2">{importError}</p>}
              </div>
            </div>

        </div>
        
        <div className="flex justify-between items-center p-4 bg-base-200/50 dark:bg-dark-300/50 rounded-b-2xl space-x-3">
            <div>
                <button onClick={handleImport} disabled={isImporting || !importFile} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                    {isImporting ? 'Importing...' : 'Import CSV'}
                </button>
            </div>
            <div className="flex space-x-3">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-base-100 dark:bg-dark-200 text-base-content dark:text-base-200 rounded-md hover:bg-base-300/70 dark:hover:bg-dark-100 border border-base-300 dark:border-dark-100 transition-colors">Cancel</button>
                <button onClick={handleDownload} disabled={!includeExpenses && !includeBudgets} className="px-5 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-secondary transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">Download</button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default DataModal;