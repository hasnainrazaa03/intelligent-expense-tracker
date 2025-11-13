// FIX: Corrected the jsPDF import to use a default import.
// The previous named import was causing issues with TypeScript's module augmentation,
// leading to the "module 'jspdf' cannot be found" error. The default import is
// the standard for jsPDF and resolves this module augmentation issue.
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Expense, Budget } from '../types';

// Augment jsPDF with the autoTable method
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

const generateCsv = (items: any[], filename: string) => {
  if (items.length === 0) return;
  
  const headers = Object.keys(items[0]);
  const csvRows = [
    headers.join(','),
    ...items.map(row => 
      headers.map(fieldName => JSON.stringify(row[fieldName])).join(',')
    )
  ];
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const generatePdf = (expenses: Expense[], budgets: Budget[], dateRange: string, filename: string) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Financial Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Date Range: ${dateRange}`, 14, 29);

    if (expenses.length > 0) {
        doc.setFontSize(14);
        doc.text('Expenses', 14, 45);
        doc.autoTable({
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
        });
    }

    if (budgets.length > 0) {
        const lastTableY = (doc as any).lastAutoTable.finalY || 45;
        doc.setFontSize(14);
        doc.text('Budgets', 14, lastTableY + 15);
        doc.autoTable({
            startY: lastTableY + 20,
            head: [['Category', 'Budgeted Amount (USD)']],
            body: budgets.map(b => [b.category, `$${b.amount.toFixed(2)}`]),
            theme: 'striped',
            headStyles: { fillColor: [20, 184, 166] },
        });
    }
    
    doc.save(filename);
}

export const exportData = (
  format: 'csv' | 'pdf',
  includeExpenses: boolean,
  expenses: Expense[],
  includeBudgets: boolean,
  budgets: Budget[],
  dateRangeLabel: string
) => {
    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'csv') {
        if (includeExpenses) {
            generateCsv(expenses, `expenses-${timestamp}.csv`);
        }
        if (includeBudgets) {
            generateCsv(budgets, `budgets-${timestamp}.csv`);
        }
    } else if (format === 'pdf') {
        const expensesToExport = includeExpenses ? expenses : [];
        const budgetsToExport = includeBudgets ? budgets : [];
        if (expensesToExport.length > 0 || budgetsToExport.length > 0) {
            generatePdf(expensesToExport, budgetsToExport, dateRangeLabel, `financial-report-${timestamp}.pdf`);
        }
    }
};