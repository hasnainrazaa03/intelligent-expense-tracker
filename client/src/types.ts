export type Category = string;

export interface Expense {
  id: string;
  title:string;
  amount: number;
  category: Category;
  date: string; // ISO string format: YYYY-MM-DD
  paymentMethod?: string;
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  isRecurring?: boolean;
  tags?: string[];
  metadata?: Record<string, string>;
  taxCategory?: string;
  isTaxDeductible?: boolean;
  splitParticipants?: string[];
  splitShares?: number[];
  receiptText?: string;
  receiptFileName?: string;
}

export interface Income {
  id: string;
  title: string;
  amount: number;
  category: string;
  date: string; // ISO string format: YYYY-MM-DD
  notes?: string;
  originalAmount?: number;
  originalCurrency?: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  type: 'cash' | 'brokerage' | 'crypto' | 'retirement' | 'loan' | 'other';
  value: number;
  asOf: string;
}

export interface Budget {
  category: string;
  amount: number;
}

export interface TuitionInstallment {
  id: number;
  amount: number;
  status: 'paid' | 'unpaid';
  expenseId?: string;
  paidDate?: string;
}

export interface Semester {
  id: string; // e.g., 'fall-2025'
  name: string;
  totalTuition: number;
  installments: TuitionInstallment[];
}
