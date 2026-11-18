import React, { useState, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { Expense, Budget, Income, Semester, SettingsPatch } from '../types';
import { getSettings, settingsFromBackup } from '../utils/settingsStore';
import { exportData, ExportFormat } from '../utils/exportUtils';
import { parseTransactionsCsv } from '../utils/transactionsCsv';
import { withoutExisting } from '../utils/duplicates';
import { logAuditEvent } from '../services/api';
import { APP_CONFIG } from '../config';
import { todayCalendar, startOfMonth, endOfMonth, addMonths, addDays, formatCalendarDate, isWithinRange } from '../utils/dateUtils';
import {
  TableCellsIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentListIcon
} from './Icons'; // Swapped to icons already in your project
import { Modal, Button, Label } from './ui';

export type DateRange = 'this_month' | 'last_month' | 'last_90_days' | 'all_time';

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  allExpenses: Expense[];
  allIncomes: Income[];
  budgets: Budget[];
  semesters: Semester[];
  /** Save the rows of an imported CSV; resolves true when everything landed. */
  onImport: (rows: { expenses: Omit<Expense, 'id'>[]; incomes: Omit<Income, 'id'>[] }) => Promise<boolean>;
  /** Opens the dedicated bank-statement import experience. */
  onOpenStatementImport: () => void;
  /** Permanently deletes all of the user's data (already confirmed by the modal). */
  onWipeAll: () => Promise<void> | void;
  onRestoreBackup: (payload: {
    expenses: Omit<Expense, 'id'>[];
    incomes: Omit<Income, 'id'>[];
    budgets: Budget[];
    semesters: Semester[];
    settings?: SettingsPatch;
  }) => Promise<void> | void;
}

const ranges: { id: DateRange; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_90_days', label: 'Last 90 days' },
  { id: 'all_time', label: 'All time' },
];

