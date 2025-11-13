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
