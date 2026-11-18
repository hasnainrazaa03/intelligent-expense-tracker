// FIX: Corrected the jsPDF import to use a default import.
// The previous named import was causing issues with TypeScript's module augmentation,
// leading to the "module 'jspdf' cannot be found" error. The default import is
// the standard for jsPDF and resolves this module augmentation issue.
import jsPDF from 'jspdf';
// jspdf-autotable 4+ no longer patches jsPDF's prototype, so `doc.autoTable`
// is undefined; call the exported function with the document instead.
import { autoTable } from 'jspdf-autotable';
import { Expense, Budget, Income } from '../types';
import { todayCalendar } from './dateUtils';
import { transactionsToCsv } from './transactionsCsv';
import { escapeCsvCell, downloadText } from './csv';

export { escapeCsvCell };

export type ExportFormat = 'csv' | 'pdf' | 'quickbooks' | 'xero' | 'tax_csv';

const generateCsv = (items: any[], filename: string) => {
  if (items.length === 0) return;

  // Union of keys across all rows so optional fields present only on later rows
  // aren't silently dropped (headers previously came from the first row only).
  const headerSet = new Set<string>();
  items.forEach((row) => Object.keys(row).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);

  const csvRows = [
    headers.map(escapeCsvCell).join(','),
    ...items.map((row) => headers.map((field) => escapeCsvCell(row[field])).join(',')),
  ];

  downloadText(csvRows.join('\r\n'), filename);
};

// jsPDF's built-in Helvetica only covers Windows-1252. One character outside it
// (₹, Hindi text, an emoji) made jsPDF write the WHOLE string as two-byte text,
// so a cell like "₹1,234.00" printed as spaced-out garbage (F21). Spell the
// rupee as "Rs" and replace anything else unencodable with "?", keeping the
// rest of the text readable. Currency symbols Helvetica lacks (every one the
// currency picker can produce) become their code instead.
const CP1252_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const PDF_CURRENCY_SYMBOLS: Record<string, string> = { '₹': 'Rs ', '₪': 'ILS ', '₩': 'KRW ', '₱': 'PHP ', '₫': 'VND ' };
export const pdfSafeText = (value: unknown): string => {
  let out = '';
  const text = String(value ?? '')
    .replace(/[₹₪₩₱₫]\s?/g, (m) => PDF_CURRENCY_SYMBOLS[m.trim()])
    .replace(/[\u2009\u202f]/g, ' ');
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    out += code < 0x80 || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRAS.has(ch) ? ch : '?';
  }
  return out;
};

/** autoTable hook: run every head/body cell through pdfSafeText (before widths are measured). */
export const pdfSafeCells = { didParseCell: (data: { cell: { text: string[] } }) => { data.cell.text = data.cell.text.map(pdfSafeText); } };

const BRAND: [number, number, number] = [20, 184, 166];

/** What to export, already narrowed to the chosen period and sections. */
export interface ExportSelection {
  expenses: Expense[];
  incomes: Income[];
  budgets: Budget[];
}

const generatePdf = ({ expenses, incomes, budgets }: ExportSelection, dateRange: string, filename: string) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Financial Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(pdfSafeText(`Date Range: ${dateRange}`), 14, 29);

    // Each section starts below the previous table (or the header). Budgets
    // used to read lastAutoTable unguarded, which threw with no expense table.
    let y = 37;
    const section = (title: string, head: string[], body: string[][]) => {
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text(title, 14, y + 8);
        autoTable(doc, { startY: y + 13, head: [head], body, theme: 'striped', headStyles: { fillColor: BRAND }, ...pdfSafeCells });
        y = ((doc as any).lastAutoTable?.finalY ?? y + 13) + 4;
    };

    if (expenses.length > 0) {
        section('Expenses', ['Date', 'Title', 'Category', 'Amount (USD)'], expenses.map((e) => [e.date, e.title, e.category, `$${e.amount.toFixed(2)}`]));
    }
    if (incomes.length > 0) {
        section('Income', ['Date', 'Title', 'Category', 'Amount (USD)'], incomes.map((i) => [i.date, i.title, i.category, `$${i.amount.toFixed(2)}`]));
    }
    if (budgets.length > 0) {
        section('Budgets', ['Category', 'Budgeted Amount (USD)'], budgets.map((b) => [b.category, `$${b.amount.toFixed(2)}`]));
    }

    doc.save(filename);
};

export const exportData = (format: ExportFormat, selection: ExportSelection, dateRangeLabel: string) => {
    const timestamp = todayCalendar();
    const { expenses, incomes, budgets } = selection;

    if (format === 'csv') {
        // One file for expenses AND incomes, in the shape the importer reads
        // back (round trip, improvement 17).
        if (expenses.length > 0 || incomes.length > 0) {
            downloadText(transactionsToCsv(expenses, incomes), `transactions-${timestamp}.csv`);
        }
        if (budgets.length > 0) {
            generateCsv(budgets.map((b) => ({ category: b.category, amount: b.amount })), `budgets-${timestamp}.csv`);
        }
    } else if (format === 'tax_csv') {
        const taxRows = expenses
          .filter((expense) => expense.isTaxDeductible)
          .map((expense) => ({
            date: expense.date,
            category: expense.taxCategory || expense.category,
            title: expense.title,
            amount: expense.amount,
            notes: expense.notes || '',
          }));
        generateCsv(taxRows, `tax-report-${timestamp}.csv`);
    } else if (format === 'quickbooks') {
        const qbRows = expenses.map((expense) => ({
          Date: expense.date,
          Description: expense.title,
          Category: expense.category,
          Amount: expense.amount,
          Memo: expense.notes || '',
        }));
        generateCsv(qbRows, `quickbooks-adapter-${timestamp}.csv`);
    } else if (format === 'xero') {
        const xeroRows = expenses.map((expense) => ({
          Date: expense.date,
          Payee: expense.title,
          Description: expense.notes || expense.title,
          Reference: expense.category,
          Amount: expense.amount,
        }));
        generateCsv(xeroRows, `xero-adapter-${timestamp}.csv`);
    } else if (format === 'pdf') {
        if (expenses.length > 0 || incomes.length > 0 || budgets.length > 0) {
            generatePdf(selection, dateRangeLabel, `financial-report-${timestamp}.pdf`);
        }
    }
};