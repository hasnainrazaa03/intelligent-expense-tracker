import { Expense } from '../types';

// Import arbitrary bank-statement CSVs by letting the user map columns, instead
// of requiring Orbit's own fixed header layout.

export interface BankColumnMapping {
  date: number;
  description: number;
  /** Single signed amount column. Mutually exclusive with debit/credit. */
  amount?: number;
  /** Separate "money out" column — values are usually printed unsigned. */
  debit?: number;
  /** Separate "money in" column — values are usually printed unsigned. */
  credit?: number;
  /** Optional category column; falls back to "Other" when absent. */
  category?: number;
}

export type BankDateFormat = 'auto' | 'ymd' | 'mdy' | 'dmy';

/** True once the mapping names some column to read the money out of. */
export const hasAmountSource = (m: Partial<BankColumnMapping>): boolean =>
  m.amount != null || m.debit != null || m.credit != null;

/** True once the mapping is complete enough to parse rows. */
export const isMappingReady = (m: Partial<BankColumnMapping>): m is BankColumnMapping =>
  m.date != null && m.description != null && hasAmountSource(m);

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
  // A single signed column. "debit"/"credit" are deliberately absent — those get
  // their own mapping, because a statement that splits them prints both unsigned
  // and treating the debit column as a signed amount drops every row (B1).
  amount: ['amount', 'value'],
  debit: ['debit', 'withdrawal', 'money out', 'paid out', 'charges'],
  credit: ['credit', 'deposit', 'money in', 'paid in'],
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

  // Prefer split debit/credit columns when the statement has them; only fall
  // back to a single signed column otherwise.
  const debit = find(HINTS.debit);
  const credit = find(HINTS.credit);
  if (debit >= 0) m.debit = debit;
  if (credit >= 0) m.credit = credit;
  if (debit < 0 && credit < 0) {
    const amt = find(HINTS.amount); if (amt >= 0) m.amount = amt;
  }

  const cat = lower.findIndex((x) => x.includes('category')); if (cat >= 0) m.category = cat;
  return m;
};

/**
 * Parse one money cell into a signed number, or null when there's no usable
 * value. Handles the notations banks actually print (B3):
 *   "-12.50"   -> -12.5     "1,234.56" -> 1234.56
 *   "(45.00)"  -> -45       accounting parentheses = negative
 *   "45.00-"   -> -45       trailing minus (mainframe exports)
 *   "$45.00 DR"-> -45       DR/DB = debit, CR = credit
 *   ""/"-"/"—" -> null      empty cell in a split debit/credit layout
 */
export const parseAmountCell = (raw: unknown): number | null => {
  let s = String(raw ?? '').trim();
  if (!s) return null;

  let negative = false;

  // Drop a leading currency symbol so the parenthesis check below still sees a
  // bare "(45.00)" in cells printed as "$(45.00)".
  s = s.replace(/^[$€£₹¥\s]+/, '');

  // Accounting parentheses: "(45.00)".
  const paren = s.match(/^\(\s*(.*?)\s*\)$/);
  if (paren) { negative = true; s = paren[1]; }

  // DR/DB (money out) and CR (money in) suffixes or prefixes.
  if (/(^|\s)(dr|db)(\s|$)/i.test(s)) negative = true;
  s = s.replace(/(^|\s)(dr|db|cr)(\s|$)/gi, ' ');

  // Trailing minus: "45.00-".
  if (/-\s*$/.test(s)) { negative = true; s = s.replace(/-\s*$/, ''); }

  const cleaned = s.replace(/[^0-9.\-]/g, '');
  // Needs at least one digit, and a lone/interior "-" (e.g. "1-2") is not a number.
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;

  return negative ? -Math.abs(n) : n;
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
  /**
   * 'auto'     — the sign (or the debit/credit column) decides: money out becomes
   *              an expense, money in becomes income. Matches the PDF/AI path.
   * 'expenses' — every row is an expense at absolute value. For card exports
   *              where purchases are printed unsigned.
   */
  signMode: 'auto' | 'expenses';
}

export type BankTxnType = 'expense' | 'income';

export interface BankTransaction {
  type: BankTxnType;
  date: string;
  description: string;
  /** Always a positive magnitude. */
  amount: number;
  category: string;
}

/** Tally of why rows were dropped, so the UI can explain an empty result
 *  instead of silently showing "0 transactions" (B1). */
export interface BankSkipReasons {
  noDescription: number;
  badDate: number;
  badAmount: number;
}

export interface BankParseResult {
  transactions: BankTransaction[];
  /** Expense rows only, in the shape the importer submits. */
  expenses: Omit<Expense, 'id'>[];
  imported: number;
  skipped: number;
  skipReasons: BankSkipReasons;
}

/** Turn already-parsed data rows into transactions using the column mapping. */
export const parseBankTransactions = (
  dataRows: string[][],
  mapping: BankColumnMapping,
  opts: BankParseOptions
): BankParseResult => {
  const transactions: BankTransaction[] = [];
  const skipReasons: BankSkipReasons = { noDescription: 0, badDate: 0, badAmount: 0 };
  let skipped = 0;

  const splitColumns = mapping.debit != null || mapping.credit != null;

  for (const cols of dataRows) {
    const rawDesc = cols[mapping.description];
    const rawDate = cols[mapping.date];

    // Read the signed amount from either a split debit/credit pair or a single
    // signed column. In the split layout the value is normally unsigned, so the
    // column it sits in — not its sign — determines the direction.
    let signed: number | null;
    if (splitColumns) {
      const debit = mapping.debit != null ? parseAmountCell(cols[mapping.debit]) : null;
      const credit = mapping.credit != null ? parseAmountCell(cols[mapping.credit]) : null;
      if (debit != null && debit !== 0) signed = -Math.abs(debit);
      else if (credit != null && credit !== 0) signed = Math.abs(credit);
      else signed = null;
    } else {
      signed = parseAmountCell(cols[mapping.amount!]);
    }

    const date = normalizeBankDate(rawDate || '', opts.dateFormat);

    if (!rawDesc) { skipped++; skipReasons.noDescription++; continue; }
    if (!date) { skipped++; skipReasons.badDate++; continue; }
    if (signed == null || signed === 0) { skipped++; skipReasons.badAmount++; continue; }

    const type: BankTxnType = opts.signMode === 'expenses' || signed < 0 ? 'expense' : 'income';
    const category = mapping.category != null && cols[mapping.category] ? cols[mapping.category] : 'Other';

    transactions.push({
      type,
      date,
      description: rawDesc.slice(0, 120),
      amount: Math.abs(signed),
      category,
    });
  }

  const expenses: Omit<Expense, 'id'>[] = transactions
    .filter((t) => t.type === 'expense')
    .map((t) => ({ title: t.description, amount: t.amount, category: t.category, date: t.date, isRecurring: false }));

  return { transactions, expenses, imported: transactions.length, skipped, skipReasons };
};
