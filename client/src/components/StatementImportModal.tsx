import React, { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Expense, Income } from '../types';
import { Modal, Button } from './ui';
import { APP_CONFIG } from '../config';
import { ALL_SUBCATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from '../constants';
import { suggestCategory } from '../services/categorySuggestionService';
import { formatCurrency } from '../utils/currencyUtils';
import { useCurrency } from '../contexts/CurrencyContext';
import { parseStatement, enrichTransaction } from '../services/api';
import { ChevronUpDownIcon, SparklesIcon } from './Icons';
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingExpenses: Expense[];
  existingIncomes: Income[];
  onImport: (payload: StatementImportPayload) => void;
}

type TxnType = 'income' | 'expense';
type MappingKey = 'date' | 'description' | 'amount' | 'category';

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
  `${date}|${Math.round(amount * 100)}|${description.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`;

const defaultCategoryFor = (type: TxnType, description: string): string =>
  type === 'income' ? 'Other' : (suggestCategory(description) || 'Other');

const parseTags = (s: string): string[] => s.split(',').map((t) => t.trim()).filter(Boolean);

const fieldSm = 'w-full bg-surface border border-app-border rounded-md px-2 py-1.5 text-xs text-app-text focus:outline-none focus:ring-2 focus:ring-primary/50';

