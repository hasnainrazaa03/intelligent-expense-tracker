// FIX: Corrected the jsPDF import to use a default import.
// The previous named import was causing issues with TypeScript's module augmentation,
// leading to the "module 'jspdf' cannot be found" error. The default import is
// the standard for jsPDF and resolves this module augmentation issue.
import jsPDF from 'jspdf';
// jspdf-autotable 4+ no longer patches jsPDF's prototype, so `doc.autoTable`
// is undefined; call the exported function with the document instead.
import { autoTable } from 'jspdf-autotable';
import { Expense, Budget } from '../types';
import { todayCalendar } from './dateUtils';

export type ExportFormat = 'csv' | 'pdf' | 'quickbooks' | 'xero' | 'tax_csv';


// RFC 4180 cell encoding: arrays become "a; b", objects become JSON, and any
// value containing a comma, quote, or newline is wrapped in double quotes with
// internal quotes doubled (not backslash-escaped as JSON.stringify did).
export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let str: string;
  if (Array.isArray(value)) str = value.join('; ');
  else if (typeof value === 'object') str = JSON.stringify(value);
  else str = String(value);

  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

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

  const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
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

const generatePdf = (expenses: Expense[], budgets: Budget[], dateRange: string, filename: string) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Financial Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(pdfSafeText(`Date Range: ${dateRange}`), 14, 29);

    if (expenses.length > 0) {
        doc.setFontSize(14);
        doc.text('Expenses', 14, 45);
        autoTable(doc, {
            startY: 50,
            head: [['Date', 'Title', 'Category', 'Amount (USD)']],
            body: expenses.map(e => [
                e.date, 
                e.title, 
                e.category, 
                `$${e.amount.toFixed(2)}`
            ]),
            theme: 'striped',
            headStyles: { fillColor: [20, 184, 166] }, // brand-primary color
            ...pdfSafeCells,
        });
    }

    if (budgets.length > 0) {
        const lastTableY = (doc as any).lastAutoTable.finalY || 45;
        doc.setFontSize(14);
        doc.text('Budgets', 14, lastTableY + 15);
        autoTable(doc, {
            startY: lastTableY + 20,
            head: [['Category', 'Budgeted Amount (USD)']],
            body: budgets.map(b => [b.category, `$${b.amount.toFixed(2)}`]),
            theme: 'striped',
            headStyles: { fillColor: [20, 184, 166] },
            ...pdfSafeCells,
        });
    }
    
    doc.save(filename);
}

export const exportData = (
  format: ExportFormat,
  includeExpenses: boolean,
  expenses: Expense[],
  includeBudgets: boolean,
  budgets: Budget[],
  dateRangeLabel: string
) => {
    const timestamp = todayCalendar();

    if (format === 'csv') {
        if (includeExpenses) {
            generateCsv(expenses, `expenses-${timestamp}.csv`);
        }
        if (includeBudgets) {
            generateCsv(budgets, `budgets-${timestamp}.csv`);
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
        const expensesToExport = includeExpenses ? expenses : [];
        const budgetsToExport = includeBudgets ? budgets : [];
        if (expensesToExport.length > 0 || budgetsToExport.length > 0) {
            generatePdf(expensesToExport, budgetsToExport, dateRangeLabel, `financial-report-${timestamp}.pdf`);
        }
    }
};