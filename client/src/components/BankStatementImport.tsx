import React, { useMemo, useState } from 'react';
import { Expense, Income } from '../types';
import { Button } from './ui';
import { APP_CONFIG } from '../config';
import { ALL_SUBCATEGORIES, INCOME_CATEGORIES } from '../constants';
import { suggestCategory } from '../services/categorySuggestionService';
import { formatCurrency } from '../utils/currencyUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import { parseStatement } from '../services/api';
import {
  parseCsvRows,
  autoDetectColumns,
  parseBankTransactions,
  type BankColumnMapping,
  type BankDateFormat,
} from '../utils/bankImport';

export interface StatementImportPayload {
  expenses: Omit<Expense, 'id'>[];
  incomes: Omit<Income, 'id'>[];
}

interface BankStatementImportProps {
  onImport: (payload: StatementImportPayload) => void;
  /** Existing rows, used to flag likely-duplicate transactions in the review step. */
  existingExpenses: Expense[];
  existingIncomes: Income[];
}

const selectCls =
  'w-full bg-surface border border-app-border rounded-lg px-2.5 py-2 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50';

type MappingKey = 'date' | 'description' | 'amount' | 'category';
type TxnType = 'income' | 'expense';

interface ReviewRow {
  id: string;
  type: TxnType;
  date: string;
  description: string;
  amount: number;
  category: string;
  paymentMethod?: string;
  include: boolean;
  duplicate: boolean;
}

/** Stable-ish key to spot a transaction that's already been imported. */
const dupeKey = (date: string, amount: number, description: string) =>
  `${date}|${Math.round(amount * 100)}|${description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`;

const defaultCategoryFor = (type: TxnType, description: string): string =>
  type === 'income' ? 'Other' : (suggestCategory(description) || 'Other');

/** Import a bank statement — CSV (column mapping) or PDF (read by AI) — then
 *  review the detected transactions, each classified as expense or income, with
 *  suggested categories and duplicate flagging, before importing what you keep. */