const StatementImportModal: React.FC<Props> = ({ isOpen, onClose, existingExpenses, existingIncomes, onImport }) => {
  const { displayCurrency, conversionRate } = useCurrency();

  const [fileName, setFileName] = useState('');
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfMinimized, setPdfMinimized] = useState(false);
  const [pdfPct, setPdfPct] = useState(42);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);

  // Drag the divider to resize the PDF pane (25%–60% of the split).
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const box = paneRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const pct = ((box.right - ev.clientX) / box.width) * 100;
      setPdfPct(Math.max(25, Math.min(60, pct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // CSV mapping state.
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<BankColumnMapping>>({});
  const [dateFormat, setDateFormat] = useState<BankDateFormat>('auto');
  const [negativeIsExpense, setNegativeIsExpense] = useState(true);

  const existingExpenseKeys = useMemo(() => {
    const s = new Set<string>();
    for (const e of existingExpenses) s.add(dupeKey(e.date, Number(e.amount), e.title || ''));
    return s;
  }, [existingExpenses]);
  const existingIncomeKeys = useMemo(() => {
    const s = new Set<string>();
    for (const i of existingIncomes) s.add(dupeKey(i.date, Number(i.amount), i.title || ''));
    return s;
  }, [existingIncomes]);

  const resetAll = () => {
    setFileName(''); setPdfUri(null); setPdfMinimized(false); setParsing(false);
    setError(null); setRows(null); setHeaders(null); setDataRows([]); setMapping({});
  };
  const close = () => { resetAll(); onClose(); };

  const buildRows = (
    items: Array<{ type?: string; date: string; description: string; amount: number; category?: string; paymentMethod?: string }>
  ): Row[] =>
    [...items]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((it, i) => {
        const type: TxnType = it.type === 'income' ? 'income' : 'expense';
        const validCats = type === 'income' ? INCOME_CATEGORIES : ALL_SUBCATEGORIES;
        const aiCat = it.category && it.category !== 'Other' && validCats.includes(it.category) ? it.category : null;
        const category = aiCat || defaultCategoryFor(type, it.description);
        const keys = type === 'income' ? existingIncomeKeys : existingExpenseKeys;
        const duplicate = keys.has(dupeKey(it.date, it.amount, it.description));
        return {
          id: `${i}-${it.date}-${it.amount}`,
          type, date: it.date, description: it.description, amount: it.amount, category,
          paymentMethod: it.paymentMethod || '', notes: '', tagsInput: '', isRecurring: false,
          include: !duplicate, duplicate, enriching: false, expanded: false,
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
    setError(null); setFileName(file.name); setRows(null); setHeaders(null); setPdfUri(null);

    if (isCsv) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseCsvRows(String(ev.target?.result || ''));
        if (parsed.length < 2) { setError('This CSV has no data rows.'); return; }
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
      const { transactions } = await parseStatement({ pdf: dataUri });
      if (!transactions.length) { setError('No transactions were found in that PDF.'); return; }
      setRows(buildRows(transactions));
    } catch (err: any) {
      setError(err?.status === 503 ? 'AI parsing isn’t configured on the server.' : 'Could not read that PDF. Try a CSV export instead.');
    } finally {
      setParsing(false);
    }
  };

  const ready = mapping.date != null && mapping.description != null && mapping.amount != null;
  const csvPreview = useMemo(() => {
    if (!ready || headers == null) return null;
    return parseBankTransactions(dataRows, mapping as BankColumnMapping, { dateFormat, negativeIsExpense });
  }, [ready, headers, dataRows, mapping, dateFormat, negativeIsExpense]);

  const reviewCsv = () => {
    if (!csvPreview || csvPreview.imported === 0) return;
    setRows(buildRows(csvPreview.expenses.map((e) => ({ ...e, type: 'expense', description: e.title }))));
  };

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
          paymentMethod: r.type === 'expense' && details.paymentMethod ? details.paymentMethod : r.paymentMethod,
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
    setEnrichingAll(true);
    // Sequential to stay under the AI rate limit; only the included rows.
    for (const r of rows.filter((x) => x.include)) {
      // read the freshest copy each iteration
      // eslint-disable-next-line no-await-in-loop
      await enrichRow(r);
    }
    setEnrichingAll(false);
    toast.success('Details generated.');
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
    }));
    const incomes: Omit<Income, 'id'>[] = sel.filter((r) => r.type === 'income').map((r) => ({
      title: r.description.slice(0, 120),
      amount: r.amount,
      category: r.category,
      date: r.date,
      notes: r.notes || undefined,
      tags: parseTags(r.tagsInput),
    }));
    if (expenses.length === 0 && incomes.length === 0) return;
    onImport({ expenses, incomes });
    close();
  };

  if (!isOpen) return null;

  const selected = rows?.filter((r) => r.include) ?? [];
  const selExpRows = selected.filter((r) => r.type === 'expense');
  const selIncRows = selected.filter((r) => r.type === 'income');
  const selExp = selExpRows.length;
  const selInc = selIncRows.length;
  const expTotal = selExpRows.reduce((s, r) => s + r.amount, 0);
  const incTotal = selIncRows.reduce((s, r) => s + r.amount, 0);

  const footer = rows ? (
    <>
      <Button variant="secondary" onClick={close}>Cancel</Button>
      <Button onClick={doImport} disabled={selected.length === 0} fullWidth>
        Import {selected.length} transaction{selected.length === 1 ? '' : 's'} ({selExp} exp · {selInc} inc)
      </Button>
    </>
  ) : (
    <Button variant="secondary" onClick={close} fullWidth>Cancel</Button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Import bank statement"
      subtitle="Upload a CSV or PDF — expenses and income are detected for review before importing."
      size={rows && pdfUri && !pdfMinimized ? 'full' : '2xl'}
      footer={footer}
    >
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

          {headers && (
            <div className="space-y-3 rounded-xl border border-app-border bg-surface-2 p-4">
              <p className="text-sm font-semibold text-app-text">Map your CSV columns</p>
              <div className="grid grid-cols-2 gap-2.5">
                {(['date', 'amount', 'description', 'category'] as MappingKey[]).map((key) => (
                  <div key={key}>
                    <label className="block text-[11px] text-app-muted mb-1 capitalize">{key}{key === 'category' ? ' (optional)' : ''}</label>
                    <select
                      value={mapping[key] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      className={fieldSm}
                      aria-label={`${key} column`}
                    >
                      <option value="">{key === 'category' ? '— none —' : 'Select column'}</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2.5 items-end">
                <div>
                  <label className="block text-[11px] text-app-muted mb-1">Date format</label>
                  <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as BankDateFormat)} className={fieldSm} aria-label="Date format">
                    <option value="auto">Auto-detect</option>
                    <option value="mdy">MM/DD/YYYY</option>
                    <option value="dmy">DD/MM/YYYY</option>
                    <option value="ymd">YYYY-MM-DD</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-app-muted pb-1.5 cursor-pointer">
                  <input type="checkbox" checked={negativeIsExpense} onChange={(e) => setNegativeIsExpense(e.target.checked)} className="accent-[color:var(--primary)]" />
                  Negatives are expenses
                </label>
              </div>
              <Button size="sm" onClick={reviewCsv} disabled={!csvPreview || csvPreview.imported === 0}>
                Review {csvPreview?.imported || 0} transaction{(csvPreview?.imported || 0) === 1 ? '' : 's'}
              </Button>
            </div>
          )}

          {!headers && !parsing && (
            <p className="text-xs text-app-muted">
              PDF statements are read by AI (with a side-by-side preview to verify). CSV exports let you map the columns. Both detect expenses <em>and</em> income.
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
              <div className="flex items-center gap-3 text-[11px]">
                <button onClick={() => setAll(true)} className="font-semibold text-primary hover:underline">Select all</button>
                <button onClick={() => setAll(false)} className="font-semibold text-app-faint hover:text-app-text">Clear all</button>
                <button onClick={enrichAll} disabled={enrichingAll} className="font-semibold text-primary hover:underline disabled:opacity-50 inline-flex items-center gap-1">
                  <SparklesIcon className="h-3.5 w-3.5" /> {enrichingAll ? 'Generating…' : 'AI-fill all details'}
                </button>
                {pdfUri && pdfMinimized && (
                  <button onClick={() => setPdfMinimized(false)} className="font-semibold text-app-muted hover:text-app-text">Show PDF</button>
                )}
                <button onClick={resetAll} className="font-semibold text-app-faint hover:text-app-text">Start over</button>
              </div>
            </div>

            <div className="space-y-2 max-h-[62vh] overflow-y-auto custom-scrollbar pr-1">
              {rows.map((r) => {
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
                        aria-label={`${r.expanded ? 'Collapse' : 'Expand'} details for ${r.description}`}
                        aria-expanded={r.expanded}
                        className="flex-shrink-0 grid place-items-center w-6 h-6 rounded-md text-app-faint hover:text-app-text hover:bg-surface"
                      >
                        <ChevronUpDownIcon className="h-4 w-4" />
                      </button>
                    </div>

                    {r.expanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-app-border grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="sm:col-span-2">
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
                            <input value={r.paymentMethod} onChange={(e) => patch(r.id, { paymentMethod: e.target.value })} list="stmt-methods" placeholder="Card, cash…" className={fieldSm} />
                            <datalist id="stmt-methods">{PAYMENT_METHODS.map((m) => <option key={m} value={m} />)}</datalist>
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
              onMouseDown={startResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize statement preview"
              className="hidden lg:block w-1.5 mx-1.5 flex-shrink-0 cursor-col-resize rounded-full bg-app-border hover:bg-primary/50 transition-colors"
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
              <iframe src={pdfUri} title="Uploaded statement" className="w-full h-[66vh] rounded-lg border border-app-border bg-white" />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default StatementImportModal;
