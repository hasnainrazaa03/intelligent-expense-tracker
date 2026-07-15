import React, { useMemo, useState } from 'react';
import { Expense } from '../types';
import { Button } from './ui';
import { APP_CONFIG } from '../config';
import {
  parseCsvRows,
  autoDetectColumns,
  parseBankTransactions,
  type BankColumnMapping,
  type BankDateFormat,
} from '../utils/bankImport';

interface BankStatementImportProps {
  onImport: (expenses: Omit<Expense, 'id'>[]) => void;
}

const selectCls =
  'w-full bg-surface border border-app-border rounded-lg px-2.5 py-2 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50';

type MappingKey = 'date' | 'description' | 'amount' | 'category';

/** Import an arbitrary bank-statement CSV by mapping its columns to Orbit fields. */
const BankStatementImport: React.FC<BankStatementImportProps> = ({ onImport }) => {
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<BankColumnMapping>>({});
  const [dateFormat, setDateFormat] = useState<BankDateFormat>('auto');
  const [negativeIsExpense, setNegativeIsExpense] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const reset = () => {
    setHeaders(null); setDataRows([]); setMapping({}); setFileName(''); setError(null);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Please choose a .csv file.'); return; }
    if (file.size > APP_CONFIG.maxImportFileSizeBytes) { setError('That file is too large.'); return; }
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCsvRows(String(ev.target?.result || ''));
      if (rows.length < 2) { setError('This CSV has no data rows.'); return; }
      const hdr = rows[0];
      setHeaders(hdr);
      setDataRows(rows.slice(1, 1 + APP_CONFIG.maxCsvImportRows));
      setMapping(autoDetectColumns(hdr));
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  };

  const ready = mapping.date != null && mapping.description != null && mapping.amount != null;

  const preview = useMemo(() => {
    if (!ready) return null;
    return parseBankTransactions(dataRows, mapping as BankColumnMapping, { dateFormat, negativeIsExpense });
  }, [ready, dataRows, mapping, dateFormat, negativeIsExpense]);

  const setCol = (key: MappingKey, value: string) =>
    setMapping((m) => ({ ...m, [key]: value === '' ? undefined : Number(value) }));

  const columnSelect = (key: MappingKey, label: string, optional = false) => (
    <div>
      <label className="block text-[11px] text-app-muted mb-1">{label}</label>
      <select value={mapping[key] ?? ''} onChange={(e) => setCol(key, e.target.value)} className={selectCls} aria-label={label}>
        <option value="">{optional ? '— none —' : 'Select column'}</option>
        {headers!.map((h, i) => (
          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
        ))}
      </select>
    </div>
  );

  const doImport = () => {
    if (!preview || preview.imported === 0) return;
    onImport(preview.expenses);
    reset();
  };

  return (
    <div className="rounded-xl border border-app-border bg-surface-2 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-app-text">Bank statement (CSV)</p>
        <p className="text-[11px] text-app-muted mt-0.5">Import any bank export — pick which columns are the date, description, and amount.</p>
      </div>

      <input
        type="file"
        accept=".csv"
        onChange={onFile}
        aria-label="Bank statement CSV file"
        className="w-full text-xs text-app-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-on-primary file:text-xs file:font-semibold"
      />
      {fileName && <p className="text-[11px] text-app-muted">Loaded: {fileName}</p>}
      {error && <p role="alert" className="text-xs text-danger font-medium">{error}</p>}

      {headers && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {columnSelect('date', 'Date column')}
            {columnSelect('amount', 'Amount column')}
            {columnSelect('description', 'Description column')}
            {columnSelect('category', 'Category (optional)', true)}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-app-muted mb-1">Date format</label>
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as BankDateFormat)} className={selectCls} aria-label="Date format">
                <option value="auto">Auto-detect</option>
                <option value="mdy">MM/DD/YYYY</option>
                <option value="dmy">DD/MM/YYYY</option>
                <option value="ymd">YYYY-MM-DD</option>
              </select>
            </div>
            <label className="flex items-end gap-2 text-xs text-app-muted pb-2 cursor-pointer">
              <input type="checkbox" checked={negativeIsExpense} onChange={(e) => setNegativeIsExpense(e.target.checked)} className="accent-[color:var(--primary)]" />
              Negative amounts are expenses (skip credits)
            </label>
          </div>

          {preview && (
            <p className="text-[11px] text-app-muted tabular-nums">
              {ready
                ? `${preview.imported} transaction(s) ready · ${preview.skipped} skipped`
                : 'Map the date, amount, and description columns to continue.'}
            </p>
          )}

          <Button size="sm" onClick={doImport} disabled={!preview || preview.imported === 0}>
            Import {preview?.imported || 0} expense{(preview?.imported || 0) === 1 ? '' : 's'}
          </Button>
        </>
      )}
    </div>
  );
};

export default BankStatementImport;