const BankStatementImport: React.FC<BankStatementImportProps> = ({ onImport, existingExpenses, existingIncomes }) => {
  const { displayCurrency, conversionRate } = useCurrency();

  // Upload stage (CSV mapping).
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<BankColumnMapping>>({});
  const [dateFormat, setDateFormat] = useState<BankDateFormat>('auto');
  const [negativeIsExpense, setNegativeIsExpense] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsingPdf, setParsingPdf] = useState(false);

  // Review stage.
  const [rows, setRows] = useState<ReviewRow[] | null>(null);

  const existingExpenseKeys = useMemo(() => {
    const set = new Set<string>();
    for (const e of existingExpenses) set.add(dupeKey(e.date, Number(e.amount), e.title || ''));
    return set;
  }, [existingExpenses]);

  const existingIncomeKeys = useMemo(() => {
    const set = new Set<string>();
    for (const i of existingIncomes) set.add(dupeKey(i.date, Number(i.amount), i.title || ''));
    return set;
  }, [existingIncomes]);

  const reset = () => {
    setHeaders(null); setDataRows([]); setMapping({}); setFileName(''); setError(null);
    setRows(null); setParsingPdf(false);
  };

  /** Turn raw detected items into review rows: suggest a category when missing
   *  and flag rows that match an already-imported transaction of the same type. */
  const buildRows = (
    items: Array<{ type?: string; date: string; description: string; amount: number; category?: string; paymentMethod?: string }>
  ): ReviewRow[] =>
    items.map((it, i) => {
      const type: TxnType = it.type === 'income' ? 'income' : 'expense';
      const validCats = type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
      const aiCat = it.category && it.category !== 'Other' && validCats.includes(it.category) ? it.category : null;
      const category = aiCat || defaultCategoryFor(type, it.description);
      const keys = type === 'income' ? existingIncomeKeys : existingExpenseKeys;
      const duplicate = keys.has(dupeKey(it.date, it.amount, it.description));
      return {
        id: `${i}-${it.date}-${it.amount}`,
        type,
        date: it.date,
        description: it.description,
        amount: it.amount,
        category,
        paymentMethod: it.paymentMethod,
        duplicate,
        include: !duplicate,
      };
    });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isPdf = name.endsWith('.pdf');
    if (!isCsv && !isPdf) { setError('Please choose a .csv or .pdf file.'); return; }
    if (file.size > APP_CONFIG.maxImportFileSizeBytes) { setError('That file is too large.'); return; }
    setError(null);
    setFileName(file.name);
    setRows(null);

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseCsvRows(String(ev.target?.result || ''));
        if (parsed.length < 2) { setError('This CSV has no data rows.'); return; }
        const hdr = parsed[0];
        setHeaders(hdr);
        setDataRows(parsed.slice(1, 1 + APP_CONFIG.maxCsvImportRows));
        setMapping(autoDetectColumns(hdr));
      };
      reader.onerror = () => setError('Could not read that file.');
      reader.readAsText(file);
      return;
    }

    // PDF → send to Gemini for parsing.
    setHeaders(null);
    setParsingPdf(true);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(file);
      });
      const { transactions } = await parseStatement({ pdf: dataUri });
      if (!transactions.length) { setError('No transactions were found in that PDF.'); return; }
      setRows(buildRows(transactions));
    } catch (err: any) {
      setError(
        err?.status === 503
          ? 'AI parsing isn’t configured on the server.'
          : 'Could not read that PDF. Try a CSV export instead.'
      );
    } finally {
      setParsingPdf(false);
    }
  };

  const ready = mapping.date != null && mapping.description != null && mapping.amount != null;

  const csvPreview = useMemo(() => {
    if (!ready || headers == null) return null;
    return parseBankTransactions(dataRows, mapping as BankColumnMapping, { dateFormat, negativeIsExpense });
  }, [ready, headers, dataRows, mapping, dateFormat, negativeIsExpense]);

  const reviewCsv = () => {
    if (!csvPreview || csvPreview.imported === 0) return;
    // A mapped CSV is expense-oriented; rows can be flipped to income in review.
    setRows(buildRows(csvPreview.expenses.map((e) => ({ ...e, type: 'expense', description: e.title }))));
  };

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

  // --- REVIEW STAGE ---
  if (rows) {
    const selected = rows.filter((r) => r.include);
    const selExpenses = selected.filter((r) => r.type === 'expense');
    const selIncomes = selected.filter((r) => r.type === 'income');
    const dupeCount = rows.filter((r) => r.duplicate).length;

    const toggle = (id: string) => setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, include: !r.include } : r)));
    const setCategory = (id: string, category: string) =>
      setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, category } : r)));
    const setType = (id: string, type: TxnType) =>
      setRows((rs) => rs!.map((r) => {
        if (r.id !== id) return r;
        const validCats = type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
        const category = validCats.includes(r.category) ? r.category : defaultCategoryFor(type, r.description);
        return { ...r, type, category };
      }));
    const setAll = (include: boolean) => setRows((rs) => rs!.map((r) => ({ ...r, include })));

    const doImport = () => {
      const expenses: Omit<Expense, 'id'>[] = selExpenses.map((r) => ({
        title: r.description.slice(0, 120),
        amount: r.amount,
        category: r.category,
        date: r.date,
        paymentMethod: r.paymentMethod || undefined,
        isRecurring: false,
      }));
      const incomes: Omit<Income, 'id'>[] = selIncomes.map((r) => ({
        title: r.description.slice(0, 120),
        amount: r.amount,
        category: r.category,
        date: r.date,
      }));
      if (expenses.length === 0 && incomes.length === 0) return;
      onImport({ expenses, incomes });
      reset();
    };

    return (
      <div className="rounded-xl border border-app-border bg-surface-2 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-app-text">Review transactions</p>
            <p className="text-[11px] text-app-muted mt-0.5 tabular-nums">
              {rows.length} detected · {selExpenses.length} expense{selExpenses.length === 1 ? '' : 's'} · {selIncomes.length} income selected{dupeCount > 0 ? ` · ${dupeCount} likely dup${dupeCount === 1 ? '' : 's'} unchecked` : ''}
            </p>
          </div>
          <button onClick={reset} className="text-[11px] font-semibold text-app-faint hover:text-app-text">Start over</button>
        </div>

        <div className="flex gap-3 text-[11px]">
          <button onClick={() => setAll(true)} className="font-semibold text-primary hover:underline">Select all</button>
          <button onClick={() => setAll(false)} className="font-semibold text-app-faint hover:text-app-text">Clear all</button>
        </div>

        <div className="max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-app-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-app-faint">
              <tr className="text-left">
                <th className="p-2 w-8"></th>
                <th className="p-2 font-medium">Type</th>
                <th className="p-2 font-medium">Date</th>
                <th className="p-2 font-medium">Description</th>
                <th className="p-2 font-medium text-right">Amount</th>
                <th className="p-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const catOptions = r.type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
                return (
                  <tr key={r.id} className={`border-t border-app-border ${r.include ? '' : 'opacity-50'}`}>
                    <td className="p-2 align-middle">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={() => toggle(r.id)}
                        aria-label={`Include ${r.description}`}
                        className="accent-[color:var(--primary)]"
                      />
                    </td>
                    <td className="p-2 align-middle">
                      <select
                        value={r.type}
                        onChange={(e) => setType(r.id, e.target.value as TxnType)}
                        aria-label={`Type for ${r.description}`}
                        className={`bg-surface border rounded-md px-1.5 py-1 text-[11px] font-semibold focus:outline-none focus:ring-2 focus:ring-primary/50 ${r.type === 'income' ? 'text-ok border-ok/40' : 'text-app-text border-app-border'}`}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                    </td>
                    <td className="p-2 align-middle tabular-nums whitespace-nowrap text-app-muted">{r.date}</td>
                    <td className="p-2 align-middle">
                      <span className="text-app-text">{r.description || '—'}</span>
                      {r.duplicate && (
                        <span className="ml-1.5 rounded bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">Dup</span>
                      )}
                    </td>
                    <td className={`p-2 align-middle text-right tabular-nums whitespace-nowrap ${r.type === 'income' ? 'text-ok' : 'text-app-text'}`}>
                      {r.type === 'income' ? '+' : ''}{formatCurrency(r.amount, displayCurrency, conversionRate)}
                    </td>
                    <td className="p-2 align-middle">
                      <select
                        value={catOptions.includes(r.category) ? r.category : 'Other'}
                        onChange={(e) => setCategory(r.id, e.target.value)}
                        aria-label={`Category for ${r.description}`}
                        className="bg-surface border border-app-border rounded-md px-2 py-1 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50 max-w-[9rem]"
                      >
                        {catOptions.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Button size="sm" onClick={doImport} disabled={selected.length === 0}>
          Import {selected.length} transaction{selected.length === 1 ? '' : 's'}
        </Button>
      </div>
    );
  }

  // --- UPLOAD STAGE ---
  return (
    <div className="rounded-xl border border-app-border bg-surface-2 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-app-text">Bank statement · CSV or PDF</p>
        <p className="text-[11px] text-app-muted mt-0.5">Upload a CSV (you map the columns) or a PDF (read by AI). Both expenses and income are detected — you'll review every transaction, its type and category, before importing.</p>
      </div>

      <input
        type="file"
        accept=".csv,.pdf"
        onChange={onFile}
        aria-label="Bank statement CSV or PDF file"
        className="w-full text-xs text-app-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-on-primary file:text-xs file:font-semibold"
      />
      {fileName && <p className="text-[11px] text-app-muted">Loaded: {fileName}</p>}
      {parsingPdf && (
        <p className="text-[11px] text-primary flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Reading statement with AI…
        </p>
      )}
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

          {csvPreview && (
            <p className="text-[11px] text-app-muted tabular-nums">
              {ready
                ? `${csvPreview.imported} transaction(s) ready · ${csvPreview.skipped} skipped`
                : 'Map the date, amount, and description columns to continue.'}
            </p>
          )}

          <Button size="sm" onClick={reviewCsv} disabled={!csvPreview || csvPreview.imported === 0}>
            Review {csvPreview?.imported || 0} transaction{(csvPreview?.imported || 0) === 1 ? '' : 's'}
          </Button>
        </>
      )}
    </div>
  );
};

export default BankStatementImport;