const DataModal: React.FC<DataModalProps> = ({ isOpen, onClose, allExpenses, allIncomes, budgets, semesters, onImport, onOpenStatementImport, onWipeAll, onRestoreBackup }) => {
  const [dateRange, setDateRange] = useState<DateRange>('this_month');
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [includeIncomes, setIncludeIncomes] = useState(true);
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
  // A validated backup waiting for confirmation. Restore REPLACES everything on
  // the account (the server deletes first), so it never runs on one click.
  const [pendingRestore, setPendingRestore] = useState<null | {
    data: { expenses: any[]; incomes: any[]; budgets: Budget[]; semesters: Semester[] };
    settings: SettingsPatch | undefined;
    exportedAt: string | null;
  }>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');

  // Local calendar-day boundaries, the same as the dashboard's: "This month" is
  // the whole month (it ended today, so rent dated the 30th was left out).
  const inRange = useMemo(() => {
    if (dateRange === 'all_time') return () => true;
    const now = new Date();
    let start: string;
    let end: string;
    switch (dateRange) {
        case 'last_month':
            start = startOfMonth(addMonths(now, -1));
            end = endOfMonth(addMonths(now, -1));
            break;
        case 'last_90_days':
            start = formatCalendarDate(addDays(now, -90));
            end = todayCalendar();
            break;
        case 'this_month':
        default:
            start = startOfMonth(now);
            end = endOfMonth(now);
            break;
    }
    return (date: string) => isWithinRange(date, start, end);
  }, [dateRange]);
  const filteredExpenses = useMemo(() => allExpenses.filter((e) => inRange(e.date)), [allExpenses, inRange]);
  const filteredIncomes = useMemo(() => allIncomes.filter((i) => inRange(i.date)), [allIncomes, inRange]);

  const handleDownload = () => {
    const dateRangeLabel = ranges.find(r => r.id === dateRange)?.label || 'All Time';
    exportData(format, {
      expenses: includeExpenses ? filteredExpenses : [],
      incomes: includeIncomes ? filteredIncomes : [],
      budgets: includeBudgets ? budgets : [],
    }, dateRangeLabel);
    logAuditEvent('data_export', {
      format,
      dateRange: dateRangeLabel,
      includeExpenses,
      includeIncomes,
      includeBudgets,
      expenseCount: filteredExpenses.length,
      incomeCount: filteredIncomes.length,
      budgetCount: budgets.length,
    }).catch(() => undefined);
    onClose();
  };

  const handleExportFullBackup = () => {
    const payload = {
      // 1.1.0: `settings` (goals, accounts, categories, preferences) replaces
      // 1.0.0's `preferences`, which had only the currency and categories.
      version: '1.1.0',
      exportedAt: new Date().toISOString(),
      source: 'intelligent-expense-tracker',
      data: {
        expenses: allExpenses,
        incomes: allIncomes,
        budgets,
        semesters,
      },
      settings: getSettings(),
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
    setPendingRestore(null);
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
    reader.onload = async (event) => {
        try {
            const csvText = event.target?.result as string;
            const parsed = parseTransactionsCsv(csvText, APP_CONFIG.maxCsvImportRows);
            const { skipped: skippedRows, nonPositive } = parsed;
            // Rows already in the account (an export imported back into the
            // same account) are left out rather than duplicated.
            const expenses = withoutExisting(parsed.expenses, allExpenses);
            const incomes = withoutExisting(parsed.incomes, allIncomes);
            const duplicates = expenses.duplicates + incomes.duplicates;
            const rows = expenses.fresh.length + incomes.fresh.length;

            if (rows === 0) {
                throw new Error(
                    duplicates > 0 ? 'Everything in this file is already in your account.'
                    : skippedRows > 0 ? `NO_VALID_ROWS (${skippedRows} skipped)` : 'CSV_EMPTY_OR_NO_DATA'
                );
            }

            if (skippedRows > 0) {
                const refunds = nonPositive > 0 ? ` (${nonPositive} with a zero or negative amount, e.g. refunds)` : '';
                toast(`Imported ${rows} rows, skipped ${skippedRows}${refunds}.`);
            }
            if (duplicates > 0) toast(`Left out ${duplicates} row${duplicates === 1 ? '' : 's'} already in your account.`);
            logAuditEvent('expense_csv_import', { importedCount: rows, skippedRows, duplicates }).catch(() => undefined);
            // Close only once everything is saved; otherwise the file is still
            // selected here to try again (nothing is duplicated, B5).
            if (await onImport({ expenses: expenses.fresh, incomes: incomes.fresh })) onClose();
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

  // Step 1: read and validate the file, then ask for confirmation.
  const handleRestoreBackup = () => {
    if (!backupFile) {
      setBackupError('BACKUP_FILE_REQUIRED');
      return;
    }
    setBackupError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const backupData = parsed?.data || parsed;
        if (!backupData || !Array.isArray(backupData.expenses) || !Array.isArray(backupData.incomes) || !Array.isArray(backupData.budgets) || !Array.isArray(backupData.semesters)) {
          throw new Error('INVALID_BACKUP_STRUCTURE');
        }
        setRestoreConfirm('');
        setPendingRestore({
          data: { expenses: backupData.expenses, incomes: backupData.incomes, budgets: backupData.budgets, semesters: backupData.semesters },
          settings: settingsFromBackup(parsed),
          exportedAt: typeof parsed?.exportedAt === 'string' ? parsed.exportedAt : null,
        });
      } catch (error: any) {
        setBackupError(error instanceof SyntaxError ? 'That file is not valid JSON.' : (error.message || 'BACKUP_RESTORE_FAILED'));
      }
    };
    reader.onerror = () => setBackupError('FILE_READ_FAILED');
    reader.readAsText(backupFile);
  };

  // Step 2: the user confirmed — replace the account's data with the backup.
  const confirmRestoreBackup = async () => {
    if (!pendingRestore || restoreConfirm !== 'REPLACE') return;
    const { data: backupData, settings } = pendingRestore;
    setIsRestoringBackup(true);
    setBackupError(null);
    try {
      await onRestoreBackup({ ...backupData, settings });
      logAuditEvent('backup_restore', {
        expenses: backupData.expenses.length,
        incomes: backupData.incomes.length,
        budgets: backupData.budgets.length,
        semesters: backupData.semesters.length,
      }).catch(() => undefined);


      setPendingRestore(null);
      onClose();
    } catch (error: any) {
      setBackupError(error.message || 'BACKUP_RESTORE_FAILED');
    } finally {
      setIsRestoringBackup(false);
    }
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
                    <button onClick={() => setIncludeIncomes(!includeIncomes)} aria-pressed={includeIncomes} className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all ${includeIncomes ? 'bg-primary text-on-primary border-transparent shadow-glow' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}>
                        Income: {includeIncomes ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => setIncludeBudgets(!includeBudgets)} className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all ${includeBudgets ? 'bg-primary text-on-primary border-transparent shadow-glow' : 'bg-surface-2 border-app-border text-app-muted hover:text-app-text'}`}>
                        Budgets: {includeBudgets ? 'On' : 'Off'}
                    </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-app-muted -mt-2">
              {format === 'csv'
                ? 'CSV puts expenses and income in one file that "Import CSV" below reads back.'
                : format === 'pdf'
                  ? 'The PDF lists each section you include.'
                  : 'This format includes expenses only.'}
            </p>

            <Button
              fullWidth
              onClick={handleDownload}
              disabled={!includeExpenses && !includeIncomes && !includeBudgets}
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

            <button
              onClick={onOpenStatementImport}
              className="w-full text-left rounded-xl border border-app-border bg-surface-2 p-4 hover:border-app-border-strong transition-colors"
            >
              <p className="text-sm font-semibold text-app-text">Import a bank statement · CSV or PDF</p>
              <p className="text-[11px] text-app-muted mt-0.5">Detects expenses <em>and</em> income, with a side-by-side PDF preview and AI-generated details. Review everything before importing.</p>
            </button>

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

            {!pendingRestore ? (
              <Button
                variant="secondary"
                fullWidth
                onClick={handleRestoreBackup}
                disabled={!backupFile}
                className="py-3"
              >
                Restore full backup…
              </Button>
            ) : (
              <div role="group" aria-labelledby="restore-confirm-title" className="rounded-xl border border-danger/40 bg-danger/5 p-4 space-y-3">
                <div>
                  <p id="restore-confirm-title" className="text-sm font-semibold text-app-text">Replace all your data with this backup?</p>
                  <p className="text-[11px] text-app-muted mt-0.5">
                    Everything on your account is deleted first, then the backup is loaded. Anything added since
                    {pendingRestore.exportedAt ? ` ${new Date(pendingRestore.exportedAt).toLocaleDateString()}` : ' the backup was made'} will be lost.
                  </p>
                </div>
                <table className="w-full text-[11px] tabular-nums">
                  <thead>
                    <tr className="text-app-faint text-left"><th className="font-medium py-0.5"></th><th className="font-medium">Now</th><th className="font-medium">After restore</th></tr>
                  </thead>
                  <tbody className="text-app-text">
                    <tr><td className="text-app-muted py-0.5">Expenses</td><td>{allExpenses.length}</td><td>{pendingRestore.data.expenses.length}</td></tr>
                    <tr><td className="text-app-muted py-0.5">Income</td><td>{allIncomes.length}</td><td>{pendingRestore.data.incomes.length}</td></tr>
                    <tr><td className="text-app-muted py-0.5">Budgets</td><td>{budgets.length}</td><td>{pendingRestore.data.budgets.length}</td></tr>
                    <tr><td className="text-app-muted py-0.5">Semesters</td><td>{semesters.length}</td><td>{pendingRestore.data.semesters.length}</td></tr>
                  </tbody>
                </table>
                <button type="button" onClick={handleExportFullBackup} className="text-[11px] font-semibold text-primary hover:underline">
                  Download a backup of my current data first
                </button>
                <div>
                  <label htmlFor="restore-confirm" className="block text-[11px] text-app-muted mb-1">
                    Type <span className="font-semibold text-danger">REPLACE</span> to confirm
                  </label>
                  <input
                    id="restore-confirm"
                    type="text"
                    value={restoreConfirm}
                    onChange={(e) => setRestoreConfirm(e.target.value)}
                    placeholder="REPLACE"
                    autoComplete="off"
                    className="w-full bg-surface border border-app-border rounded-lg px-3 py-2 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-danger/50"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" fullWidth onClick={() => setPendingRestore(null)} disabled={isRestoringBackup}>Cancel</Button>
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={confirmRestoreBackup}
                    disabled={restoreConfirm !== 'REPLACE' || isRestoringBackup}
                    className="!bg-danger/15 !text-danger !border-danger/40 hover:!bg-danger/25 disabled:opacity-50"
                  >
                    {isRestoringBackup ? 'Restoring…' : 'Replace my data'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* --- DANGER ZONE --- */}
          <div className="relative flex items-center justify-center py-1 mt-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-danger/30" /></div>
            <span className="relative bg-surface px-4 text-[11px] font-medium tracking-[0.12em] text-danger uppercase">Danger zone</span>
          </div>

          <div className="rounded-xl border border-danger/40 bg-danger/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-app-text">Delete all my data</p>
              <p className="text-[11px] text-app-muted mt-0.5">
                Permanently deletes every expense, income, budget, semester, receipt, savings goal and account balance on your account. Your categories and preferences stay. This cannot be undone — export a backup first if you might want it back.
              </p>
            </div>
            <div>
              <label htmlFor="wipe-confirm" className="block text-[11px] text-app-muted mb-1">
                Type <span className="font-semibold text-danger">DELETE</span> to confirm
              </label>
              <input
                id="wipe-confirm"
                type="text"
                value={wipeConfirm}
                onChange={(e) => setWipeConfirm(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className="w-full bg-surface border border-app-border rounded-lg px-3 py-2 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-danger/50"
              />
            </div>
            <Button
              variant="secondary"
              fullWidth
              disabled={wipeConfirm !== 'DELETE' || isWiping}
              onClick={async () => {
                setIsWiping(true);
                try { await onWipeAll(); } finally { setIsWiping(false); setWipeConfirm(''); }
              }}
              className="py-3 !bg-danger/15 !text-danger !border-danger/40 hover:!bg-danger/25 disabled:opacity-50"
            >
              {isWiping ? 'Deleting…' : 'Permanently delete all my data'}
            </Button>
          </div>
    </Modal>
  );
};

export default DataModal;