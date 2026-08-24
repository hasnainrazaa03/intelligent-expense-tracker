import React, { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Expense, Income } from '../types';
import { Button } from './ui';
import { APP_CONFIG } from '../config';
import { ALL_SUBCATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from '../constants';
import { suggestCategory } from '../services/categorySuggestionService';
import { formatCurrency } from '../utils/currencyUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import { parseStatement, enrichTransaction, enrichTransactions } from '../services/api';
import { PencilIcon, SparklesIcon } from './Icons';
import {
  parseCsvRows,
  autoDetectColumns,
  parseBankTransactions,
  isMappingReady,
  type BankColumnMapping,
  type BankDateFormat,
  type BankParseOptions,
} from '../utils/bankImport';

export interface StatementImportPayload {
  expenses: Omit<Expense, 'id'>[];
  incomes: Omit<Income, 'id'>[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingExpenses: Expense[];
  existingIncomes: Income[];
  onImport: (payload: StatementImportPayload) => void;
}

type TxnType = 'income' | 'expense';
type MappingKey = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'category';

const MAPPING_FIELDS: Array<{ key: MappingKey; label: string; hint?: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount', hint: 'single signed column' },
  { key: 'debit', label: 'Debit / money out', hint: 'if split' },
  { key: 'credit', label: 'Credit / money in', hint: 'if split' },
  { key: 'category', label: 'Category', hint: 'optional' },
];

// The server caps AI statement text at 1MB; keep the client in step so the
// "Read with AI" option is only offered when it can actually succeed.
const MAX_AI_CSV_CHARS = 1_000_000;

interface Row {
  id: string;
  type: TxnType;
  date: string;
  description: string;
  amount: number;
  category: string;
  paymentMethod: string;
  notes: string;
  tagsInput: string;
  isRecurring: boolean;
  include: boolean;
  duplicate: boolean;
  enriching: boolean;
  expanded: boolean;
}

const dupeKey = (date: string, amount: number, description: string) =>
  `${date}|${Math.round(amount * 100)}|${description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24)}`;

/** Count occurrences of each key, so duplicate detection is a MULTISET match:
 *  if you genuinely have two identical same-day charges on file, a statement
 *  holding two only flags two — not every future one (B7). */
const countKeys = (items: Array<{ date: string; amount: number; title?: string }>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const it of items) {
    const k = dupeKey(it.date, Number(it.amount), it.title || '');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
};

const defaultCategoryFor = (type: TxnType, description: string): string =>
  type === 'income' ? 'Other' : (suggestCategory(description) || 'Other');

const parseTags = (s: string): string[] => s.split(',').map((t) => t.trim()).filter(Boolean);

const fieldSm = 'w-full bg-surface border border-app-border rounded-md px-2 py-1.5 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50';

const StatementImportModal: React.FC<Props> = ({ isOpen, onClose, existingExpenses, existingIncomes, onImport }) => {
  const { displayCurrency, conversionRate } = useCurrency();

  const [fileName, setFileName] = useState('');
  // Which real-world account this statement belongs to. Stamped onto every row
  // from this file, so two cards that are both "Credit Card" stay apart.
  const [account, setAccount] = useState(() => {
    try { return localStorage.getItem('stmtLastAccount') || ''; } catch { return ''; }
  });
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfMinimized, setPdfMinimized] = useState(false);
  const [pdfPct, setPdfPct] = useState(() => {
    const v = Number(localStorage.getItem('stmtPdfPct'));
    return v >= 25 && v <= 60 ? v : 42;
  });
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const latestPct = useRef(pdfPct);

  // Drag the divider to resize the PDF pane (25%–60%). Pointer capture keeps the
  // drag reliable even when the cursor crosses the PDF iframe, and pointerup /
  // pointercancel always end it — so the handle can't get "stuck" resizing.
  const onHandlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizing.current = true;
    document.body.style.userSelect = 'none';
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!resizing.current) return;
    const box = paneRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const pct = Math.max(25, Math.min(60, ((box.right - e.clientX) / box.width) * 100));
    latestPct.current = pct;
    setPdfPct(pct);
  };
  const endResize = (e: React.PointerEvent) => {
    if (!resizing.current) return;
    resizing.current = false;
    document.body.style.userSelect = '';
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    try { localStorage.setItem('stmtPdfPct', String(Math.round(latestPct.current))); } catch { /* ignore */ }
  };

  const bulkSetCategory = (cat: string) => {
    if (!cat) return;
    const isIncomeCat = INCOME_CATEGORIES.includes(cat);
    setRows((rs) => rs!.map((r) =>
      r.include && ((isIncomeCat && r.type === 'income') || (!isIncomeCat && r.type === 'expense'))
        ? { ...r, category: cat }
        : r
    ));
  };

  // CSV mapping state.
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [csvText, setCsvText] = useState<string>('');
  const [mapping, setMapping] = useState<Partial<BankColumnMapping>>({});
  const [dateFormat, setDateFormat] = useState<BankDateFormat>('auto');
  const [signMode, setSignMode] = useState<BankParseOptions['signMode']>('auto');

  // Accounts already in use, so the input can suggest them instead of relying on
  // the user retyping the exact same label (which would split one card in two).
  const knownAccounts = useMemo(() => {
    const set = new Set<string>();
    for (const e of existingExpenses) if (e.account) set.add(e.account);
    for (const i of existingIncomes) if (i.account) set.add(i.account);
    return [...set].sort();
  }, [existingExpenses, existingIncomes]);

  const existingExpenseKeys = useMemo(() => countKeys(existingExpenses), [existingExpenses]);
  const existingIncomeKeys = useMemo(() => countKeys(existingIncomes), [existingIncomes]);

  const resetAll = () => {
    setFileName(''); setPdfUri(null); setPdfMinimized(false); setParsing(false);
    setError(null); setRows(null); setHeaders(null); setDataRows([]); setCsvText(''); setMapping({});
  };
  const close = () => { resetAll(); onClose(); };

  const buildRows = (
    items: Array<{ type?: string; date: string; description: string; amount: number; category?: string; paymentMethod?: string }>
  ): Row[] => {
    // Consume from a copy of the existing-key counts so N identical charges on
    // file only mask N incoming rows, not every one that follows (B7).
    const remaining = new Map<string, number>([
      ...[...existingExpenseKeys].map(([k, n]) => [`e:${k}`, n] as [string, number]),
      ...[...existingIncomeKeys].map(([k, n]) => [`i:${k}`, n] as [string, number]),
    ]);
    return [...items]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((it, i) => {
        const type: TxnType = it.type === 'income' ? 'income' : 'expense';
        const validCats = type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
        const aiCat = it.category && it.category !== 'Other' && validCats.includes(it.category) ? it.category : null;
        const category = aiCat || defaultCategoryFor(type, it.description);
        const key = `${type === 'income' ? 'i' : 'e'}:${dupeKey(it.date, it.amount, it.description)}`;
        const left = remaining.get(key) || 0;
        const duplicate = left > 0;
        if (duplicate) remaining.set(key, left - 1);
        return {
          id: `${i}-${it.date}-${it.amount}`,
          type, date: it.date, description: it.description, amount: it.amount, category,
          paymentMethod: it.paymentMethod || '', notes: '', tagsInput: '', isRecurring: false,
          include: !duplicate, duplicate, enriching: false, expanded: false,
        };
      });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith('.csv');
    const isPdf = name.endsWith('.pdf');
    if (!isCsv && !isPdf) { setError('Please choose a .csv or .pdf file.'); return; }
    if (file.size > APP_CONFIG.maxImportFileSizeBytes) { setError('That file is too large.'); return; }
    setError(null); setFileName(file.name); setRows(null); setHeaders(null); setPdfUri(null); setCsvText('');

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = String(ev.target?.result || '');
        const parsed = parseCsvRows(text);
        if (parsed.length < 2) { setError('This CSV has no data rows.'); return; }
        setCsvText(text);
        setHeaders(parsed[0]);
        setDataRows(parsed.slice(1, 1 + APP_CONFIG.maxCsvImportRows));
        setMapping(autoDetectColumns(parsed[0]));
      };
      reader.onerror = () => setError('Could not read that file.');
      reader.readAsText(file);
      return;
    }

    setParsing(true);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(file);
      });
      setPdfUri(dataUri);
      const { account: detected, transactions } = await parseStatement({ pdf: dataUri });
      if (!transactions.length) { setError('No transactions were found in that PDF.'); return; }
      // Prefill from the statement header, but never clobber a label the user
      // already typed for this import.
      if (detected && !account.trim()) setAccount(detected);
      setRows(buildRows(transactions));
    } catch (err: any) {
      setError(
        err?.status === 503
          ? 'AI parsing isn’t configured on the server.'
          : (err?.status === 500 || err?.status === 429)
            ? 'The AI couldn’t process this statement just now — it may be large or the service is busy. Wait a moment and try again, or upload a CSV export.'
            : 'Could not read that PDF. Try a CSV export instead.'
      );
    } finally {
      setParsing(false);
    }
  };

  const ready = isMappingReady(mapping);
  const csvPreview = useMemo(() => {
    if (!ready || headers == null) return null;
    return parseBankTransactions(dataRows, mapping as BankColumnMapping, { dateFormat, signMode });
  }, [ready, headers, dataRows, mapping, dateFormat, signMode]);

  const reviewCsv = () => {
    if (!csvPreview || csvPreview.imported === 0) return;
    setRows(buildRows(csvPreview.transactions));
  };

  // B2: run the CSV through the same AI parser the PDF path uses, so credit-card
  // payments and internal transfers are excluded and income is detected. The
  // column mapper below stays as a no-AI fallback.
  const aiCsvAvailable = csvText.length > 0 && csvText.length <= MAX_AI_CSV_CHARS;
  const readCsvWithAi = async () => {
    if (!aiCsvAvailable) return;
    setParsing(true); setError(null);
    try {
      const { account: detected, transactions } = await parseStatement({ csvText });
      if (!transactions.length) { setError('No transactions were found in that CSV.'); return; }
      if (detected && !account.trim()) setAccount(detected);
      setRows(buildRows(transactions));
    } catch (err: any) {
      setError(
        err?.status === 503
          ? 'AI parsing isn’t configured on the server — map the columns below instead.'
          : 'The AI couldn’t read this CSV just now. Map the columns below instead.'
      );
    } finally {
      setParsing(false);
    }
  };

  // Explain an empty column-mapped result instead of showing a dead button (B1).
  const skipHint = useMemo(() => {
    if (!csvPreview || csvPreview.imported > 0) return null;
    const { noDescription, badDate, badAmount } = csvPreview.skipReasons;
    if (badAmount >= badDate && badAmount >= noDescription) {
      return 'No usable amounts were found in that column. If your statement splits money out and money in, map both the Debit and Credit columns.';
    }
    if (badDate >= noDescription) return 'The dates in that column couldn’t be read — try setting the date format explicitly.';
    return 'The description column looks empty — pick the column holding the merchant or payee.';
  }, [csvPreview]);

  // --- Row mutations ---
  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setType = (id: string, type: TxnType) => setRows((rs) => rs!.map((r) => {
    if (r.id !== id) return r;
    const validCats = type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
    const category = validCats.includes(r.category) ? r.category : defaultCategoryFor(type, r.description);
    return { ...r, type, category, paymentMethod: type === 'income' ? '' : r.paymentMethod };
  }));
  const setAll = (include: boolean) => setRows((rs) => rs!.map((r) => ({ ...r, include })));

  const enrichRow = async (row: Row) => {
    patch(row.id, { enriching: true });
    try {
      const { details } = await enrichTransaction({ type: row.type, description: row.description, amount: row.amount, category: row.category });
      setRows((rs) => rs!.map((r) => {
        if (r.id !== row.id) return r;
        const validCats = r.type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
        return {
          ...r,
          notes: details.notes || r.notes,
          tagsInput: details.tags.length ? details.tags.join(', ') : r.tagsInput,
          category: details.category && validCats.includes(details.category) ? details.category : r.category,
          paymentMethod: r.type === 'expense' ? (r.paymentMethod || details.paymentMethod || '') : '',
          expanded: true,
          enriching: false,
        };
      }));
    } catch {
      patch(row.id, { enriching: false });
      toast.error('Could not generate details for that row.');
    }
  };

  const enrichAll = async () => {
    if (!rows) return;
    const included = rows.filter((r) => r.include);
    if (included.length === 0) return;
    setEnrichingAll(true);
    try {
      // ONE batched call for the whole list — avoids firing N requests and
      // tripping the provider's per-minute rate limit.
      const { details } = await enrichTransactions(
        included.map((r) => ({ type: r.type, description: r.description, amount: r.amount, category: r.category }))
      );
      const byIndex = new Map(details.map((d) => [d.i, d]));
      setRows((rs) => rs!.map((r) => {
        const idx = included.findIndex((x) => x.id === r.id);
        const d = idx >= 0 ? byIndex.get(idx) : undefined;
        if (!d) return r;
        const validCats = r.type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
        return {
          ...r,
          notes: d.notes || r.notes,
          tagsInput: d.tags.length ? d.tags.join(', ') : r.tagsInput,
          category: d.category && validCats.includes(d.category) ? d.category : r.category,
          // Keep the payment method the statement parser inferred from the raw
          // text (it saw "Debit Card"/"POS"/"ACH"); only fill from AI if empty.
          paymentMethod: r.type === 'expense' ? (r.paymentMethod || d.paymentMethod || '') : '',
        };
      }));
      const filled = included.filter((r) => byIndex.has(included.indexOf(r))).length;
      toast.success(filled >= included.length ? 'Details generated.' : `Filled ${filled} of ${included.length}.`);
    } catch {
      toast.error('Could not generate details. Try again in a moment.');
    } finally {
      setEnrichingAll(false);
    }
  };

  const doImport = () => {
    if (!rows) return;
    const sel = rows.filter((r) => r.include);
    const expenses: Omit<Expense, 'id'>[] = sel.filter((r) => r.type === 'expense').map((r) => ({
      title: r.description.slice(0, 120),
      amount: r.amount,
      category: r.category,
      date: r.date,
      paymentMethod: r.paymentMethod || undefined,
      notes: r.notes || undefined,
      tags: parseTags(r.tagsInput),
      isRecurring: r.isRecurring,
      account: account.trim() || undefined,
    }));
    const incomes: Omit<Income, 'id'>[] = sel.filter((r) => r.type === 'income').map((r) => ({
      title: r.description.slice(0, 120),
      amount: r.amount,
      category: r.category,
      date: r.date,
      notes: r.notes || undefined,
      tags: parseTags(r.tagsInput),
      account: account.trim() || undefined,
    }));
    if (expenses.length === 0 && incomes.length === 0) return;
    try { localStorage.setItem('stmtLastAccount', account.trim()); } catch { /* ignore */ }
    onImport({ expenses, incomes });
    close();
  };

  if (!isOpen) return null;

  const selected = rows?.filter((r) => r.include) ?? [];
  const dupCount = rows?.filter((r) => r.duplicate).length ?? 0;
  const selExpRows = selected.filter((r) => r.type === 'expense');
  const selIncRows = selected.filter((r) => r.type === 'income');
  const selExp = selExpRows.length;
  const selInc = selIncRows.length;
  const expTotal = selExpRows.reduce((s, r) => s + r.amount, 0);
  const incTotal = selIncRows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="fixed inset-0 z-[100] bg-bg overflow-y-auto" role="region" aria-label="Import bank statement">
      <div className="min-h-full flex flex-col">
        {/* Sticky page header with the primary actions — a real page, not a modal,
            so typing / stray clicks / Escape can't discard in-progress work. */}
        <header className="sticky top-0 z-20 modal-surface border-b border-app-border">
          <div className="max-w-[112rem] mx-auto w-full px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-bold text-app-text leading-tight truncate">Import bank statement</h1>
              <p className="text-[11px] text-app-muted hidden sm:block">Upload a CSV or PDF — expenses and income are detected for review before importing.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {rows && (
                <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-app-muted">
                  <span className="whitespace-nowrap">Account</span>
                  <input
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    list="stmt-account-suggestions"
                    placeholder="e.g. Discover"
                    aria-label="Account or card this statement belongs to"
                    className="w-36 bg-surface border border-app-border rounded-md px-2 py-1.5 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <datalist id="stmt-account-suggestions">
                    {knownAccounts.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </label>
              )}
              <Button variant="secondary" onClick={close}>Cancel</Button>
              {rows && (
                <Button onClick={doImport} disabled={selected.length === 0}>
                  Import {selected.length}{selected.length ? ` (${selExp} exp · ${selInc} inc)` : ''}
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 max-w-[112rem] mx-auto w-full px-4 sm:px-6 py-5">
      {/* UPLOAD STAGE */}
      {!rows && (
        <div className="space-y-4">
          <input
            type="file"
            accept=".csv,.pdf"
            onChange={onFile}
            aria-label="Bank statement CSV or PDF file"
            className="w-full text-sm text-app-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary file:text-sm file:font-semibold"
          />
          {fileName && <p className="text-xs text-app-muted">Loaded: {fileName}</p>}
          {parsing && (
            <p className="text-sm text-primary flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Reading statement with AI…
            </p>
          )}
          {error && <p role="alert" className="text-sm text-danger font-medium">{error}</p>}

          {headers && !parsing && (
            <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-semibold text-app-text">Read this CSV with AI</p>
                <p className="text-[11px] text-app-muted mt-0.5">
                  Recommended. Detects income, cleans up merchant names, and <strong>skips credit-card payments and
                  transfers between your own accounts</strong> — so importing a bank statement and a card statement
                  doesn’t double-count.
                </p>
              </div>
              <Button size="sm" onClick={readCsvWithAi} disabled={!aiCsvAvailable}>
                <SparklesIcon className="h-3.5 w-3.5 mr-1.5" /> Read with AI
              </Button>
              {!aiCsvAvailable && (
                <p className="text-[11px] text-app-muted">This CSV is too large for AI parsing — map the columns below instead.</p>
              )}
            </div>
          )}

          {headers && (
            <div className="space-y-3 rounded-xl border border-app-border bg-surface-2 p-4">
              <div>
                <p className="text-sm font-semibold text-app-text">Or map the columns yourself</p>
                <p className="text-[11px] text-app-muted mt-0.5">
                  No AI. Map either a single signed <em>Amount</em> column, or a separate <em>Debit</em> and{' '}
                  <em>Credit</em> pair if your statement splits them.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {MAPPING_FIELDS.map(({ key, label, hint }) => (
                  <div key={key}>
                    <label className="block text-[11px] text-app-muted mb-1">
                      {label}{hint ? <span className="text-app-faint"> ({hint})</span> : null}
                    </label>
                    <select
                      value={mapping[key] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      className={fieldSm}
                      aria-label={`${label} column`}
                    >
                      <option value="">— none —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-app-muted mb-1">Date format</label>
                  <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as BankDateFormat)} className={fieldSm} aria-label="Date format">
                    <option value="auto">Auto-detect</option>
                    <option value="mdy">MM/DD/YYYY</option>
                    <option value="dmy">DD/MM/YYYY</option>
                    <option value="ymd">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-app-muted mb-1">Money in / money out</label>
                  <select
                    value={signMode}
                    onChange={(e) => setSignMode(e.target.value as BankParseOptions['signMode'])}
                    className={fieldSm}
                    aria-label="How to classify money in and money out"
                  >
                    <option value="auto">Detect income from the sign / column</option>
                    <option value="expenses">Treat every row as an expense</option>
                  </select>
                </div>
              </div>
              {csvPreview && csvPreview.skipped > 0 && csvPreview.imported > 0 && (
                <p className="text-[11px] text-app-muted">{csvPreview.skipped} row{csvPreview.skipped === 1 ? '' : 's'} will be skipped.</p>
              )}
              {skipHint && <p role="alert" className="text-[11px] text-danger font-medium">{skipHint}</p>}
              <Button size="sm" variant="secondary" onClick={reviewCsv} disabled={!csvPreview || csvPreview.imported === 0}>
                Review {csvPreview?.imported || 0} transaction{(csvPreview?.imported || 0) === 1 ? '' : 's'}
              </Button>
            </div>
          )}

          {!headers && !parsing && (
            <p className="text-xs text-app-muted">
              PDF statements are read by AI (with a side-by-side preview to verify). CSV exports can be read by AI too,
              or mapped column-by-column. Both detect expenses <em>and</em> income, and skip credit-card payments so a
              bank statement and a card statement can be imported one after the other without double-counting.
            </p>
          )}
        </div>
      )}

      {/* REVIEW STAGE */}
      {rows && (
        <div ref={paneRef} className="flex">
          {/* Review list */}
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-app-muted tabular-nums">
                {rows.length} detected · {selExp} expense{selExp === 1 ? '' : 's'} · {selInc} income selected
                {selected.length > 0 && (
                  <span className="text-app-faint"> · <span className="text-app-text">{formatCurrency(expTotal, displayCurrency, conversionRate)}</span> out · <span className="text-ok">{formatCurrency(incTotal, displayCurrency, conversionRate)}</span> in</span>
                )}
              </p>
              <div className="flex items-center gap-2.5 text-[11px] flex-wrap">
                <button onClick={() => setAll(true)} className="font-semibold text-primary hover:underline">Select all</button>
                <button onClick={() => setAll(false)} className="font-semibold text-app-faint hover:text-app-text">Clear all</button>
                <select
                  value=""
                  onChange={(e) => { bulkSetCategory(e.target.value); e.target.value = ''; }}
                  aria-label="Set category for selected rows"
                  disabled={selected.length === 0}
                  className="bg-surface border border-app-border rounded-md px-1.5 py-1 text-[11px] text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="">Set category…</option>
                  <optgroup label="Expense">
                    {ALL_SUBCATEGORIES.map((c) => <option key={`e-${c}`} value={c}>{c}</option>)}
                  </optgroup>
                  <optgroup label="Income">
                    {INCOME_CATEGORIES.map((c) => <option key={`i-${c}`} value={c}>{c}</option>)}
                  </optgroup>
                </select>
                {dupCount > 0 && (
                  <label className="inline-flex items-center gap-1.5 font-semibold text-app-muted hover:text-app-text cursor-pointer">
                    <input type="checkbox" checked={hideDuplicates} onChange={(e) => setHideDuplicates(e.target.checked)} className="accent-[color:var(--primary)]" />
                    Hide dups ({dupCount})
                  </label>
                )}
                <button onClick={enrichAll} disabled={enrichingAll} className="font-semibold text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1">
                  <SparklesIcon className="h-3.5 w-3.5" /> {enrichingAll ? 'Generating…' : 'AI-fill all details'}
                </button>
                {pdfUri && pdfMinimized && (
                  <button onClick={() => setPdfMinimized(false)} className="font-semibold text-app-muted hover:text-app-text">Show PDF</button>
                )}
                <button onClick={resetAll} className="font-semibold text-app-faint hover:text-app-text">Start over</button>
              </div>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-11rem)] overflow-y-auto custom-scrollbar pr-1">
              {rows.filter((r) => !hideDuplicates || !r.duplicate).map((r) => {
                const catOptions = r.type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
                return (
                  <div key={r.id} className={`rounded-lg border border-app-border bg-surface-2 p-2.5 ${r.include ? '' : 'opacity-50'}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={r.include} onChange={() => patch(r.id, { include: !r.include })} aria-label={`Include ${r.description}`} className="accent-[color:var(--primary)] flex-shrink-0" />
                      <select
                        value={r.type}
                        onChange={(e) => setType(r.id, e.target.value as TxnType)}
                        aria-label={`Type for ${r.description}`}
                        className={`bg-surface border rounded-md px-1.5 py-1 text-[11px] font-semibold flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/50 ${r.type === 'income' ? 'text-ok border-ok/40' : 'text-app-text border-app-border'}`}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                      <span className="text-[11px] text-app-muted tabular-nums whitespace-nowrap flex-shrink-0">{r.date.slice(5)}</span>
                      <input
                        value={r.description}
                        onChange={(e) => patch(r.id, { description: e.target.value })}
                        aria-label={`Description for ${r.description}`}
                        className="flex-1 min-w-0 bg-transparent text-sm text-app-text focus:outline-none focus:bg-surface rounded px-1 py-0.5"
                      />
                      {r.duplicate && <span className="rounded bg-warn/15 text-warn px-1.5 py-0.5 text-[9px] font-semibold uppercase flex-shrink-0">Dup</span>}
                      <span className={`text-sm tabular-nums whitespace-nowrap flex-shrink-0 ${r.type === 'income' ? 'text-ok' : 'text-app-text'}`}>
                        {r.type === 'income' ? '+' : ''}{formatCurrency(r.amount, displayCurrency, conversionRate)}
                      </span>
                      <select
                        value={catOptions.includes(r.category) ? r.category : 'Other'}
                        onChange={(e) => patch(r.id, { category: e.target.value })}
                        aria-label={`Category for ${r.description}`}
                        className="bg-surface border border-app-border rounded-md px-1.5 py-1 text-xs text-app-text max-w-[8.5rem] flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button
                        onClick={() => enrichRow(r)}
                        disabled={r.enriching}
                        title="Auto-generate details with AI"
                        aria-label={`Generate details for ${r.description}`}
                        className="flex-shrink-0 grid place-items-center w-6 h-6 rounded-md text-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        {r.enriching ? <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => patch(r.id, { expanded: !r.expanded })}
                        title="Edit amount and details"
                        aria-label={`Edit details for ${r.description}`}
                        aria-expanded={r.expanded}
                        className={`flex-shrink-0 grid place-items-center w-6 h-6 rounded-md hover:bg-surface ${r.expanded ? 'text-primary bg-primary/10' : 'text-app-faint hover:text-app-text'}`}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </div>

                    {r.expanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-app-border grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          {/* Amount is editable here because AI can misread digits on
                              messy multi-column PDFs. Positive magnitude; the +/- sign
                              is carried by the row's expense/income type. */}
                          <label className="block text-[10px] text-app-faint uppercase tracking-wide mb-1">Amount ({displayCurrency})</label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-app-muted pointer-events-none">{r.type === 'income' ? '+' : '−'}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              value={Number.isFinite(r.amount) ? r.amount : ''}
                              onChange={(e) => patch(r.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                              aria-label={`Amount for ${r.description}`}
                              className={`${fieldSm} pl-5 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] text-app-faint uppercase tracking-wide mb-1">Notes</label>
                          <input value={r.notes} onChange={(e) => patch(r.id, { notes: e.target.value })} placeholder="Optional note" className={fieldSm} />
                        </div>
                        <div>
                          <label className="block text-[10px] text-app-faint uppercase tracking-wide mb-1">Tags (comma-separated)</label>
                          <input value={r.tagsInput} onChange={(e) => patch(r.id, { tagsInput: e.target.value })} placeholder="e.g. groceries, weekly" className={fieldSm} />
                        </div>
                        {r.type === 'expense' && (
                          <div>
                            <label className="block text-[10px] text-app-faint uppercase tracking-wide mb-1">Payment method</label>
                            <select value={PAYMENT_METHODS.includes(r.paymentMethod) ? r.paymentMethod : ''} onChange={(e) => patch(r.id, { paymentMethod: e.target.value })} className={fieldSm} aria-label={`Payment method for ${r.description}`}>
                              <option value="">Unspecified</option>
                              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                        )}
                        {r.type === 'expense' && (
                          <label className="flex items-center gap-2 text-xs text-app-muted cursor-pointer self-end pb-1.5">
                            <input type="checkbox" checked={r.isRecurring} onChange={(e) => patch(r.id, { isRecurring: e.target.checked })} className="accent-[color:var(--primary)]" />
                            Recurring transaction
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resize handle (drag to widen/narrow the PDF pane) */}
          {pdfUri && !pdfMinimized && (
            <div
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize statement preview"
              className="hidden lg:block w-1.5 mx-1.5 flex-shrink-0 cursor-col-resize rounded-full bg-app-border hover:bg-primary/50 transition-colors touch-none select-none"
            />
          )}

          {/* PDF preview */}
          {pdfUri && !pdfMinimized && (
            <div className="hidden lg:flex flex-col flex-shrink-0" style={{ width: `${pdfPct}%` }}>
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <p className="text-[11px] font-semibold text-app-muted uppercase tracking-wide">Uploaded statement</p>
                <div className="flex items-center gap-3">
                  <a href={pdfUri} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-app-faint hover:text-app-text">Open ↗</a>
                  <button onClick={() => setPdfMinimized(true)} className="text-[11px] font-semibold text-app-faint hover:text-app-text">Minimize</button>
                </div>
              </div>
              <iframe src={pdfUri} title="Uploaded statement" className="w-full h-[calc(100vh-11rem)] rounded-lg border border-app-border bg-white" />
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default StatementImportModal;
