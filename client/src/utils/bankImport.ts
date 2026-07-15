import { Expense } from '../types';

// Import arbitrary bank-statement CSVs by letting the user map columns, instead
// of requiring Orbit's own fixed header layout.

export interface BankColumnMapping {
  date: number;
  description: number;
  amount: number;
  /** Optional category column; falls back to "Other" when absent. */
  category?: number;
}

export type BankDateFormat = 'auto' | 'ymd' | 'mdy' | 'dmy';

/** RFC-4180-ish CSV parse (quoted fields + doubled quotes). Does not support
 *  newlines embedded in quoted fields — rare in bank exports. */
export const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    rows.push(result);
  }
  return rows;
};

const HINTS = {
  date: ['date', 'posted', 'trans'],
  description: ['description', 'payee', 'name', 'memo', 'details', 'narration', 'particular'],
  amount: ['amount', 'debit', 'value', 'withdrawal'],
};

/** Best-effort guess of which columns are which, from the header row. */
export const autoDetectColumns = (headers: string[]): Partial<BankColumnMapping> => {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const find = (hints: string[]) => {
    for (const h of hints) {
      const i = lower.findIndex((x) => x.includes(h));
      if (i >= 0) return i;
    }
    return -1;
  };
  const m: Partial<BankColumnMapping> = {};
  const d = find(HINTS.date); if (d >= 0) m.date = d;
  const desc = find(HINTS.description); if (desc >= 0) m.description = desc;
  const amt = find(HINTS.amount); if (amt >= 0) m.amount = amt;
  const cat = lower.findIndex((x) => x.includes('category')); if (cat >= 0) m.category = cat;
  return m;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Normalize a bank date string to a local calendar `YYYY-MM-DD`, or null. */
export const normalizeBankDate = (raw: string, format: BankDateFormat): string | null => {
  const s = (raw || '').trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parts = s.split(/[/.\-]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;

  let y: string, mo: string, da: string;
  const fourIdx = parts.findIndex((p) => p.length === 4);
  if (format === 'ymd' || (format === 'auto' && fourIdx === 0)) [y, mo, da] = parts;
  else if (format === 'dmy') [da, mo, y] = parts;
  else [mo, da, y] = parts; // mdy (and 'auto' default when year is last)

  let year = Number(y);
  if (year < 100) year += 2000;
  const month = Number(mo);
  const day = Number(da);
  if (!year || !month || !day || month > 12 || day > 31) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
};

export interface BankParseOptions {
  dateFormat: BankDateFormat;
  /** When true, only negative amounts (debits) become expenses; credits skipped. */
  negativeIsExpense: boolean;
}

export interface BankParseResult {
  expenses: Omit<Expense, 'id'>[];
  imported: number;
  skipped: number;
}

/** Turn already-parsed data rows into expenses using the column mapping. */
export const parseBankTransactions = (
  dataRows: string[][],
  mapping: BankColumnMapping,
  opts: BankParseOptions
): BankParseResult => {
  const expenses: Omit<Expense, 'id'>[] = [];
  let skipped = 0;

  for (const cols of dataRows) {
    const rawDesc = cols[mapping.description];
    const rawDate = cols[mapping.date];
    const rawAmt = cols[mapping.amount];

    const num = Number(String(rawAmt ?? '').replace(/[^0-9.\-]/g, ''));
    const date = normalizeBankDate(rawDate || '', opts.dateFormat);

    if (!rawDesc || !date || !Number.isFinite(num) || num === 0) { skipped++; continue; }
    if (opts.negativeIsExpense && num > 0) { skipped++; continue; }

    const amount = Math.abs(num);
    if (amount <= 0) { skipped++; continue; }

    const category = mapping.category != null && cols[mapping.category] ? cols[mapping.category] : 'Other';
    expenses.push({ title: rawDesc.slice(0, 120), amount, category, date, isRecurring: false });
  }

  return { expenses, imported: expenses.length, skipped };
};
