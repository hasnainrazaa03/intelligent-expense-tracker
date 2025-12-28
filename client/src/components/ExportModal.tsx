import React, { useState, useMemo, useRef } from 'react';
import { Expense, Budget } from '../types';
import { exportData } from '../utils/exportUtils';
import { 
  XMarkIcon, 
  TableCellsIcon, 
  PlusCircleIcon, 
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon 
} from './Icons'; // Swapped to icons already in your project

export type DateRange = 'this_month' | 'last_month' | 'last_90_days' | 'all_time';

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  allExpenses: Expense[];
  budgets: Budget[];
  onImport: (expenses: Omit<Expense, 'id'>[]) => void;
}

const ranges: { id: DateRange; label: string }[] = [
  { id: 'this_month', label: 'THIS_MONTH' },
  { id: 'last_month', label: 'LAST_MONTH' },
  { id: 'last_90_days', label: '90_DAYS' },
  { id: 'all_time', label: 'ALL_TIME' },
];

const DataModal: React.FC<DataModalProps> = ({ isOpen, onClose, allExpenses, budgets, onImport }) => {
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [includeBudgets, setIncludeBudgets] = useState(true);
  const [format, setFormat] = useState<'csv' | 'pdf'>('pdf');

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredExpenses = useMemo(() => {
    if (dateRange === 'all_time') return allExpenses;
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const getUTCDate = (dateString: string) => new Date(dateString);
    let start: Date = new Date(), end: Date = today;
    
    switch (dateRange) {
        case 'this_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
            break;
        case 'last_month':
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            break;
        case 'last_90_days':
            start = new Date(today);
            start.setUTCDate(today.getUTCDate() - 90);
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
        setImportError("FILE_SELECTION_REQUIRED");
        return;
    }
    setIsImporting(true);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const csvText = event.target?.result as string;
            const lines = csvText.trim().split(/\r?\n/);
            if (lines.length < 2) throw new Error("CSV_EMPTY_OR_NO_DATA");
            
            const header = lines[0].split(',').map(h => h.trim());
            const requiredHeaders = ['title', 'amount', 'category', 'date'];
            if (!requiredHeaders.every(h => header.includes(h))) {
                throw new Error(`MISSING_HEADERS: ${requiredHeaders.join(', ')}`);
            }
            
            const importedExpenses = lines.slice(1).map((line) => {
                if (!line.trim()) return null;
                const values = line.split(',');
                const entry: any = header.reduce((obj, key, i) => {
                    obj[key] = values[i] ? values[i].replace(/"/g, '').trim() : undefined;
                    return obj;
                }, {} as any);

                if (!entry.title || isNaN(parseFloat(entry.amount)) || !entry.category || !entry.date) return null;

                // FIXED TYPE PREDICATE LOGIC:
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
            setImportError(error.message || "PARSING_FAILURE");
        } finally {
            setIsImporting(false);
        }
    };
    reader.readAsText(importFile);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink/90 backdrop-blur-md z-[100] flex justify-center items-center p-2 sm:p-4">
      <div className="bg-bone border-4 md:border-8 border-ink shadow-neo-gold w-full max-w-xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* HEADER */}
        <div className="bg-usc-cardinal p-4 md:p-6 border-b-4 md:border-b-8 border-ink flex justify-between items-center flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-loud text-xl md:text-3xl text-bone leading-none uppercase truncate">DATA_TRANSFER_HUB</h2>
            <p className="text-[8px] md:text-[10px] font-mono text-bone/60 mt-1 uppercase">Link: Secure_Active</p>
          </div>
          <button onClick={onClose} className="bg-ink text-bone p-1 border-2 border-bone">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 md:p-8 space-y-8 overflow-y-auto bg-bone">
          
          {/* EXPORT */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <TableCellsIcon className="h-5 w-5 text-usc-gold" />
                <h3 className="font-loud text-lg md:text-xl text-ink uppercase">Export_Data_Manifest</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="col-span-1 sm:col-span-2">
                <label className="font-loud text-[9px] text-ink/40 mb-2 block">DATE_RANGE_SELECTOR</label>
                <div className="grid grid-cols-2 lg:grid-cols-4 bg-ink border-4 border-ink p-1">
                  {ranges.map(range => (
                    <button 
                      key={range.id} 
                      onClick={() => setDateRange(range.id)}
                      className={`py-2 text-[9px] font-loud transition-all ${dateRange === range.id ? 'bg-usc-gold text-ink' : 'text-bone hover:bg-white/10'}`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-1">
                <label className="font-loud text-[9px] text-ink/40 mb-2 block uppercase">Format</label>
                <div className="grid grid-cols-2 bg-ink border-4 border-ink p-1">
                  <button onClick={() => setFormat('pdf')} className={`py-2 font-loud text-xs ${format === 'pdf' ? 'bg-usc-gold text-ink' : 'text-bone'}`}>PDF</button>
                  <button onClick={() => setFormat('csv')} className={`py-2 font-loud text-xs ${format === 'csv' ? 'bg-usc-gold text-ink' : 'text-bone'}`}>CSV</button>
                </div>
              </div>

              <div className="col-span-1">
                <label className="font-loud text-[10px] text-ink/40 dark:text-bone/40 mb-2 block uppercase">Inclusion</label>
                <div className="flex flex-col gap-2">
                    <button onClick={() => setIncludeExpenses(!includeExpenses)} className={`text-left font-loud text-[10px] px-2 py-1 border-2 border-ink ${includeExpenses ? 'bg-usc-cardinal text-bone' : 'bg-white text-ink opacity-30'}`}>
                        EXPENSES: {includeExpenses ? 'ON' : 'OFF'}
                    </button>
                    <button onClick={() => setIncludeBudgets(!includeBudgets)} className={`text-left font-loud text-[10px] px-2 py-1 border-2 border-ink ${includeBudgets ? 'bg-usc-cardinal text-bone' : 'bg-white text-ink opacity-30'}`}>
                        BUDGETS: {includeBudgets ? 'ON' : 'OFF'}
                    </button>
                </div>
              </div>
            </div>

            <button 
              onClick={handleDownload} 
              disabled={!includeExpenses && !includeBudgets}
              className="w-full bg-usc-gold text-ink font-loud text-lg py-4 border-4 border-ink shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-30"
            >
              DOWNLOAD_MANIFEST
            </button>
          </div>

          <div className="relative flex items-center justify-center py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t-4 border-dashed border-ink/10" /></div>
            <span className="relative bg-bone px-4 font-loud text-[10px] opacity-30 uppercase">Direction_Swap</span>
          </div>

          {/* IMPORT */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <ClipboardDocumentListIcon className="h-5 w-5 text-usc-gold" />
                <h3 className="font-loud text-lg md:text-xl text-ink uppercase">Import_Stream</h3>
            </div>
            
            <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileChange} className="hidden" />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-white border-4 border-ink border-dashed p-6 font-loud text-ink flex flex-col items-center text-center"
            >
              {importFile ? <span className="text-usc-gold break-all">{importFile.name.toUpperCase()}</span> : "UPLOAD_LOCAL_CSV_MANIFEST"}
            </button>

            {importError && (
              <div className="bg-ink text-usc-cardinal p-3 border-2 border-ink shadow-neo flex items-center font-bold text-[10px] uppercase italic">
                <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                Error: {importError}
              </div>
            )}

            <button 
              onClick={handleImport} 
              disabled={isImporting || !importFile}
              className="w-full bg-ink text-bone font-loud text-lg py-4 border-4 border-ink shadow-neo-gold hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-30"
            >
              {isImporting ? 'INGESTING...' : 'INITIALIZE_IMPORT'}
            </button>
          </div>
        </div>
        
        <div className="bg-ink p-4 flex justify-center border-t-4 border-ink">
          <p className="font-mono text-[8px] text-bone/20 uppercase tracking-[0.4em] select-none italic">Verified_by_Trojan_Audit</p>
        </div>
      </div>
    </div>
  );
};

export default DataModal;