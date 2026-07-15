import React, { useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { Expense, Budget, Income, Semester } from '../types';
import { exportData, ExportFormat } from '../utils/exportUtils';
import { logAuditEvent } from '../services/api';
import { APP_CONFIG } from '../config';
import { todayCalendar, startOfMonth, endOfMonth, addMonths, addDays, formatCalendarDate, isWithinRange } from '../utils/dateUtils';
import {
  TableCellsIcon,
  PlusCircleIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon
} from './Icons'; // Swapped to icons already in your project
import { Modal, Button, Label } from './ui';
import BankStatementImport from './BankStatementImport';

export type DateRange = 'this_month' | 'last_month' | 'last_90_days' | 'all_time';

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  allExpenses: Expense[];
  allIncomes: Income[];
  budgets: Budget[];
  semesters: Semester[];
  onImport: (expenses: Omit<Expense, 'id'>[]) => void;
  onRestoreBackup: (payload: {
    expenses: Omit<Expense, 'id'>[];
    incomes: Omit<Income, 'id'>[];
    budgets: Budget[];
    semesters: Semester[];
  }) => Promise<void> | void;
}

const ranges: { id: DateRange; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_90_days', label: 'Last 90 days' },
  { id: 'all_time', label: 'All time' },
];

const DataModal: React.FC<DataModalProps> = ({ isOpen, onClose, allExpenses, allIncomes, budgets, semesters, onImport, onRestoreBackup }) => {
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [includeBudgets, setIncludeBudgets] = useState(true);
  const [format, setFormat] = useState<ExportFormat>('pdf');

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const filteredExpenses = useMemo(() => {
    if (dateRange === 'all_time') return allExpenses;
    const now = new Date();
    // Local calendar-day boundaries, consistent with the dashboard filter.
    let start: string;
    let end: string = todayCalendar();

    switch (dateRange) {
        case 'last_month':
            start = startOfMonth(addMonths(now, -1));
            end = endOfMonth(addMonths(now, -1));
            break;
        case 'last_90_days':
            start = formatCalendarDate(addDays(now, -90));
            break;
        case 'this_month':
        default:
            start = startOfMonth(now);
            break;
    }
    return allExpenses.filter((exp) => isWithinRange(exp.date, start, end));
  }, [allExpenses, dateRange]);

  const handleDownload = () => {
    const dateRangeLabel = ranges.find(r => r.id === dateRange)?.label || 'All Time';
    exportData(format, includeExpenses, filteredExpenses, includeBudgets, budgets, dateRangeLabel);
    logAuditEvent('data_export', {
      format,
      dateRange: dateRangeLabel,
      includeExpenses,
      includeBudgets,
      expenseCount: filteredExpenses.length,
      budgetCount: budgets.length,
    }).catch(() => undefined);
    onClose();
  };

  const handleExportFullBackup = () => {
    const payload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      source: 'intelligent-expense-tracker',
      data: {
        expenses: allExpenses,
        incomes: allIncomes,
        budgets,
        semesters,
      },
      preferences: {
        displayCurrency: localStorage.getItem('displayCurrency') || 'USD',
        customCategories: localStorage.getItem('customCategories'),
        deletedSubcategories: localStorage.getItem('deletedSubcategories'),
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expense_tracker_backup_${todayCalendar()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    logAuditEvent('backup_export', {
      expenses: allExpenses.length,
      incomes: allIncomes.length,
      budgets: budgets.length,
      semesters: semesters.length,
    }).catch(() => undefined);
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
        const file = event.target.files[0];
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith('.csv')) {
          setImportFile(null);
          setImportError('ONLY_CSV_FILES_ALLOWED');
          return;
        }
        if (file.size > APP_CONFIG.maxImportFileSizeBytes) {
          setImportFile(null);
          setImportError(`CSV_FILE_TOO_LARGE_MAX_${Math.floor(APP_CONFIG.maxImportFileSizeBytes / (1024 * 1024))}MB`);
          return;
        }
        setImportFile(file);
        setImportError(null);
    }
  };

  const handleBackupFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith('.json')) {
        setBackupFile(null);
        setBackupError('ONLY_JSON_BACKUP_FILES_ALLOWED');
        return;
      }
      if (file.size > APP_CONFIG.maxBackupFileSizeBytes) {
        setBackupFile(null);
        setBackupError(`BACKUP_FILE_TOO_LARGE_MAX_${Math.floor(APP_CONFIG.maxBackupFileSizeBytes / (1024 * 1024))}MB`);
        return;
      }
      setBackupFile(file);
      setBackupError(null);
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
            if (lines.length - 1 > APP_CONFIG.maxCsvImportRows) {
              throw new Error(`CSV_ROW_LIMIT_EXCEEDED_MAX_${APP_CONFIG.maxCsvImportRows}`);
            }
            
            const header = lines[0].split(',').map(h => h.trim());
            const requiredHeaders = ['title', 'amount', 'category', 'date'];
            if (!requiredHeaders.every(h => header.includes(h))) {
                throw new Error(`MISSING_HEADERS: ${requiredHeaders.join(', ')}`);
            }

            // Parse CSV line handling quoted fields (e.g., "value with, comma")
            const parseCsvLine = (line: string): string[] => {
                const result: string[] = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        // A doubled quote inside a quoted field is a literal quote (RFC 4180).
                        if (inQuotes && line[i + 1] === '"') {
                            current += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            };
            
            let skippedRows = 0;
            const importedExpenses = lines.slice(1).map((line) => {
                if (!line.trim()) return null;
                // Isolate each row: a single malformed row (e.g. an unparseable
                // date) is skipped and counted, never aborting the whole import.
                try {
                    const values = parseCsvLine(line);
                    const entry: any = header.reduce((obj, key, i) => {
                        obj[key] = values[i] ? values[i].replace(/^"|"$/g, '').trim() : undefined;
                        return obj;
                    }, {} as any);

                    if (!entry.title || isNaN(parseFloat(entry.amount)) || !entry.category || !entry.date) {
                        skippedRows++;
                        return null;
                    }

                    const parsedDate = new Date(entry.date);
                    if (isNaN(parsedDate.getTime())) {
                        skippedRows++;
                        return null;
                    }

                    const newExpense: Omit<Expense, 'id'> = {
                        title: entry.title,
                        amount: parseFloat(entry.amount),
                        category: entry.category,
                        date: parsedDate.toISOString().split('T')[0],
                        paymentMethod: entry.paymentMethod || undefined,
                        notes: entry.notes || undefined,
                        isRecurring: entry.isRecurring?.toLowerCase() === 'true',
                    };
                    return newExpense;
                } catch {
                    skippedRows++;
                    return null;
                }
            }).filter((item): item is Omit<Expense, 'id'> => item !== null);

            if (importedExpenses.length === 0) {
                throw new Error(
                    skippedRows > 0 ? `NO_VALID_ROWS (${skippedRows} skipped)` : 'CSV_EMPTY_OR_NO_DATA'
                );
            }

            onImport(importedExpenses);
            logAuditEvent('expense_csv_import', { importedCount: importedExpenses.length, skippedRows }).catch(() => undefined);
            if (skippedRows > 0) {
                toast(`Imported ${importedExpenses.length} rows, skipped ${skippedRows} invalid.`);
            }
            onClose();
        } catch (error: any) {
            setImportError(error.message || "PARSING_FAILURE");
        } finally {
            setIsImporting(false);
        }
    };
    reader.onerror = () => {
        setImportError('FILE_READ_FAILED');
        setIsImporting(false);
    };
    reader.readAsText(importFile);
  };

  const handleRestoreBackup = () => {
    if (!backupFile) {
      setBackupError('BACKUP_FILE_REQUIRED');
      return;
    }

    setIsRestoringBackup(true);
    setBackupError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonText = event.target?.result as string;
        const parsed = JSON.parse(jsonText);

        const backupData = parsed?.data || parsed;
        if (!backupData || !Array.isArray(backupData.expenses) || !Array.isArray(backupData.incomes) || !Array.isArray(backupData.budgets) || !Array.isArray(backupData.semesters)) {
          throw new Error('INVALID_BACKUP_STRUCTURE');
        }

        await onRestoreBackup({
          expenses: backupData.expenses,
          incomes: backupData.incomes,
          budgets: backupData.budgets,
          semesters: backupData.semesters,
        });
        logAuditEvent('backup_restore', {
          expenses: backupData.expenses.length,
          incomes: backupData.incomes.length,
          budgets: backupData.budgets.length,
          semesters: backupData.semesters.length,
        }).catch(() => undefined);

        const prefs = parsed?.preferences;
        if (prefs?.displayCurrency === 'USD' || prefs?.displayCurrency === 'INR') {
          localStorage.setItem('displayCurrency', prefs.displayCurrency);
        }
        if (typeof prefs?.customCategories === 'string') {
          localStorage.setItem('customCategories', prefs.customCategories);
        }
        if (typeof prefs?.deletedSubcategories === 'string') {
          localStorage.setItem('deletedSubcategories', prefs.deletedSubcategories);
        }

        onClose();
      } catch (error: any) {
        setBackupError(error.message || 'BACKUP_RESTORE_FAILED');
      } finally {
        setIsRestoringBackup(false);
      }
    };
    reader.readAsText(backupFile);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export data"
      subtitle="Export, import, or back up your data."
      size="xl"
      labelledById="data-modal-title"
      bodyClassName="space-y-8"
    >

          {/* EXPORT */}
          <div className="space-y-5">
            <div className="flex items-center gap-2">
                <TableCellsIcon className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg md:text-xl font-bold text-app-text">Export data</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="col-span-1 sm:col-span-2">
                <Label>Date range</Label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
                  {ranges.map(range => (
                    <button
                      key={range.id}
                      onClick={() => setDateRange(range.id)}
                      className={`py-2 text-xs font-semibold transition-all rounded-lg ${dateRange === range.id ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-1">
                <Label>Format</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1 bg-surface-2 border border-app-border rounded-xl p-1">
                  <button onClick={() => setFormat('pdf')} className={`py-2 text-xs font-semibold transition-all rounded-lg ${format === 'pdf' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>PDF</button>
                  <button onClick={() => setFormat('csv')} className={`py-2 text-xs font-semibold transition-all rounded-lg ${format === 'csv' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>CSV</button>
                  <button onClick={() => setFormat('quickbooks')} className={`py-2 text-xs font-semibold transition-all rounded-lg ${format === 'quickbooks' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>QuickBooks</button>
                  <button onClick={() => setFormat('xero')} className={`py-2 text-xs font-semibold transition-all rounded-lg ${format === 'xero' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>Xero</button>
                  <button onClick={() => setFormat('tax_csv')} className={`py-2 text-xs font-semibold transition-all rounded-lg ${format === 'tax_csv' ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'}`}>Tax CSV</button>
                </div>
              </div>

              <div className="col-span-1">
                <Label>Include</Label>
                <div className="flex flex-col gap-2">
                    <button onClick={() => setIncludeExpenses(!includeExpenses)} className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all ${includeExpenses ? 'bg-primary text-on-primary border-transparent shadow-glow' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}>
                        Expenses: {includeExpenses ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => setIncludeBudgets(!includeBudgets)} className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all ${includeBudgets ? 'bg-primary text-on-primary border-transparent shadow-glow' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}>
                        Budgets: {includeBudgets ? 'On' : 'Off'}
                    </button>
                </div>
              </div>
            </div>

            <Button
              fullWidth
              onClick={handleDownload}
              disabled={!includeExpenses && !includeBudgets}
              className="py-3.5"
            >
              Download export
            </Button>

            <Button
              variant="secondary"
              fullWidth
              onClick={handleExportFullBackup}
              className="py-3"
            >
              Export full backup (JSON)
            </Button>
          </div>

          <div className="relative flex items-center justify-center py-1">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-app-border" /></div>
            <span className="relative bg-surface px-4 text-[11px] font-medium tracking-[0.12em] text-app-muted uppercase">Import</span>
          </div>

          {/* IMPORT */}
          <div className="space-y-5">
            <div className="flex items-center gap-2">
                <ClipboardDocumentListIcon className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg md:text-xl font-bold text-app-text">Import data</h3>
            </div>

            <input type="file" ref={fileInputRef} accept=".csv" onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border border-dashed border-app-border bg-surface-2 p-6 text-sm font-medium text-app-muted hover:border-app-border-strong hover:text-app-text transition-colors flex flex-col items-center text-center"
            >
              {importFile ? <span className="text-primary break-all">{importFile.name}</span> : "Upload a CSV file"}
            </button>

            {importError && (
              <div role="alert" aria-live="assertive" className="rounded-xl border border-danger/40 bg-danger/10 p-3 flex items-center text-sm font-medium text-danger">
                <ExclamationTriangleIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                Error: {importError}
              </div>
            )}

            <Button
              fullWidth
              onClick={handleImport}
              disabled={isImporting || !importFile}
              className="py-3.5"
            >
              {isImporting ? 'Importing…' : 'Import CSV'}
            </Button>

            <BankStatementImport
              onImport={(expenses) => {
                onImport(expenses);
                toast(`Imported ${expenses.length} transaction(s) from your bank statement.`);
              }}
            />

            <div className="relative flex items-center justify-center py-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-app-border" /></div>
              <span className="relative bg-surface px-4 text-[11px] font-medium tracking-[0.12em] text-app-muted uppercase">Restore backup</span>
            </div>

            <input type="file" ref={backupFileInputRef} accept=".json" onChange={handleBackupFileChange} className="hidden" />
            <button
              onClick={() => backupFileInputRef.current?.click()}
              className="w-full rounded-xl border border-dashed border-app-border bg-surface-2 p-6 text-sm font-medium text-app-muted hover:border-app-border-strong hover:text-app-text transition-colors flex flex-col items-center text-center"
            >
              {backupFile ? <span className="text-primary break-all">{backupFile.name}</span> : 'Upload a backup JSON file'}
            </button>

            {backupError && (
              <div role="alert" aria-live="assertive" className="rounded-xl border border-danger/40 bg-danger/10 p-3 flex items-center text-sm font-medium text-danger">
                <ExclamationTriangleIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                Restore error: {backupError}
              </div>
            )}

            <Button
              variant="secondary"
              fullWidth
              onClick={handleRestoreBackup}
              disabled={isRestoringBackup || !backupFile}
              className="py-3"
            >
              {isRestoringBackup ? 'Restoring backup…' : 'Restore full backup'}
            </Button>
          </div>
    </Modal>
  );
};

export default DataModal;